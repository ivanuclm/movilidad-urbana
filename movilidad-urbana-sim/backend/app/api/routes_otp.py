# backend/app/api/routes_otp.py

from datetime import datetime, timezone
import os
from typing import List, Optional

import httpx
import polyline
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/otp", tags=["otp"])

# Si lo tienes en otro puerto, ajusta aquí (tú usas 8080)
OTP_PLAN_URL = os.environ.get(
    "OTP_PLAN_URL",
    "http://localhost:8080/otp/routers/default/plan",
)


class Point(BaseModel):
    lat: float
    lon: float


class OtpRouteRequest(BaseModel):
    origin: Point
    destination: Point
    # índice de itinerario opcional (para paginar desde el frontend)
    itinerary_index: Optional[int] = None
    # fecha (YYYY-MM-DD) y hora (HH:MM) de la consulta; si no vienen, se usan los
    # valores por defecto dentro de la ventana del feed (ver _build_otp_params)
    date: Optional[str] = None
    time: Optional[str] = None


class TransitStop(BaseModel):
    name: str | None = None
    lat: float
    lon: float
    stop_id: str | None = None
    time: str | None = None         # "HH:MM" hora de paso por la parada


class TransitSegment(BaseModel):
    mode: str              # WALK, BUS, etc
    distance_m: float
    duration_s: float
    geometry: List[Point]
    route_id: str | None = None
    route_short_name: str | None = None
    route_long_name: str | None = None
    agency_name: str | None = None
    from_stop_name: str | None = None
    to_stop_name: str | None = None
    departure: str | None = None    # "HH:MM"
    arrival: str | None = None      # "HH:MM"
    # paradas ordenadas del leg (origen + intermedias + destino); solo en legs
    # de transporte público
    stops: List[TransitStop] = []


class TransitResult(BaseModel):
    distance_m: float
    duration_s: float
    geometry: List[Point]          # ruta completa concatenada
    segments: List[TransitSegment] # tramos por modo
    itinerary_index: int
    total_itineraries: int
    start_time: str | None = None  # hora de salida del viaje completo "HH:MM"
    end_time: str | None = None    # hora de llegada del viaje completo "HH:MM"


class TransitRouteResponse(BaseModel):
    origin: Point
    destination: Point
    result: TransitResult

def _ms_to_hhmm(ms: int | float | None, offset_ms: int | float | None = 0) -> str | None:
    """
    Convierte un instante epoch (ms, UTC) en "HH:MM" de hora local. OTP devuelve
    los tiempos en epoch UTC y un `agencyTimeZoneOffset` (ms) por leg; sumando ese
    offset y formateando en UTC se obtiene la hora local de Toledo (Europe/Madrid),
    con el horario de verano ya resuelto por OTP según la fecha.
    """
    if not ms:
        return None
    try:
        dt = datetime.fromtimestamp((ms + (offset_ms or 0)) / 1000.0, tz=timezone.utc)
        return dt.strftime("%H:%M")
    except Exception:
        return None

def _build_otp_params(req: OtpRouteRequest) -> dict:
    # La fecha/hora llega desde el frontend (panel Ajustes). Si no viene, se usa
    # un default dentro de la ventana del feed (GTFS_Urbano_Toledo_2026 cubre
    # 22 feb – 22 may 2026). Fuera de ese rango OTP devolvería solo rutas a pie.
    return {
        "fromPlace": f"{req.origin.lat},{req.origin.lon}",
        "toPlace": f"{req.destination.lat},{req.destination.lon}",
        "mode": "TRANSIT,WALK",
        "date": req.date or "2026-05-21",
        "time": req.time or "12:00",
        "numItineraries": 5,
        # intentamos favorecer el bus frente a ir completamente a pie
        "maxWalkDistance": 2000,      # en metros
        "walkReluctance": 3.0,        # >1 penaliza caminar
        # pedimos las paradas intermedias de cada leg de transporte para poder
        # dibujar el diagrama de paradas del itinerario en el frontend
        "showIntermediateStops": True,
        "locale": "es",
    }


def _pick_itinerary_with_transit(itineraries: list[dict]) -> int:
    """
    Devuelve el índice de la primera itinerary que tenga al menos un leg
    de transporte público. Si no hay ninguna, devuelve 0.
    """

    def has_transit(it: dict) -> bool:
        for leg in it.get("legs", []):
            if leg.get("transitLeg"):
                return True
            mode = (leg.get("mode") or "").upper()
            if mode not in ("WALK", "BICYCLE", "CAR"):
                return True
        return False

    for idx, it in enumerate(itineraries):
        if has_transit(it):
            return idx

    return 0


def _decode_leg_geometry(leg: dict) -> list[Point]:
    geom = leg.get("legGeometry")
    if not geom or not geom.get("points"):
        return []
    coords = polyline.decode(geom["points"])
    return [Point(lat=lat, lon=lon) for (lat, lon) in coords]


def _leg_stop(s: dict, prefer: str, offset_ms: int | float | None = 0) -> TransitStop | None:
    """
    Convierte una parada de OTP (from / to / intermediateStops) en TransitStop.
    `prefer` indica qué hora usar primero: "departure" para la parada de subida
    y las intermedias, "arrival" para la parada de bajada. `offset_ms` es el
    `agencyTimeZoneOffset` del leg, para mostrar la hora en local.
    """
    if not s:
        return None
    lat = s.get("lat")
    lon = s.get("lon")
    if lat is None or lon is None:
        return None
    return TransitStop(
        name=s.get("name"),
        lat=float(lat),
        lon=float(lon),
        stop_id=s.get("stopId"),
        time=_ms_to_hhmm(s.get(prefer) or s.get("arrival") or s.get("departure"), offset_ms),
    )


def _build_segments(itinerary: dict) -> List[TransitSegment]:
    segments: List[TransitSegment] = []

    for leg in itinerary.get("legs", []):
        geometry = _decode_leg_geometry(leg)
        mode = (leg.get("mode") or "").upper()
        distance_m = float(leg.get("distance") or 0.0)
        duration_s = float(leg.get("duration") or 0.0)

        # Datos base del segmento
        seg_kwargs: dict = {
            "mode": mode,
            "distance_m": distance_m,
            "duration_s": duration_s,
            "geometry": geometry,
        }

        # Si es leg de transporte público, añadimos info de línea, paradas y horas
        if leg.get("transitLeg"):
            from_place = leg.get("from") or {}
            to_place = leg.get("to") or {}
            intermediate = leg.get("intermediateStops") or []
            offset_ms = leg.get("agencyTimeZoneOffset") or 0

            # Paradas ordenadas: subida + intermedias + bajada
            stops: List[TransitStop] = []
            first = _leg_stop(from_place, "departure", offset_ms)
            if first is not None:
                stops.append(first)
            for s in intermediate:
                ts = _leg_stop(s, "departure", offset_ms)
                if ts is not None:
                    stops.append(ts)
            last = _leg_stop(to_place, "arrival", offset_ms)
            if last is not None:
                stops.append(last)

            seg_kwargs.update(
                route_id=leg.get("routeId") or leg.get("route"),
                route_short_name=leg.get("routeShortName"),
                route_long_name=leg.get("routeLongName"),
                agency_name=leg.get("agencyName"),
                from_stop_name=from_place.get("name"),
                to_stop_name=to_place.get("name"),
                departure=_ms_to_hhmm(leg.get("startTime"), offset_ms),
                arrival=_ms_to_hhmm(leg.get("endTime"), offset_ms),
                stops=stops,
            )

        segments.append(TransitSegment(**seg_kwargs))

    return segments



@router.post("/routes", response_model=TransitRouteResponse)
async def get_otp_route(req: OtpRouteRequest) -> TransitRouteResponse:
    params = _build_otp_params(req)

    async with httpx.AsyncClient() as client:
        resp = await client.get(OTP_PLAN_URL, params=params, timeout=20.0)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Error al llamar a OTP: {resp.status_code}",
        )

    data = resp.json()
    plan = data.get("plan") or {}
    itineraries: list[dict] = plan.get("itineraries") or []

    if not itineraries:
        raise HTTPException(status_code=404, detail="OTP no ha encontrado rutas")

    # --- ordenar por duración (segundos) de menor a mayor ---
    itineraries = sorted(
        itineraries,
        key=lambda it: float(it.get("duration") or 1e20)
    )

    # Elegimos índice de itinerario
    if req.itinerary_index is not None and 0 <= req.itinerary_index < len(itineraries):
        idx = req.itinerary_index
    else:
        idx = _pick_itinerary_with_transit(itineraries)

    chosen = itineraries[idx]

    # duración total en segundos
    duration_s = float(chosen.get("duration") or 0.0)

    # distancia = suma de distancias de los legs
    distance_m = float(
        sum(float(leg.get("distance") or 0.0) for leg in chosen.get("legs", []))
    )

    segments = _build_segments(chosen)

    # geometría completa = concatenación de los segmentos
    full_geometry: list[Point] = []
    for seg in segments:
        full_geometry.extend(seg.geometry)

    # Horas de salida/llegada del viaje completo, en hora local. Se toma el
    # agencyTimeZoneOffset del primer leg de transporte (todos comparten agencia).
    tz_offset = 0
    for leg in chosen.get("legs", []):
        if leg.get("transitLeg") and leg.get("agencyTimeZoneOffset") is not None:
            tz_offset = leg["agencyTimeZoneOffset"]
            break
    start_time = _ms_to_hhmm(chosen.get("startTime"), tz_offset)
    end_time = _ms_to_hhmm(chosen.get("endTime"), tz_offset)

    return TransitRouteResponse(
        origin=req.origin,
        destination=req.destination,
        result=TransitResult(
            distance_m=distance_m,
            duration_s=duration_s,
            geometry=full_geometry,
            segments=segments,
            itinerary_index=idx,
            total_itineraries=len(itineraries),
            start_time=start_time,
            end_time=end_time,
        ),
    )
