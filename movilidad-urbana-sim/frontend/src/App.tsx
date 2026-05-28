import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MapView } from "./components/MapView";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type Profile = "driving" | "cycling" | "foot";
type UiMode = Profile | "transit";
type BasemapMode = "light" | "color" | "relief" | "satellite";

type Point = { lat: number; lon: number };

type TransitSegment = {
  mode: string;
  distance_m: number;
  duration_s: number;
  geometry: Point[];

  route_id?: string | null;
  route_short_name?: string | null;
  route_long_name?: string | null;
  agency_name?: string | null;
  from_stop_name?: string | null;
  to_stop_name?: string | null;
  departure?: string | null;
  arrival?: string | null;
};

type TransitResult = {
  distance_m: number;
  duration_s: number;
  geometry: Point[]; // ruta completa
  segments: TransitSegment[];
  itinerary_index: number;
  total_itineraries: number;
};

type TransitRouteResponse = {
  origin: Point;
  destination: Point;
  result: TransitResult;
};

type TransitRouteRef = {
  id: string;
  short_name?: string;
  long_name?: string;
};

type GtfsStop = {
  id: string;
  code?: string;
  name?: string;
  desc?: string;
  lat: number;
  lon: number;
  routes?: TransitRouteRef[];
};

interface RouteResult {
  profile: Profile;
  distance_m: number;
  duration_s: number;
  geometry: Point[];
}

interface RouteResponse {
  origin: Point;
  destination: Point;
  results: RouteResult[];
}

type TransitRouteDetails = {
  route: {
    id: string;
    short_name?: string;
    long_name?: string;
    desc?: string;
    type?: number;
    agency_id?: string;
    color?: string | null;
    text_color?: string | null;
  };
  stops: (GtfsStop & { sequence: number })[];
  shape?: Point[];
};

type TransitRouteListItem = {
  id: string;
  short_name?: string;
  long_name?: string;
  desc?: string;
  type?: number;
  agency_id?: string;
  color?: string | null;
  text_color?: string | null;
};

type TransitDirectionSchedule = {
  direction_id?: number | null;
  headsign?: string | null;
  trip_count: number;
  first_departure?: string | null;
  last_departure?: string | null;
  departures: string[];
};

type TransitRouteSchedule = {
  route_id: string;
  date: string;
  directions: TransitDirectionSchedule[];
};

type LpmcPurpose = "B" | "HBE" | "HBO" | "HBW" | "NHBO";
type LpmcFuel = "Average" | "Diesel" | "Hybrid" | "Petrol";

type LpmcUserProfile = {
  purpose: LpmcPurpose;
  fueltype: LpmcFuel;
  day_of_week: number;
  start_time_linear: number;
  age: number;
  female: number;
  driving_license: number;
  car_ownership: number;
  cost_transit: number;
  cost_driving_total: number;
};

type LpmcPredictResponse = {
  predicted_mode: "walk" | "cycle" | "pt" | "drive";
  confidence: number;
  probabilities: Record<"walk" | "cycle" | "pt" | "drive", number>;
  route_features: Record<string, number>;
  model_info: {
    model_path: string;
    scaler_path: string;
    household_id_strategy: string;
    itinerary_index: number;
    total_itineraries: number;
  };
};

type LpmcDebugResponse = {
  feature_names: string[];
  raw_features: Record<string, number>;
  scaled_features: Record<string, number>;
  scaled_columns: string[];
  route_features: Record<string, number>;
  model_info: Record<string, string | number>;
};

type LpmcSingleResult = {
  predicted_mode: "walk" | "cycle" | "pt" | "drive";
  confidence: number;
  probabilities: Record<"walk" | "cycle" | "pt" | "drive", number>;
} | null;

type LpmcCompareResponse = {
  results: Record<"xgb" | "rf" | "dnn", LpmcSingleResult>;
  route_features: Record<string, number>;
  model_info: { itinerary_index: number; total_itineraries: number };
};

async function fetchRoutes(
  origin: Point,
  destination: Point
): Promise<RouteResponse> {
  const res = await fetch(`${API_BASE_URL}/api/osrm/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin,
      destination,
      profiles: ["driving", "cycling", "foot"],
    }),
  });

  if (!res.ok) {
    throw new Error(`Error llamando a la API: ${res.status}`);
  }
  return res.json();
}

async function fetchTransitRoute(
  origin: Point,
  destination: Point,
  itineraryIndex?: number | null
): Promise<TransitResult> {
  const payload: any = { origin, destination };
  if (typeof itineraryIndex === "number") {
    payload.itinerary_index = itineraryIndex;
  }

  const res = await fetch(`${API_BASE_URL}/api/otp/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Error llamando a la API OTP: ${res.status}`);
  }

  const data: TransitRouteResponse = await res.json();
  return data.result;
}

async function fetchLpmcCompare(
  origin: Point,
  destination: Point,
  user_profile: LpmcUserProfile,
  itinerary_index?: number
): Promise<LpmcCompareResponse> {
  const res = await fetch(`${API_BASE_URL}/api/lpmc/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination, user_profile, itinerary_index }),
  });
  if (!res.ok) throw new Error(`Error LPMC compare: ${res.status}`);
  return res.json();
}

async function fetchLpmcPredict(
  origin: Point,
  destination: Point,
  user_profile: LpmcUserProfile,
  itinerary_index?: number
): Promise<LpmcPredictResponse> {
  const res = await fetch(`${API_BASE_URL}/api/lpmc/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination, user_profile, itinerary_index }),
  });
  if (!res.ok) throw new Error(`Error LPMC predict: ${res.status}`);
  return res.json();
}

async function fetchLpmcDebug(
  origin: Point,
  destination: Point,
  user_profile: LpmcUserProfile,
  itinerary_index?: number
): Promise<LpmcDebugResponse> {
  const res = await fetch(`${API_BASE_URL}/api/lpmc/debug-features`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination, user_profile, itinerary_index }),
  });
  if (!res.ok) throw new Error(`Error LPMC debug: ${res.status}`);
  return res.json();
}

const PROFILE_LABELS: Record<Profile, string> = {
  driving: "Coche",
  cycling: "Bici",
  foot: "A pie",
};

const PURPOSE_OPTIONS: { value: LpmcPurpose; label: string }[] = [
  { value: "B", label: "[B] Otros viajes base" },
  { value: "HBE", label: "[HBE] Hogar - Educación" },
  { value: "HBO", label: "[HBO] Hogar - Otros motivos" },
  { value: "HBW", label: "[HBW] Hogar - Trabajo" },
  { value: "NHBO", label: "[NHBO] No basados en hogar" },
];

const FUEL_OPTIONS: { value: LpmcFuel; label: string }[] = [
  { value: "Average", label: "Promedio (Average)" },
  { value: "Diesel", label: "Diesel" },
  { value: "Hybrid", label: "Híbrido" },
  { value: "Petrol", label: "Gasolina (Petrol)" },
];

const DAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
];

const BASEMAP_OPTIONS: { value: BasemapMode; label: string }[] = [
  { value: "light", label: "Analítico" },
  { value: "color", label: "Color" },
  { value: "relief", label: "Relieve" },
  { value: "satellite", label: "Satélite" },
];

const PROFILE_PRESETS: {
  id: string;
  label: string;
  description: string;
  values: LpmcUserProfile;
}[] = [
  {
    id: "commuter",
    label: "Commuter",
    description: "Perfil laboral con coche disponible.",
    values: {
      purpose: "HBW",
      fueltype: "Petrol",
      day_of_week: 2,
      start_time_linear: 8.25,
      age: 36,
      female: 0,
      driving_license: 1,
      car_ownership: 1,
      cost_transit: 1.5,
      cost_driving_total: 3.5,
    },
  },
  {
    id: "student",
    label: "Estudiante",
    description: "Perfil sensible al coste y predispuesto al bus.",
    values: {
      purpose: "HBE",
      fueltype: "Average",
      day_of_week: 3,
      start_time_linear: 7.75,
      age: 21,
      female: 1,
      driving_license: 0,
      car_ownership: 0,
      cost_transit: 0.95,
      cost_driving_total: 2.2,
    },
  },
  {
    id: "family",
    label: "Familiar",
    description: "Viaje no laboral con mayor acceso a coche.",
    values: {
      purpose: "HBO",
      fueltype: "Diesel",
      day_of_week: 6,
      start_time_linear: 11.5,
      age: 44,
      female: 1,
      driving_license: 1,
      car_ownership: 2,
      cost_transit: 1.5,
      cost_driving_total: 4.4,
    },
  },
];

const LPMC_MODE_LABELS: Record<LpmcPredictResponse["predicted_mode"], string> = {
  walk: "A pie",
  cycle: "Bicicleta",
  pt: "Transporte público",
  drive: "Coche",
};

// Colores coherentes entre botones y líneas
const MODE_COLORS: Record<UiMode, string> = {
  driving: "#2563eb", // azul
  cycling: "#16a34a", // verde
  foot: "#4b5563",    // gris
  transit: "#f97316", // naranja
};

// Paleta para rutas GTFS (colores "aleatorios" pero deterministas por route_id)
const ROUTE_COLOR_PALETTE = [
  "#f97316", // naranja
  "#0ea5e9", // azul claro
  "#a855f7", // violeta
  "#22c55e", // verde
  "#e11d48", // rosa fuerte
  "#14b8a6", // teal
  "#facc15", // amarillo
];

function colorForRouteId(routeId: string | null): string {
  if (!routeId) return "#f97316";
  let hash = 0;
  for (let i = 0; i < routeId.length; i++) {
    hash = (hash * 31 + routeId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % ROUTE_COLOR_PALETTE.length;
  return ROUTE_COLOR_PALETTE[idx];
}

function linearHourToTimeString(hour: number): string {
  const totalMinutes = Math.max(0, Math.min(24 * 60 - 1, Math.round(hour * 60)));
  const hh = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const mm = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function timeStringToLinearHour(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 12;
  return h + m / 60;
}

function App() {
  const [origin, setOrigin] = useState<Point>({ lat: 39.87029, lon: -4.03434 });
  const [destination, setDestination] = useState<Point>({
    lat: 39.85968,
    lon: -4.00525,
  });

  const [selectedModes, setSelectedModes] = useState<Set<UiMode>>(new Set(["driving"]));
  const [basemap, setBasemap] = useState<BasemapMode>("color");
  const [transitItineraryIndex, setTransitItineraryIndex] = useState(0);

  const [showGtfsStops, setShowGtfsStops] = useState(true);
  const [selectedTransitRouteId, setSelectedTransitRouteId] = useState<
    string | null
  >(null);

  // fecha por defecto = hoy (YYYY-MM-DD)
  const todayStr = new Date().toISOString().slice(0, 10);
  const [scheduleDate, setScheduleDate] = useState<string>(todayStr);
  const [showLpmcDebug, setShowLpmcDebug] = useState(false);
  const [lpmcProfile, setLpmcProfile] = useState<LpmcUserProfile>({
    purpose: "HBW",
    fueltype: "Average",
    day_of_week: 3,
    start_time_linear: 12,
    age: 35,
    female: 0,
    driving_license: 1,
    car_ownership: 1,
    cost_transit: 1.5,
    cost_driving_total: 3,
  });

  function toggleMode(mode: UiMode) {
    setSelectedModes((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) {
        next.delete(mode);
      } else {
        next.add(mode);
      }
      return next;
    });
  }

  // ---------------- OSRM ----------------

  const osrmMutation = useMutation<RouteResponse, Error>({
    mutationFn: () => fetchRoutes(origin, destination),
  });

  const transitMutation = useMutation<TransitResult, Error, number | null>({
    mutationFn: (idxOverride) =>
      fetchTransitRoute(origin, destination, idxOverride ?? transitItineraryIndex),
  });

  const lpmcPredictMutation = useMutation<
    LpmcPredictResponse,
    Error,
    number | undefined
  >({
    mutationFn: (idx) =>
      fetchLpmcPredict(origin, destination, lpmcProfile, idx ?? transitItineraryIndex),
  });

  const lpmcDebugMutation = useMutation<LpmcDebugResponse, Error, number | undefined>({
    mutationFn: (idx) =>
      fetchLpmcDebug(origin, destination, lpmcProfile, idx ?? transitItineraryIndex),
  });

  const lpmcCompareMutation = useMutation<LpmcCompareResponse, Error, number | undefined>({
    mutationFn: (idx) =>
      fetchLpmcCompare(origin, destination, lpmcProfile, idx ?? transitItineraryIndex),
  });

  const isCalculating = osrmMutation.isPending || transitMutation.isPending;

  const primaryOsrmProfile = (["driving", "cycling", "foot"] as Profile[]).find(
    (p) => selectedModes.has(p)
  );
  const selectedRoute = primaryOsrmProfile
    ? osrmMutation.data?.results.find((r) => r.profile === primaryOsrmProfile) ?? null
    : null;

  const transitResult = transitMutation.data ?? null;
  const totalItineraries = transitResult?.total_itineraries ?? 0;
  const mainTransitSegment = transitResult?.segments.find(
    (s) => s.mode !== "WALK"
  );

  const transitLineLabel = mainTransitSegment
    ? mainTransitSegment.route_short_name ||
      mainTransitSegment.route_long_name ||
      mainTransitSegment.route_id
    : null;

  const displayedGeometry: Point[] =
    selectedModes.has("transit")
      ? transitMutation.data?.geometry ?? []
      : selectedRoute?.geometry ?? [];

  const transitRouteColor = colorForRouteId(selectedTransitRouteId ?? null);

  // ------------- GTFS: paradas -------------

  const gtfsStopsQuery = useQuery<GtfsStop[]>({
    queryKey: ["gtfs-stops"],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/gtfs/stops?limit=5000`
      );
      if (!res.ok) throw new Error("Error cargando paradas GTFS");
      return res.json();
    },
  });

  // ------------- GTFS: lista de rutas -------------

  const gtfsRoutesQuery = useQuery<TransitRouteListItem[]>({
    queryKey: ["gtfs-routes"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/gtfs/routes`);
      if (!res.ok) throw new Error("Error cargando rutas GTFS");
      return res.json();
    },
  });

  // ------------- GTFS: detalles de la ruta seleccionada -------------

  const transitRouteDetailsQuery = useQuery<TransitRouteDetails>({
    queryKey: ["gtfs-route-details", selectedTransitRouteId],
    enabled: !!selectedTransitRouteId,
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/gtfs/routes/${selectedTransitRouteId}`
      );
      if (!res.ok) throw new Error("Error cargando detalles de ruta GTFS");
      return res.json();
    },
  });

  const transitShape = transitRouteDetailsQuery.data?.shape ?? [];
  const transitRouteStops = transitRouteDetailsQuery.data?.stops ?? [];

  // ------------- GTFS: horarios de la ruta seleccionada -------------

  const transitScheduleQuery = useQuery<TransitRouteSchedule>({
    queryKey: ["gtfs-route-schedule", selectedTransitRouteId, scheduleDate],
    enabled: !!selectedTransitRouteId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (scheduleDate) {
        params.set("date", scheduleDate);
      }
      const res = await fetch(
        `${API_BASE_URL}/api/gtfs/routes/${selectedTransitRouteId}/schedule?${params.toString()}`
      );
      if (!res.ok) throw new Error("Error cargando horarios GTFS");
      return res.json();
    },
  });

  const stripSeconds = (t?: string | null) =>
    t && t.length >= 5 ? t.slice(0, 5) : t ?? "";

  const selectedPresetId =
    PROFILE_PRESETS.find(
      (preset) => JSON.stringify(preset.values) === JSON.stringify(lpmcProfile)
    )?.id ?? null;

  return (
    <div className="app-root">
      <header className="app-header">
        <h1 className="app-header-title">Simulador de movilidad urbana</h1>
        <p className="app-header-subtitle">
          Haz clic en el mapa para colocar origen y destino (alternando). Luego
          pulsa en<strong> "Calcular rutas"</strong>.
        </p>
      </header>

      <main className="app-main">
        {/* Columna izquierda: mapa */}
        <section className="card map-card">
          <h2 className="section-title">Mapa de rutas</h2>
          <MapView
            origin={origin}
            destination={destination}
            setOrigin={setOrigin}
            setDestination={setDestination}
            routeGeometry={displayedGeometry}
            selectedModes={selectedModes}
            osrmResults={osrmMutation.data?.results}
            basemap={basemap}
            gtfsStops={
              showGtfsStops && gtfsStopsQuery.data ? gtfsStopsQuery.data : []
            }
            transitShape={transitShape}
            transitRouteStops={transitRouteStops}
            transitRouteColor={transitRouteColor}
            onSelectTransitRoute={(routeId) => {
              setSelectedTransitRouteId(routeId);
            }}
            // solo mostramos segmentos OTP cuando el modo es "transit"
            transitSegments={
              selectedModes.has("transit") ? transitResult?.segments ?? [] : []
            }
          />
        </section>

        {/* Columna derecha: panel */}
        <section className="card panel-card">
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              marginBottom: "0.5rem",
            }}
          >
            <input
              type="checkbox"
              checked={showGtfsStops}
              onChange={(e) => setShowGtfsStops(e.target.checked)}
            />
            Mostrar paradas de transporte público (GTFS Toledo)
          </label>

          <div style={{ marginBottom: "0.85rem" }}>
            <div
              style={{
                marginBottom: "0.35rem",
                fontSize: "0.76rem",
                fontWeight: 600,
                color: "#334155",
              }}
            >
              Mapa base
            </div>
            <div className="basemap-toolbar">
              {BASEMAP_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`basemap-chip${
                    basemap === option.value ? " basemap-chip--active" : ""
                  }`}
                  onClick={() => setBasemap(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Selector de ruta GTFS */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              htmlFor="gtfs-route-select"
              style={{ display: "block", marginBottom: "0.25rem" }}
            >
              Línea de transporte público:
            </label>
            <select
              id="gtfs-route-select"
              value={selectedTransitRouteId ?? ""}
              onChange={(e) =>
                setSelectedTransitRouteId(
                  e.target.value === "" ? null : e.target.value
                )
              }
              style={{ width: "100%", padding: "0.35rem" }}
            >
              <option value="">(ninguna seleccionada)</option>
              {gtfsRoutesQuery.data?.map((r) => {
                let label: string;

                if (r.short_name && r.long_name) {
                  label = `${r.short_name} - ${r.long_name}`;
                } else if (r.short_name) {
                  label = r.short_name;
                } else if (r.long_name) {
                  label = r.long_name;
                } else {
                  label = r.id;
                }

                return (
                  <option key={r.id} value={r.id}>
                    {label}
                  </option>
                );
              })}

            </select>
            {gtfsRoutesQuery.isLoading && (
              <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                Cargando líneas...
              </p>
            )}
            {gtfsRoutesQuery.error && (
              <p className="error-text">Error cargando rutas GTFS.</p>
            )}
          </div>

          <h2 className="section-title">Rutas OSRM</h2>

          <div className="mode-toolbar">
            {(["driving", "cycling", "foot"] as Profile[]).map((p) => (
              <button
                key={p}
                type="button"
                className="mode-button"
                style={
                  selectedModes.has(p)
                    ? {
                        background: MODE_COLORS[p],
                        borderColor: MODE_COLORS[p],
                        color: "#ffffff",
                      }
                    : undefined
                }
                onClick={() => toggleMode(p)}
                disabled={isCalculating}
              >
                {PROFILE_LABELS[p]}
              </button>
            ))}

            <button
              type="button"
              className="mode-button"
              style={
                selectedModes.has("transit")
                  ? {
                      background: MODE_COLORS.transit,
                      borderColor: MODE_COLORS.transit,
                      color: "#ffffff",
                    }
                  : undefined
              }
              onClick={() => toggleMode("transit")}
              disabled={isCalculating || !transitMutation.data}
            >
              Transporte público
            </button>
          </div>

          <button
            onClick={() => {
              osrmMutation.mutate();
              setTransitItineraryIndex(0);
              transitMutation.mutate(0);
            }}
            disabled={isCalculating}
            className="primary-button"
          >
            {isCalculating ? "Calculando..." : "Calcular rutas"}
          </button>

          {osrmMutation.error && (
            <p className="error-text">
              Error OSRM rutas coche/bici/a pie:{" "}
              {(osrmMutation.error as Error).message}
            </p>
          )}
          {transitMutation.error && (
            <p className="error-text">
              Error OTP transporte público:{" "}
              {(transitMutation.error as Error).message}
            </p>
          )}

          <table className="routes-table">
            <thead>
              <tr>
                <th>Modo</th>
                <th>Distancia (km)</th>
                <th>Duración (min)</th>
              </tr>
            </thead>
            <tbody>
              {osrmMutation.data?.results.map((r) => (
                <tr
                  key={r.profile}
                  className={
                    selectedModes.has(r.profile) ? "row-active" : undefined
                  }
                >
                  <td>{PROFILE_LABELS[r.profile]}</td>
                  <td>{(r.distance_m / 1000).toFixed(2)}</td>
                  <td>{(r.duration_s / 60).toFixed(1)}</td>
                </tr>
              ))}

              {transitMutation.data && (
                <tr
                  className={
                    selectedModes.has("transit") ? "row-active" : undefined
                  }
                >
                  <td>
                    Transporte público
                    {transitLineLabel && (
                      <div
                        style={{ fontSize: "0.75rem", color: "#4b5563" }}
                      >
                        Línea {transitLineLabel}
                        {mainTransitSegment?.from_stop_name &&
                          mainTransitSegment?.to_stop_name && (
                            <>
                              {" · "}
                              {mainTransitSegment.from_stop_name} -{" "}
                              {mainTransitSegment.to_stop_name}
                            </>
                          )}
                      </div>
                    )}
                  </td>
                  <td>
                    {(transitMutation.data.distance_m / 1000).toFixed(2)}
                  </td>
                  <td>
                    {(transitMutation.data.duration_s / 60).toFixed(1)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {transitResult && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginTop: "0.5rem",
                fontSize: "0.85rem",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (transitItineraryIndex <= 0) return;
                  const next = transitItineraryIndex - 1;
                  setTransitItineraryIndex(next);
                  transitMutation.mutate(next);
                }}
                disabled={
                  transitItineraryIndex <= 0 || transitMutation.isPending
                }
              >
                &lt; Anterior
              </button>

              <span>
                Itinerario {transitItineraryIndex + 1} de{" "}
                {totalItineraries || "?"}
              </span>

              <button
                type="button"
                onClick={() => {
                  if (!totalItineraries) return;
                  if (transitItineraryIndex >= totalItineraries - 1) return;
                  const next = transitItineraryIndex + 1;
                  setTransitItineraryIndex(next);
                  transitMutation.mutate(next);
                }}
                disabled={
                  !totalItineraries ||
                  transitItineraryIndex >= totalItineraries - 1 ||
                  transitMutation.isPending
                }
              >
                Siguiente &gt;
              </button>
            </div>
          )}

          {selectedModes.has("transit") && transitResult && (
            <div
              style={{
                marginTop: "0.75rem",
                paddingTop: "0.5rem",
                borderTop: "1px solid #e5e7eb",
                fontSize: "0.85rem",
              }}
            >
              <h3 style={{ marginBottom: "0.25rem", fontSize: "0.9rem" }}>
                Detalle del itinerario en transporte público
              </h3>
              <ol style={{ paddingLeft: "1.25rem" }}>
                {transitResult.segments.map((seg, idx) => {
                  const distKm = seg.distance_m / 1000;
                  const durMin = seg.duration_s / 60;
                  const isWalk = seg.mode === "WALK";

                  if (isWalk) {
                    return (
                      <li key={idx} style={{ marginBottom: "0.25rem" }}>
                        Caminar {distKm.toFixed(2)} km (
                        {durMin.toFixed(1)} min)
                        {seg.to_stop_name && (
                          <>
                            {" "}
                            hasta <strong>{seg.to_stop_name}</strong>
                          </>
                        )}
                      </li>
                    );
                  }

                  const label =
                    seg.route_short_name ||
                    seg.route_long_name ||
                    seg.route_id ||
                    seg.mode;

                  return (
                    <li key={idx} style={{ marginBottom: "0.25rem" }}>
                      {seg.departure && <span>{seg.departure} · </span>}
                      <strong>Línea {label}</strong>
                      {seg.agency_name && <> ({seg.agency_name})</>}
                      {seg.from_stop_name && seg.to_stop_name && (
                        <>
                          {" "}
                          de <strong>{seg.from_stop_name}</strong> a{" "}
                          <strong>{seg.to_stop_name}</strong>
                        </>
                      )}
                      {" · "}
                      {distKm.toFixed(2)} km ({durMin.toFixed(1)} min)
                      {seg.arrival && <> · llegada {seg.arrival}</>}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </section>
        <section className="card lpmc-card">
          <div
            style={{
              marginTop: "1rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <h2 className="section-title">Inferencia LPMC</h2>
            <div className="model-toolbar">
              <span className="status-pill">XGBoost activo</span>
              <span className="status-note">
                Preparado para perfiles rápidos y futuras variantes de modelo.
              </span>
            </div>
            <div className="preset-grid">
              {PROFILE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`preset-card${
                    selectedPresetId === preset.id ? " preset-card--active" : ""
                  }`}
                  onClick={() => setLpmcProfile(preset.values)}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>
            <p style={{ marginTop: "-0.25rem", fontSize: "0.8rem", color: "#4b5563" }}>
              Hora de inicio: hora aproximada del viaje (formato 24h).
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
              }}
            >
              <label>
                <span style={{ fontSize: "0.8rem" }}>Motivo del viaje</span>
                <select
                  value={lpmcProfile.purpose}
                  onChange={(e) =>
                    setLpmcProfile((p) => ({
                      ...p,
                      purpose: e.target.value as LpmcPurpose,
                    }))
                  }
                  style={{ width: "100%" }}
                >
                  {PURPOSE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span style={{ fontSize: "0.8rem" }}>Tipo de combustible</span>
                <select
                  value={lpmcProfile.fueltype}
                  onChange={(e) =>
                    setLpmcProfile((p) => ({
                      ...p,
                      fueltype: e.target.value as LpmcFuel,
                    }))
                  }
                  style={{ width: "100%" }}
                >
                  {FUEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span style={{ fontSize: "0.8rem" }}>Día de la semana</span>
                <select
                  value={lpmcProfile.day_of_week}
                  onChange={(e) =>
                    setLpmcProfile((p) => ({
                      ...p,
                      day_of_week: Number(e.target.value),
                    }))
                  }
                  style={{ width: "100%" }}
                >
                  {DAY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span style={{ fontSize: "0.8rem" }}>Hora de inicio del viaje</span>
                <input
                  type="time"
                  step={300}
                  value={linearHourToTimeString(lpmcProfile.start_time_linear)}
                  onChange={(e) =>
                    setLpmcProfile((p) => ({
                      ...p,
                      start_time_linear: timeStringToLinearHour(e.target.value),
                    }))
                  }
                  style={{ width: "100%" }}
                />
              </label>

              <label>
                <span style={{ fontSize: "0.8rem" }}>Edad</span>
                <input
                  type="number"
                  min={16}
                  max={100}
                  value={lpmcProfile.age}
                  onChange={(e) =>
                    setLpmcProfile((p) => ({ ...p, age: Number(e.target.value) }))
                  }
                  style={{ width: "100%" }}
                />
              </label>

              <label>
                <span style={{ fontSize: "0.8rem" }}>Género</span>
                <select
                  value={lpmcProfile.female}
                  onChange={(e) =>
                    setLpmcProfile((p) => ({ ...p, female: Number(e.target.value) }))
                  }
                  style={{ width: "100%" }}
                >
                  <option value={0}>Masculino</option>
                  <option value={1}>Femenino</option>
                </select>
              </label>

              <label>
                <span style={{ fontSize: "0.8rem" }}>Carnet de conducir</span>
                <select
                  value={lpmcProfile.driving_license}
                  onChange={(e) =>
                    setLpmcProfile((p) => ({
                      ...p,
                      driving_license: Number(e.target.value),
                    }))
                  }
                  style={{ width: "100%" }}
                >
                  <option value={1}>Sí</option>
                  <option value={0}>No</option>
                </select>
              </label>

              <label>
                <span style={{ fontSize: "0.8rem" }}>Coches en el hogar</span>
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={lpmcProfile.car_ownership}
                  onChange={(e) =>
                    setLpmcProfile((p) => ({
                      ...p,
                      car_ownership: Number(e.target.value),
                    }))
                  }
                  style={{ width: "100%" }}
                />
              </label>

              <label>
                <span style={{ fontSize: "0.8rem" }}>
                  Coste transporte público (EUR)
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={lpmcProfile.cost_transit}
                  onChange={(e) =>
                    setLpmcProfile((p) => ({
                      ...p,
                      cost_transit: Number(e.target.value),
                    }))
                  }
                  style={{ width: "100%" }}
                />
              </label>

              <label>
                <span style={{ fontSize: "0.8rem" }}>
                  Coste total coche (EUR)
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={lpmcProfile.cost_driving_total}
                  onChange={(e) =>
                    setLpmcProfile((p) => ({
                      ...p,
                      cost_driving_total: Number(e.target.value),
                    }))
                  }
                  style={{ width: "100%" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
              <button
                className="primary-button"
                onClick={() => lpmcPredictMutation.mutate(transitItineraryIndex)}
                disabled={lpmcPredictMutation.isPending}
              >
                {lpmcPredictMutation.isPending ? "Infiriendo..." : "Inferir modo"}
              </button>
              <button
                onClick={() => lpmcCompareMutation.mutate(transitItineraryIndex)}
                disabled={lpmcCompareMutation.isPending}
              >
                {lpmcCompareMutation.isPending ? "Comparando..." : "Comparar 3 modelos"}
              </button>
            </div>

            {lpmcPredictMutation.error && (
              <p className="error-text">{lpmcPredictMutation.error.message}</p>
            )}            

            {lpmcPredictMutation.data && (
              <div
                style={{
                  marginTop: "0.6rem",
                  background: "#f9fafb",
                  padding: "0.6rem",
                  borderRadius: "0.4rem",
                }}
              >
                <div>
                  Predicción:{" "}
                  <strong>{LPMC_MODE_LABELS[lpmcPredictMutation.data.predicted_mode]}</strong>{" "}
                  ({(lpmcPredictMutation.data.confidence * 100).toFixed(1)}%)
                </div>
                <ul style={{ margin: "0.4rem 0 0 1rem", padding: 0 }}>
                  <li>A pie: {(lpmcPredictMutation.data.probabilities.walk * 100).toFixed(1)}%</li>
                  <li>Bicicleta: {(lpmcPredictMutation.data.probabilities.cycle * 100).toFixed(1)}%</li>
                  <li>Transporte público: {(lpmcPredictMutation.data.probabilities.pt * 100).toFixed(1)}%</li>
                  <li>Coche: {(lpmcPredictMutation.data.probabilities.drive * 100).toFixed(1)}%</li>
                </ul>
              </div>
            )}

            {lpmcCompareMutation.error && (
              <p className="error-text">{lpmcCompareMutation.error.message}</p>
            )}

            {lpmcCompareMutation.data && (() => {
              const { results } = lpmcCompareMutation.data;
              const modes: Array<"walk" | "cycle" | "pt" | "drive"> = ["walk", "cycle", "pt", "drive"];
              const modeLabels: Record<string, string> = { walk: "A pie", cycle: "Bicicleta", pt: "T. Público", drive: "Coche" };
              const variants: Array<"xgb" | "rf" | "dnn"> = ["xgb", "rf", "dnn"];
              const variantLabels: Record<string, string> = { xgb: "XGBoost", rf: "Random Forest", dnn: "DNN" };
              return (
                <div style={{ marginTop: "0.6rem", background: "#f9fafb", padding: "0.6rem", borderRadius: "0.4rem" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.4rem", fontSize: "0.85rem" }}>Comparación de modelos</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", paddingBottom: "0.3rem", color: "#6b7280" }}>Modo</th>
                        {variants.map(v => (
                          <th key={v} style={{ textAlign: "right", paddingBottom: "0.3rem", color: results[v] ? "#1d4ed8" : "#9ca3af" }}>
                            {variantLabels[v]}
                            {results[v] && <span style={{ display: "block", fontSize: "0.7rem", fontWeight: 400 }}>→ {modeLabels[results[v]!.predicted_mode]}</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {modes.map(mode => (
                        <tr key={mode} style={{ borderTop: "1px solid #e5e7eb" }}>
                          <td style={{ paddingTop: "0.25rem", paddingBottom: "0.25rem", color: "#374151" }}>{modeLabels[mode]}</td>
                          {variants.map(v => {
                            const prob = results[v]?.probabilities[mode];
                            const isWinner = results[v]?.predicted_mode === mode;
                            return (
                              <td key={v} style={{ textAlign: "right", paddingTop: "0.25rem", fontWeight: isWinner ? 700 : 400, color: isWinner ? "#1d4ed8" : "#374151" }}>
                                {prob !== undefined ? `${(prob * 100).toFixed(1)}%` : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
              <button
                type="button"
                onClick={() => {
                  setShowLpmcDebug((v) => !v);
                  if (!showLpmcDebug) lpmcDebugMutation.mutate(transitItineraryIndex);
                }}
              >
                {showLpmcDebug ? "Ocultar depuración" : "Ver depuración de variables"}
              </button>
            </div>
            {lpmcDebugMutation.error && (
              <p className="error-text">{lpmcDebugMutation.error.message}</p>
            )}

            {showLpmcDebug && lpmcDebugMutation.data && (
              <details open style={{ marginTop: "0.6rem" }}>
                <summary style={{ cursor: "pointer" }}>
                  Depuración de variables (entrada al modelo)
                </summary>
                <pre
                  style={{
                    marginTop: "0.5rem",
                    fontSize: "0.75rem",
                    maxHeight: "220px",
                    overflow: "auto",
                    background: "#0f172a",
                    color: "#e5e7eb",
                    padding: "0.5rem",
                    borderRadius: "0.4rem",
                  }}
                >
                  {JSON.stringify(lpmcDebugMutation.data, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </section>
        {selectedTransitRouteId && (
          <section className="card lineas-bus-card">
            {/* Bloque de transporte público GTFS */}
            <div className="transit-summary">
              <h3>Transporte público (GTFS)</h3>

              {transitRouteDetailsQuery.data && (
                <p>
                  Ruta:{" "}
                  <strong>
                    {transitRouteDetailsQuery.data.route.short_name ||
                      transitRouteDetailsQuery.data.route.long_name ||
                      transitRouteDetailsQuery.data.route.id}
                  </strong>{" "}
                  ({transitRouteStops.length} paradas)
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  margin: "0.5rem 0",
                }}
              >
                <label
                  htmlFor="schedule-date"
                  style={{ fontSize: "0.85rem", color: "#4b5563" }}
                >
                  Fecha:
                </label>
                <input
                  id="schedule-date"
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                />
              </div>

              {transitScheduleQuery.isLoading && <p>Cargando horarios...</p>}
              {transitScheduleQuery.error && (
                <p className="error-text">
                  Error cargando horarios de la ruta seleccionada.
                </p>
              )}

              {transitScheduleQuery.data && (
                <>
                  {transitScheduleQuery.data.directions.length === 0 ? (
                    <p style={{ fontSize: "0.85rem", color: "#4b5563" }}>
                      No hay servicios programados para esta fecha.
                    </p>
                  ) : (
                    <div style={{ marginTop: "0.5rem" }}>
                      {transitScheduleQuery.data.directions.map((dir, idx) => {
                        const sample = dir.departures.slice(0, 10);
                        const remaining =
                          dir.departures.length - sample.length;

                        return (
                          <div
                            key={dir.direction_id ?? idx}
                            style={{
                              marginBottom: "0.5rem",
                              padding: "0.4rem 0.6rem",
                              borderRadius: "0.4rem",
                              background: "#f9fafb",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 600,
                                marginBottom: "0.25rem",
                              }}
                            >
                              Sentido{" "}
                              {dir.headsign ||
                                (dir.direction_id !== undefined &&
                                  dir.direction_id !== null &&
                                  `(${dir.direction_id})`) ||
                                ""}
                            </div>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "#4b5563",
                                marginBottom: "0.25rem",
                              }}
                            >
                              Viajes: {dir.trip_count}. Primera salida:{" "}
                              {stripSeconds(dir.first_departure)}. Última
                              salida: {stripSeconds(dir.last_departure)}.
                            </div>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "#374151",
                              }}
                            >
                              Salidas:{" "}
                              {sample
                                .map((t) => stripSeconds(t))
                                .join(" · ")}
                              {remaining > 0 && ` ... (+${remaining} más)`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {transitRouteDetailsQuery.data && (
                <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  Puedes seleccionar otra ruta desde el mapa (clic en una
                  parada) o desde el desplegable superior.
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;


