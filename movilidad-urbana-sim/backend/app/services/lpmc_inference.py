from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

import httpx

from app.api.routes_otp import (
    OTP_PLAN_URL,
    OtpRouteRequest,
    Point,
    _build_otp_params,
    _pick_itinerary_with_transit,
)
from app.services.osrm_client import get_route

MODE_LABELS = {
    0: "walk",
    1: "cycle",
    2: "pt",
    3: "drive",
}

# Values used in the professor pipeline after one-hot encoding.
PURPOSE_VALUES = ["B", "HBE", "HBO", "HBW", "NHBO"]
FUELTYPE_VALUES = ["Average", "Diesel", "Hybrid", "Petrol"]

_ARTIFACTS_CACHE: dict[str, Any] | None = None


class KerasModalWrapper:
    """Envuelve un modelo Keras con la interfaz predict_proba de sklearn.

    El bundle joblib solo almacena la ruta al fichero .keras; el modelo
    se carga en memoria la primera vez que se llama a predict_proba.
    """

    def __init__(self, keras_path: str) -> None:
        self._path = str(keras_path)
        self._model: Any = None

    def __getstate__(self) -> dict:
        state = self.__dict__.copy()
        state["_model"] = None
        return state

    def __setstate__(self, state: dict) -> None:
        self.__dict__.update(state)
        self._model = None

    def _ensure_loaded(self) -> None:
        if self._model is None:
            import tensorflow as tf  # noqa: PLC0415
            self._model = tf.keras.models.load_model(self._path)

    def predict_proba(self, x: "np.ndarray") -> "np.ndarray":
        import numpy as np  # noqa: PLC0415
        self._ensure_loaded()
        return self._model.predict(np.asarray(x, dtype=np.float32), verbose=0)

    def predict(self, x: "np.ndarray") -> "np.ndarray":
        import numpy as np  # noqa: PLC0415
        return np.argmax(self.predict_proba(x), axis=1)


def _project_root() -> Path:
    # .../movilidad-urbana-sim/backend/app/services -> .../TFM
    return Path(__file__).resolve().parents[4]


def _resolve_model_paths() -> tuple[Path, Path]:
    model_override = os.environ.get("LPMC_MODEL_PATH")
    scaler_override = os.environ.get("LPMC_SCALER_PATH")

    if model_override and scaler_override:
        return Path(model_override), Path(scaler_override)

    models_dir = _project_root() / "lpmc" / "models"
    variant = os.environ.get("LPMC_MODEL_VARIANT", "nohh").strip().lower()
    if variant == "legacy":
        model_candidates = [
            models_dir / "xgb_lpmc_tuned.joblib",
            models_dir / "xgb_lpmc_baseline.joblib",
        ]
        scaler_candidates = [
            models_dir / "xgb_lpmc_scaler.joblib",
        ]
    elif variant == "rf":
        model_candidates = [
            models_dir / "rf_lpmc_nohh.joblib",
            models_dir / "rf_lpmc.joblib",
        ]
        scaler_candidates = [
            models_dir / "rf_lpmc_scaler_nohh.joblib",
            models_dir / "rf_lpmc_scaler.joblib",
        ]
    elif variant == "dnn":
        model_candidates = [
            models_dir / "dnn_lpmc_nohh.joblib",
            models_dir / "dnn_lpmc.joblib",
        ]
        scaler_candidates = [
            models_dir / "dnn_lpmc_scaler_nohh.joblib",
            models_dir / "dnn_lpmc_scaler.joblib",
        ]
    else:
        # Default: XGBoost sin household_id.
        model_candidates = [
            models_dir / "xgb_lpmc_tuned_nohh.joblib",
            models_dir / "xgb_lpmc_baseline_nohh.joblib",
            # Fallback to legacy artifacts if nohh artifacts are not present.
            models_dir / "xgb_lpmc_tuned.joblib",
            models_dir / "xgb_lpmc_baseline.joblib",
        ]
        scaler_candidates = [
            models_dir / "xgb_lpmc_scaler_nohh.joblib",
            models_dir / "xgb_lpmc_scaler.joblib",
        ]

    model_path = next((p for p in model_candidates if p.exists()), None)
    if model_path is None:
        raise FileNotFoundError(
            f"No se encontro modelo LPMC en: {[str(p) for p in model_candidates]}"
        )

    scaler_path = next((p for p in scaler_candidates if p.exists()), None)
    if scaler_path is None:
        raise FileNotFoundError(
            f"No se encontro scaler LPMC en: {[str(p) for p in scaler_candidates]}"
        )

    return model_path, scaler_path


def _load_artifacts() -> dict[str, Any]:
    global _ARTIFACTS_CACHE
    if _ARTIFACTS_CACHE is not None:
        return _ARTIFACTS_CACHE

    import joblib

    model_path, scaler_path = _resolve_model_paths()
    model_bundle = joblib.load(model_path)
    scaler_bundle = joblib.load(scaler_path)

    # Bundle DNN: contiene keras_path en lugar de model directamente.
    if "keras_path" in model_bundle:
        model = KerasModalWrapper(model_bundle["keras_path"])
    else:
        model = model_bundle["model"]

    _ARTIFACTS_CACHE = {
        "model": model,
        "feature_names": model_bundle["feature_names"],
        "scaler": scaler_bundle["scaler"],
        "scaled_features": scaler_bundle["scaled_features"],
        "model_path": str(model_path),
        "scaler_path": str(scaler_path),
    }
    return _ARTIFACTS_CACHE


async def _fetch_otp_itinerary(
    origin_lat: float,
    origin_lon: float,
    destination_lat: float,
    destination_lon: float,
    itinerary_index: int | None,
) -> dict:
    req = OtpRouteRequest(
        origin=Point(lat=origin_lat, lon=origin_lon),
        destination=Point(lat=destination_lat, lon=destination_lon),
        itinerary_index=itinerary_index,
    )
    params = _build_otp_params(req)

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(OTP_PLAN_URL, params=params)

    if resp.status_code != 200:
        raise RuntimeError(f"Error OTP: {resp.status_code}")

    data = resp.json()
    plan = data.get("plan") or {}
    itineraries: list[dict] = plan.get("itineraries") or []
    if not itineraries:
        raise RuntimeError("OTP no encontro itinerarios")

    itineraries = sorted(itineraries, key=lambda it: float(it.get("duration") or 1e20))

    if itinerary_index is not None and 0 <= itinerary_index < len(itineraries):
        idx = itinerary_index
    else:
        idx = _pick_itinerary_with_transit(itineraries)

    return {
        "itinerary": itineraries[idx],
        "itinerary_index": idx,
        "total_itineraries": len(itineraries),
    }


def _is_transit_leg(leg: dict) -> bool:
    if leg.get("transitLeg"):
        return True
    mode = (leg.get("mode") or "").upper()
    return mode not in ("WALK", "BICYCLE", "CAR")


def _build_route_features(osrm_results: dict[str, dict], otp_itinerary: dict) -> dict[str, float | int]:
    driving = osrm_results["driving"]
    cycling = osrm_results["cycling"]
    foot = osrm_results["foot"]

    itinerary = otp_itinerary["itinerary"]
    legs = itinerary.get("legs", [])

    walk_durations: list[float] = []
    bus_duration = 0.0
    rail_duration = 0.0
    transit_legs_count = 0

    for leg in legs:
        mode = (leg.get("mode") or "").upper()
        dur = float(leg.get("duration") or 0.0)

        if mode == "WALK":
            walk_durations.append(dur)

        if _is_transit_leg(leg):
            transit_legs_count += 1
            if mode == "BUS":
                bus_duration += dur
            elif mode in {"RAIL", "SUBWAY", "TRAM", "METRO", "FUNICULAR"}:
                rail_duration += dur

    total_walk = float(sum(walk_durations))
    first_walk = 0.0
    last_walk = 0.0
    if legs:
        if (legs[0].get("mode") or "").upper() == "WALK":
            first_walk = float(legs[0].get("duration") or 0.0)
        if (legs[-1].get("mode") or "").upper() == "WALK":
            last_walk = float(legs[-1].get("duration") or 0.0)

    inter_walk = max(total_walk - first_walk - last_walk, 0.0)

    # In many OTP outputs this residual is ~0, but keeping it here gives us a
    # bounded proxy for interchange waiting time when present.
    otp_total = float(itinerary.get("duration") or 0.0)
    sum_legs = float(sum(float(leg.get("duration") or 0.0) for leg in legs))
    inter_waiting = max(otp_total - sum_legs, 0.0)

    return {
        "distance": float(driving["distance_m"]),
        "dur_walking": float(foot["duration_s"]),
        "dur_cycling": float(cycling["duration_s"]),
        "dur_driving": float(driving["duration_s"]),
        "dur_pt_access": first_walk,
        "dur_pt_rail": rail_duration,
        "dur_pt_bus": bus_duration,
        "dur_pt_int_waiting": inter_waiting,
        "dur_pt_int_walking": inter_walk,
        "pt_n_interchanges": max(transit_legs_count - 1, 0),
    }


def _build_feature_frame(payload: dict, route_features: dict[str, float | int]):
    import numpy as np

    artifacts = _load_artifacts()
    feature_names: list[str] = artifacts["feature_names"]

    row = {name: 0.0 for name in feature_names}

    # Keep household_id out of the API contract. If a legacy model still
    # contains this feature, neutralize it to a fixed value.
    if "household_id" in row:
        row["household_id"] = 0.0

    direct_numeric = [
        "day_of_week",
        "start_time_linear",
        "age",
        "female",
        "driving_license",
        "car_ownership",
        "cost_transit",
        "cost_driving_total",
    ]
    for col in direct_numeric:
        if col in row and col in payload:
            row[col] = float(payload[col])

    for col, value in route_features.items():
        if col in row:
            row[col] = float(value)

    purpose = payload.get("purpose")
    if purpose in PURPOSE_VALUES:
        key = f"purpose_{purpose}"
        if key in row:
            row[key] = 1.0

    fueltype = payload.get("fueltype")
    if fueltype in FUELTYPE_VALUES:
        key = f"fueltype_{fueltype}"
        if key in row:
            row[key] = 1.0

    x = np.array([[float(row[name]) for name in feature_names]], dtype=float)
    return x, feature_names


def _predict(x, feature_names: list[str]) -> dict:
    import numpy as np

    artifacts = _load_artifacts()
    model = artifacts["model"]
    scaler = artifacts["scaler"]
    scaled_features = [c for c in artifacts["scaled_features"] if c in feature_names]
    feature_index = {name: idx for idx, name in enumerate(feature_names)}

    if scaled_features:
        idxs = [feature_index[c] for c in scaled_features]
        x_scaled_subset = scaler.transform(x[:, idxs])
        x = x.copy()
        x[:, idxs] = x_scaled_subset

    proba = model.predict_proba(x)[0]
    pred_idx = int(np.argmax(proba))

    probabilities = {MODE_LABELS[i]: float(proba[i]) for i in range(min(len(proba), 4))}

    return {
        "predicted_mode": MODE_LABELS.get(pred_idx, str(pred_idx)),
        "confidence": float(np.max(proba)),
        "probabilities": probabilities,
    }


def _build_debug_payload(x, feature_names: list[str], otp: dict, route_features: dict[str, float | int]) -> dict:
    artifacts = _load_artifacts()
    scaler = artifacts["scaler"]
    scaled_features = [c for c in artifacts["scaled_features"] if c in feature_names]
    feature_index = {name: idx for idx, name in enumerate(feature_names)}

    x_scaled = x.copy()
    if scaled_features:
        idxs = [feature_index[c] for c in scaled_features]
        x_scaled_subset = scaler.transform(x_scaled[:, idxs])
        x_scaled[:, idxs] = x_scaled_subset

    raw_map = {name: float(x[0, i]) for i, name in enumerate(feature_names)}
    scaled_map = {name: float(x_scaled[0, i]) for i, name in enumerate(feature_names)}

    return {
        "feature_names": feature_names,
        "raw_features": raw_map,
        "scaled_features": scaled_map,
        "scaled_columns": scaled_features,
        "route_features": route_features,
        "model_info": {
            "model_path": artifacts["model_path"],
            "scaler_path": artifacts["scaler_path"],
            "household_id_strategy": (
                "fixed_zero_legacy_model"
                if "household_id" in feature_names
                else "not_used_in_model_features"
            ),
            "itinerary_index": otp["itinerary_index"],
            "total_itineraries": otp["total_itineraries"],
        },
    }


async def run_lpmc_inference(body: dict) -> dict:
    origin = body["origin"]
    destination = body["destination"]

    driving_task = get_route("driving", origin["lon"], origin["lat"], destination["lon"], destination["lat"])
    cycling_task = get_route("cycling", origin["lon"], origin["lat"], destination["lon"], destination["lat"])
    foot_task = get_route("foot", origin["lon"], origin["lat"], destination["lon"], destination["lat"])
    otp_task = _fetch_otp_itinerary(
        origin["lat"],
        origin["lon"],
        destination["lat"],
        destination["lon"],
        body.get("itinerary_index"),
    )

    driving, cycling, foot, otp = await asyncio.gather(
        driving_task,
        cycling_task,
        foot_task,
        otp_task,
    )

    osrm_results = {
        "driving": driving,
        "cycling": cycling,
        "foot": foot,
    }

    route_features = _build_route_features(osrm_results, otp)

    payload = dict(body["user_profile"])
    x, feature_names = _build_feature_frame(payload, route_features)
    prediction = _predict(x, feature_names)

    artifacts = _load_artifacts()

    return {
        **prediction,
        "route_features": route_features,
        "model_info": {
            "model_path": artifacts["model_path"],
            "scaler_path": artifacts["scaler_path"],
            "household_id_strategy": (
                "fixed_zero_legacy_model"
                if "household_id" in feature_names
                else "not_used_in_model_features"
            ),
            "itinerary_index": otp["itinerary_index"],
            "total_itineraries": otp["total_itineraries"],
        },
    }


async def run_lpmc_debug_features(body: dict) -> dict:
    origin = body["origin"]
    destination = body["destination"]

    driving_task = get_route("driving", origin["lon"], origin["lat"], destination["lon"], destination["lat"])
    cycling_task = get_route("cycling", origin["lon"], origin["lat"], destination["lon"], destination["lat"])
    foot_task = get_route("foot", origin["lon"], origin["lat"], destination["lon"], destination["lat"])
    otp_task = _fetch_otp_itinerary(
        origin["lat"],
        origin["lon"],
        destination["lat"],
        destination["lon"],
        body.get("itinerary_index"),
    )

    driving, cycling, foot, otp = await asyncio.gather(
        driving_task,
        cycling_task,
        foot_task,
        otp_task,
    )

    osrm_results = {
        "driving": driving,
        "cycling": cycling,
        "foot": foot,
    }
    route_features = _build_route_features(osrm_results, otp)
    payload = dict(body["user_profile"])
    x, feature_names = _build_feature_frame(payload, route_features)
    return _build_debug_payload(x, feature_names, otp, route_features)
