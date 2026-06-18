import os
import re
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.services.lpmc_inference import run_lpmc_compare, run_lpmc_debug_features, run_lpmc_inference

router = APIRouter(prefix="/api/lpmc", tags=["lpmc"])


class Point(BaseModel):
    lat: float
    lon: float


class UserProfile(BaseModel):
    # Categorical variables aligned with the LPMC processing pipeline.
    purpose: Literal["B", "HBE", "HBO", "HBW", "NHBO"] = "HBW"
    fueltype: Literal["Average", "Diesel", "Hybrid", "Petrol"] = "Average"

    # Social / contextual variables.
    day_of_week: int = Field(3, ge=1, le=7)
    start_time_linear: float = Field(12.0, ge=0.0, le=24.0)
    age: int = Field(35, ge=16, le=100)
    female: int = Field(0, ge=0, le=1)
    driving_license: int = Field(1, ge=0, le=1)
    car_ownership: int = Field(1, ge=0, le=3)

    # Cost variables used by the model.
    cost_transit: float = Field(1.5, ge=0.0)
    cost_driving_total: float = Field(3.0, ge=0.0)


class LpmcPredictRequest(BaseModel):
    origin: Point
    destination: Point
    user_profile: UserProfile
    itinerary_index: int | None = Field(default=None, ge=0)
    model_variant: str | None = None

    @field_validator("model_variant")
    @classmethod
    def validate_model_variant(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not re.match(r"^[a-z0-9_]{1,32}$", v):
            raise ValueError(
                "model_variant debe contener solo letras minúsculas, dígitos o guiones bajos (máx. 32 chars)"
            )
        return v


class LpmcPredictResponse(BaseModel):
    predicted_mode: Literal["walk", "cycle", "pt", "drive"]
    confidence: float
    probabilities: dict[str, float]
    route_features: dict[str, float | int]
    model_info: dict


@router.post("/predict", response_model=LpmcPredictResponse)
async def predict_lpmc(body: LpmcPredictRequest):
    try:
        result = await run_lpmc_inference(body.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Error interno en inferencia LPMC: {exc}")

    return LpmcPredictResponse(**result)


@router.post("/compare")
async def compare_lpmc_models(body: LpmcPredictRequest):
    try:
        return await run_lpmc_compare(body.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Error interno en comparación LPMC: {exc}")


@router.get("/models")
def list_lpmc_models():
    """Descubre dinámicamente las variantes de modelo disponibles en disco.

    Escanea lpmc/models/ buscando pares {nombre}_lpmc.joblib + {nombre}_lpmc_scaler.joblib.
    Cualquier nombre que siga el convenio aparece como variante disponible, lo que permite
    añadir modelos custom sin modificar el código.
    """
    models_dir = Path(__file__).resolve().parents[4] / "lpmc" / "models"
    available: list[str] = []
    if models_dir.exists():
        for f in sorted(models_dir.glob("*_lpmc.joblib")):
            name = f.stem.removesuffix("_lpmc")
            if name and (models_dir / f"{name}_lpmc_scaler.joblib").exists():
                available.append(name)
    return {
        "available": available,
        "default_variant": os.environ.get("LPMC_MODEL_VARIANT", "xgb").strip().lower(),
    }


@router.post("/debug-features")
async def debug_lpmc_features(body: LpmcPredictRequest):
    try:
        return await run_lpmc_debug_features(body.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Error interno en debug LPMC: {exc}")
