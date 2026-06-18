# backend/app/services/gtfs_loader.py

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date as Date
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Set


DEFAULT_GTFS_DIR = (
    Path(__file__).resolve().parents[2] / "data" / "gtfs" / "GTFS_Urbano_Toledo_2026"
)


@dataclass
class GtfsData:
    stops: Dict[str, dict]
    routes: Dict[str, dict]
    trips_by_route: Dict[str, List[dict]]
    stop_times_by_trip: Dict[str, List[dict]]
    shapes_by_id: Dict[str, List[Tuple[float, float, int]]]
    # índice parada -> lista de rutas (sin duplicados)
    stop_routes: Dict[str, List[dict]]
    # calendario: service_id -> fechas con servicio / sin servicio (YYYYMMDD)
    service_added_dates: Dict[str, Set[str]]
    service_removed_dates: Dict[str, Set[str]]


def _read_csv(path: Path) -> List[dict]:
    if not path.exists():
        raise FileNotFoundError(f"GTFS file not found: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader)


def load_gtfs_data(gtfs_dir: Optional[Path] = None) -> GtfsData:
    """
    Carga el GTFS estático en memoria (formato tipo Toledo).
    """
    base = gtfs_dir or DEFAULT_GTFS_DIR

    stops_raw = _read_csv(base / "stops.txt")
    routes_raw = _read_csv(base / "routes.txt")
    trips_raw = _read_csv(base / "trips.txt")
    stop_times_raw = _read_csv(base / "stop_times.txt")
    shapes_raw = _read_csv(base / "shapes.txt")
    try:
        calendar_dates_raw = _read_csv(base / "calendar_dates.txt")
    except FileNotFoundError:
        calendar_dates_raw = []

    # -----------------------
    # Stops por stop_id
    # -----------------------
    stops: Dict[str, dict] = {}
    for row in stops_raw:
        stop_id = row["stop_id"]
        stops[stop_id] = {
            "stop_id": stop_id,
            "name": row.get("stop_name"),
            "desc": row.get("stop_desc") or None,
            "lat": float(row["stop_lat"]),
            "lon": float(row["stop_lon"]),
            "code": row.get("stop_code") or stop_id,
            "wheelchair_boarding": (
                int(row["wheelchair_boarding"])
                if row.get("wheelchair_boarding") not in (None, "", " ")
                else None
            ),
        }

    # -----------------------
    # Rutas por route_id
    # -----------------------
    routes: Dict[str, dict] = {}
    for row in routes_raw:
        route_id = row["route_id"]
        routes[route_id] = {
            "route_id": route_id,
            "short_name": row.get("route_short_name") or None,
            "long_name": row.get("route_long_name") or None,
            "desc": row.get("route_desc") or None,
            "type": int(row["route_type"]) if row.get("route_type") else None,
            "agency_id": row.get("agency_id") or None,
            "color": row.get("route_color") or None,
            "text_color": row.get("route_text_color") or None,
        }

    # -----------------------
    # Trips agrupados por route_id
    # -----------------------
    trips_by_route: Dict[str, List[dict]] = {}
    for row in trips_raw:
        route_id = row["route_id"]
        trips_by_route.setdefault(route_id, []).append(
            {
                "trip_id": row["trip_id"],
                "route_id": route_id,
                "service_id": row.get("service_id") or None,
                "headsign": row.get("trip_headsign") or None,
                "direction_id": int(row["direction_id"])
                if row.get("direction_id") not in (None, "", " ")
                else None,
                "shape_id": row.get("shape_id") or None,
            }
        )

    # -----------------------
    # Stop times agrupados por trip_id
    # -----------------------
    stop_times_by_trip: Dict[str, List[dict]] = {}
    for row in stop_times_raw:
        trip_id = row["trip_id"]
        seq = int(row["stop_sequence"])
        stop_times_by_trip.setdefault(trip_id, []).append(
            {
                "trip_id": trip_id,
                "arrival_time": row.get("arrival_time") or None,
                "departure_time": row.get("departure_time") or None,
                "stop_id": row["stop_id"],
                "sequence": seq,
                "pickup_type": int(row["pickup_type"])
                if row.get("pickup_type") not in (None, "", " ")
                else 0,
                "drop_off_type": int(row["drop_off_type"])
                if row.get("drop_off_type") not in (None, "", " ")
                else 0,
            }
        )

    # Ordenamos stop_times por secuencia
    for trip_id, lst in stop_times_by_trip.items():
        lst.sort(key=lambda x: x["sequence"])

    # -----------------------
    # Índice stop -> rutas (sin duplicados)
    # -----------------------
    # trip_id -> route_id para lookup rápido
    trip_to_route: Dict[str, str] = {}
    for route_id, trip_list in trips_by_route.items():
        for trip in trip_list:
            trip_to_route[trip["trip_id"]] = route_id

    # stop_id -> dict(route_id -> route_meta)
    stop_routes_map: Dict[str, Dict[str, dict]] = {}

    for trip_id, st_list in stop_times_by_trip.items():
        route_id = trip_to_route.get(trip_id)
        if not route_id:
            continue

        route_meta = routes.get(route_id)
        if not route_meta:
            continue

        for st in st_list:
            sid = st["stop_id"]
            if sid not in stop_routes_map:
                stop_routes_map[sid] = {}

            if route_id in stop_routes_map[sid]:
                continue

            stop_routes_map[sid][route_id] = {
                "id": route_id,
                "short_name": route_meta.get("short_name"),
                "long_name": route_meta.get("long_name"),
                "type": route_meta.get("type"),
                "color": route_meta.get("color"),
                "text_color": route_meta.get("text_color"),
            }

    stop_routes: Dict[str, List[dict]] = {}
    for sid, rmap in stop_routes_map.items():
        lst = list(rmap.values())
        lst.sort(
            key=lambda r: (r.get("short_name") or r.get("long_name") or r["id"])
        )
        stop_routes[sid] = lst

    # -----------------------
    # Shapes agrupados por shape_id
    # -----------------------
    shapes_by_id: Dict[str, List[Tuple[float, float, int]]] = {}
    for row in shapes_raw:
        shape_id = row["shape_id"]
        lat = float(row["shape_pt_lat"])
        lon = float(row["shape_pt_lon"])
        seq = int(row["shape_pt_sequence"])
        shapes_by_id.setdefault(shape_id, []).append((lat, lon, seq))

    for shape_id, pts in shapes_by_id.items():
        pts.sort(key=lambda p: p[2])

    # -----------------------
    # Calendario (calendar_dates.txt)
    # -----------------------
    service_added_dates: Dict[str, Set[str]] = {}
    service_removed_dates: Dict[str, Set[str]] = {}

    for row in calendar_dates_raw:
        service_id = row["service_id"]
        date_ymd = row["date"]  # YYYYMMDD
        exception_type = row["exception_type"]

        if exception_type == "1":  # servicio añadido ese día
            service_added_dates.setdefault(service_id, set()).add(date_ymd)
        elif exception_type == "2":  # servicio eliminado ese día
            service_removed_dates.setdefault(service_id, set()).add(date_ymd)

    return GtfsData(
        stops=stops,
        routes=routes,
        trips_by_route=trips_by_route,
        stop_times_by_trip=stop_times_by_trip,
        shapes_by_id=shapes_by_id,
        stop_routes=stop_routes,
        service_added_dates=service_added_dates,
        service_removed_dates=service_removed_dates,
    )


# Cargamos una única vez al arrancar el backend
GTFS_DATA = load_gtfs_data()


# -----------------------
# Funciones auxiliares
# -----------------------

def list_stops(
    limit: Optional[int] = None,
    bbox: Optional[Tuple[float, float, float, float]] = None,
) -> List[dict]:
    """
    Devuelve una lista de paradas, opcionalmente filtradas por bounding-box:
    bbox = (min_lat, max_lat, min_lon, max_lon)
    """
    stops = list(GTFS_DATA.stops.values())

    if bbox is not None:
        min_lat, max_lat, min_lon, max_lon = bbox
        stops = [
            s
            for s in stops
            if (min_lat <= s["lat"] <= max_lat)
            and (min_lon <= s["lon"] <= max_lon)
        ]

    if limit is not None:
        stops = stops[:limit]

    return stops


def list_routes() -> List[dict]:
    """Devuelve todas las rutas del GTFS."""
    return list(GTFS_DATA.routes.values())


def get_route_with_stops(route_id: str) -> Tuple[dict, List[dict]]:
    """
    Devuelve:
    - info de la ruta (routes.txt)
    - lista de variantes, una por direction_id distinto, cada una con sus paradas
      y geometría (shape del primer trip representativo de esa dirección)
    """
    route = GTFS_DATA.routes.get(route_id)
    if not route:
        raise KeyError(f"Route not found: {route_id}")

    trips = GTFS_DATA.trips_by_route.get(route_id) or []
    if not trips:
        return route, []

    # Un trip representativo por direction_id (el primero encontrado)
    dir_trips: dict = {}
    for trip in trips:
        key = trip.get("direction_id") if trip.get("direction_id") is not None else 0
        if key not in dir_trips:
            dir_trips[key] = trip

    variants: List[dict] = []
    for _key, trip in sorted(dir_trips.items()):
        trip_id = trip["trip_id"]
        shape_id = trip.get("shape_id")

        stop_times = GTFS_DATA.stop_times_by_trip.get(trip_id) or []
        route_stops: List[dict] = []
        for st in stop_times:
            stop = GTFS_DATA.stops.get(st["stop_id"])
            if not stop:
                continue
            route_stops.append({
                "stop_id": stop["stop_id"],
                "name": stop["name"],
                "desc": stop["desc"],
                "lat": stop["lat"],
                "lon": stop["lon"],
                "code": stop.get("code"),
                "routes": GTFS_DATA.stop_routes.get(stop["stop_id"], []),
                "sequence": st["sequence"],
            })

        geometry: Optional[List[dict]] = None
        if shape_id and shape_id in GTFS_DATA.shapes_by_id:
            pts = GTFS_DATA.shapes_by_id[shape_id]
            geometry = [{"lat": lat, "lon": lon} for (lat, lon, _seq) in pts]

        variants.append({
            "direction_id": trip.get("direction_id"),
            "headsign": trip.get("headsign"),
            "stops": route_stops,
            "geometry": geometry,
        })

    return route, variants


# --------- calendario + horarios ---------

def _service_runs_on_date(service_id: Optional[str], date_ymd: str) -> bool:
    """
    Determina si un service_id opera en una fecha concreta (YYYYMMDD).
    Si solo hay calendar_dates, tomamos exception_type=1 como "días con servicio".
    """
    if not service_id:
        # Si el GTFS no define service_id para un trip, asumimos que opera siempre.
        return True

    added = GTFS_DATA.service_added_dates.get(service_id, set())
    removed = GTFS_DATA.service_removed_dates.get(service_id, set())

    if added or removed:
        if date_ymd in removed:
            return False
        return date_ymd in added

    # Sin info en calendar_dates, asumimos que opera todos los días.
    return True


def _time_to_seconds(t: str) -> int:
    """
    Convierte 'HH:MM:SS' (incluso con horas >24) a segundos.
    """
    h, m, s = t.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def get_route_schedule(route_id: str, for_date: Date) -> dict:
    """
    Devuelve un resumen de horarios de la ruta en una fecha:

    {
      "route_id": "...",
      "date": "YYYY-MM-DD",
      "directions": [
        {
          "direction_id": 0,
          "headsign": "CASCO HISTÓRICO",
          "trip_count": 20,
          "first_departure": "06:00:00",
          "last_departure": "23:30:00",
          "departures": ["06:00:00", "06:30:00", ...]
        },
        ...
      ]
    }
    """
    if route_id not in GTFS_DATA.routes:
        raise KeyError(f"Route not found: {route_id}")

    date_ymd = for_date.strftime("%Y%m%d")
    trips = GTFS_DATA.trips_by_route.get(route_id) or []

    # direction_id -> {"times": [str], "headsign": Optional[str]}
    dir_data: Dict[Optional[int], dict] = {}

    for trip in trips:
        service_id = trip.get("service_id")
        if not _service_runs_on_date(service_id, date_ymd):
            continue

        trip_id = trip["trip_id"]
        stop_times = GTFS_DATA.stop_times_by_trip.get(trip_id) or []
        if not stop_times:
            continue

        first_st = stop_times[0]
        t = first_st.get("departure_time") or first_st.get("arrival_time")
        if not t:
            continue

        direction_id = trip.get("direction_id")
        info = dir_data.setdefault(
            direction_id,
            {"times": [], "headsign": None},
        )

        if not info["headsign"] and trip.get("headsign"):
            info["headsign"] = trip["headsign"]

        info["times"].append(t)

    directions: List[dict] = []
    for direction_id, info in dir_data.items():
        if not info["times"]:
            continue
        times_sorted = sorted(info["times"], key=_time_to_seconds)
        directions.append(
            {
                "direction_id": direction_id,
                "headsign": info["headsign"],
                "trip_count": len(times_sorted),
                "first_departure": times_sorted[0],
                "last_departure": times_sorted[-1],
                "departures": times_sorted,
            }
        )

    return {
        "route_id": route_id,
        "date": for_date.isoformat(),
        "directions": directions,
    }
