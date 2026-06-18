# backend/app/api/routes_gtfs.py

from __future__ import annotations

from datetime import date as Date, datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services import gtfs_loader


router = APIRouter(prefix="/api/gtfs", tags=["gtfs"])


# -----------------------
# Modelos para la API
# -----------------------
class StopRoute(BaseModel):
    id: str
    short_name: Optional[str] = None
    long_name: Optional[str] = None
    color: Optional[str] = None
    text_color: Optional[str] = None


class GtfsStop(BaseModel):
    id: str
    name: str
    desc: Optional[str] = None
    lat: float
    lon: float
    code: Optional[str] = None
    wheelchair_boarding: Optional[int] = None
    routes: List[StopRoute] = []


class GtfsRoute(BaseModel):
    id: str
    short_name: Optional[str] = None
    long_name: Optional[str] = None
    desc: Optional[str] = None
    type: Optional[int] = None
    agency_id: Optional[str] = None
    color: Optional[str] = None
    text_color: Optional[str] = None


class RouteStop(GtfsStop):
    sequence: int


class Point(BaseModel):
    lat: float
    lon: float


class RouteVariant(BaseModel):
    direction_id: Optional[int] = None
    headsign: Optional[str] = None
    stops: List[RouteStop]
    shape: Optional[List[Point]] = None


class RouteDetails(BaseModel):
    route: GtfsRoute
    variants: List[RouteVariant]


class DirectionSchedule(BaseModel):
    direction_id: Optional[int] = None
    headsign: Optional[str] = None
    trip_count: int
    first_departure: Optional[str] = None
    last_departure: Optional[str] = None
    departures: List[str]


class RouteSchedule(BaseModel):
    route_id: str
    date: str
    directions: List[DirectionSchedule]


# -----------------------
# Endpoints
# -----------------------

@router.get("/stops", response_model=List[GtfsStop])
def get_stops(
    limit: int = Query(500, ge=1, le=5000),
    min_lat: Optional[float] = Query(None),
    max_lat: Optional[float] = Query(None),
    min_lon: Optional[float] = Query(None),
    max_lon: Optional[float] = Query(None),
):
    """
    Lista de paradas GTFS.
    """
    bbox = None
    if None not in (min_lat, max_lat, min_lon, max_lon):
        bbox = (min_lat, max_lat, min_lon, max_lon)

    stops_raw = gtfs_loader.list_stops(limit=limit, bbox=bbox)
    stop_routes_index = gtfs_loader.GTFS_DATA.stop_routes

    return [
        GtfsStop(
            id=s["stop_id"],
            name=s["name"],
            desc=s["desc"],
            lat=s["lat"],
            lon=s["lon"],
            code=s.get("code"),
            wheelchair_boarding=s.get("wheelchair_boarding"),
            routes=[
                StopRoute(
                    id=sr["id"],
                    short_name=sr.get("short_name"),
                    long_name=sr.get("long_name"),
                    color=sr.get("color"),
                    text_color=sr.get("text_color"),
                )
                for sr in stop_routes_index.get(s["stop_id"], [])
            ],
        )
        for s in stops_raw
    ]


@router.get("/routes", response_model=List[GtfsRoute])
def get_routes():
    """
    Lista de rutas/líneas disponibles en el GTFS.
    """
    routes_raw = gtfs_loader.list_routes()
    return [
        GtfsRoute(
            id=r["route_id"],
            short_name=r.get("short_name"),
            long_name=r.get("long_name"),
            desc=r.get("desc"),
            type=r.get("type"),
            agency_id=r.get("agency_id"),
            color=r.get("color"),
            text_color=r.get("text_color"),
        )
        for r in routes_raw
    ]


@router.get("/routes/{route_id}", response_model=RouteDetails)
def get_route_details(route_id: str):
    """
    Detalle de una ruta: metadatos y lista de variantes (una por direction_id),
    cada una con sus paradas ordenadas y geometría shape.
    """
    try:
        route_raw, variants_raw = gtfs_loader.get_route_with_stops(route_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Route not found")

    route = GtfsRoute(
        id=route_raw["route_id"],
        short_name=route_raw.get("short_name"),
        long_name=route_raw.get("long_name"),
        desc=route_raw.get("desc"),
        type=route_raw.get("type"),
        agency_id=route_raw.get("agency_id"),
        color=route_raw.get("color"),
        text_color=route_raw.get("text_color"),
    )

    variants = []
    for v in variants_raw:
        stops = [
            RouteStop(
                id=s["stop_id"],
                name=s["name"],
                desc=s["desc"],
                lat=s["lat"],
                lon=s["lon"],
                code=s.get("code"),
                sequence=s["sequence"],
                routes=[
                    StopRoute(
                        id=sr["id"],
                        short_name=sr.get("short_name"),
                        long_name=sr.get("long_name"),
                        color=sr.get("color"),
                        text_color=sr.get("text_color"),
                    )
                    for sr in s.get("routes", [])
                ],
            )
            for s in v["stops"]
        ]
        shape = [Point(lat=p["lat"], lon=p["lon"]) for p in v["geometry"]] if v["geometry"] else None
        variants.append(RouteVariant(
            direction_id=v["direction_id"],
            headsign=v["headsign"],
            stops=stops,
            shape=shape,
        ))

    return RouteDetails(route=route, variants=variants)


@router.get("/routes/{route_id}/schedule", response_model=RouteSchedule)
def get_route_schedule(
    route_id: str,
    date: Optional[str] = Query(
        None,
        description="Fecha en formato YYYY-MM-DD. Si se omite, se usa la fecha actual del servidor.",
    ),
):
    """
    Resumen de horarios de una ruta para un día concreto.
    """
    if date is None:
        target_date = datetime.today().date()
    else:
        try:
            target_date = datetime.fromisoformat(date).date()
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Formato de fecha inválido, usa YYYY-MM-DD",
            )

    try:
        raw = gtfs_loader.get_route_schedule(route_id, target_date)
    except KeyError:
        raise HTTPException(status_code=404, detail="Route not found")

    directions = [
        DirectionSchedule(
            direction_id=d.get("direction_id"),
            headsign=d.get("headsign"),
            trip_count=d.get("trip_count", 0),
            first_departure=d.get("first_departure"),
            last_departure=d.get("last_departure"),
            departures=d.get("departures") or [],
        )
        for d in raw.get("directions", [])
    ]

    return RouteSchedule(
        route_id=raw["route_id"],
        date=raw["date"],
        directions=directions,
    )
