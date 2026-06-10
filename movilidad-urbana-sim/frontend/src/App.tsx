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
  "#3b82f6", // azul
  "#ec4899", // rosa
  "#10b981", // esmeralda
  "#f59e0b", // ámbar
  "#6366f1", // índigo
  "#ef4444", // rojo
  "#84cc16", // lima
  "#06b6d4", // cian
  "#8b5cf6", // púrpura
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

  // Fecha por defecto = última fecha válida del feed GTFS activo (22/05/2026).
  // El feed cubre 22/02/2026–22/05/2026; fuera de ese rango el backend devuelve vacío.
  // Mismo parche que OTP (date=2025-12-01): usar fecha fija dentro del rango del feed.
  const [scheduleDate, setScheduleDate] = useState<string>('2026-05-22');
  const [activePanel, setActivePanel] = useState<'routes' | 'gtfs' | 'predict' | 'layers' | null>('routes');
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

  function togglePanel(panel: 'routes' | 'gtfs' | 'predict' | 'layers') {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  function handleModeClick(mode: UiMode, e: React.MouseEvent) {
    if (e.shiftKey) {
      setSelectedModes((prev) => {
        const next = new Set(prev);
        if (next.has(mode)) {
          next.delete(mode);
        } else {
          next.add(mode);
        }
        return next;
      });
    } else {
      setSelectedModes(new Set([mode]));
    }
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

  // Rutas deduplicadas por short_name para el panel Red
  const [routeFilter, setRouteFilter] = useState('');
  const uniqueRoutes = (() => {
    if (!gtfsRoutesQuery.data) return [];
    const seen = new Set<string>();
    return gtfsRoutesQuery.data.filter(r => {
      const key = r.short_name || r.long_name || r.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
  const selectedRouteShortName = gtfsRoutesQuery.data?.find(r => r.id === selectedTransitRouteId)?.short_name;
  const filteredRoutes = routeFilter.trim()
    ? uniqueRoutes.filter(r => {
        const q = routeFilter.toLowerCase();
        return (r.short_name || '').toLowerCase().includes(q)
          || (r.long_name || '').toLowerCase().includes(q);
      })
    : uniqueRoutes;

  return (
    <div className="app-root">
      {/* Map — fullscreen background */}
      <MapView
            origin={origin}
            destination={destination}
            setOrigin={setOrigin}
            setDestination={setDestination}
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
              setActivePanel('gtfs');
            }}
            transitSegments={
              selectedModes.has("transit") ? transitResult?.segments ?? [] : []
            }
      />

      {/* Sidebar */}
      <aside className="sidebar">
        {/* ── Icon Rail ── */}
        <nav className="sidebar-rail">
          <div className="rail-logo">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>

          <button
            className={`rail-btn${activePanel === 'routes' ? ' rail-btn--active' : ''}`}
            onClick={() => togglePanel('routes')}
            title="Planificar ruta"
          >
            <span className="rail-btn__icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M21.71 11.29l-9-9a1 1 0 0 0-1.42 0l-9 9a1 1 0 0 0 0 1.42l9 9a1 1 0 0 0 1.42 0l9-9a1 1 0 0 0 0-1.42zM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/>
              </svg>
            </span>
            <span className="rail-btn__label">Rutas</span>
          </button>

          <button
            className={`rail-btn${activePanel === 'gtfs' ? ' rail-btn--active' : ''}`}
            onClick={() => togglePanel('gtfs')}
            title="Red de transporte"
          >
            <span className="rail-btn__icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM18 11H6V6h12v5z"/>
              </svg>
            </span>
            <span className="rail-btn__label">Red</span>
          </button>

          <button
            className={`rail-btn${activePanel === 'predict' ? ' rail-btn--active' : ''}`}
            onClick={() => togglePanel('predict')}
            title="Predicción modal"
          >
            <span className="rail-btn__icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </span>
            <span className="rail-btn__label">IA</span>
          </button>

          <div className="rail-spacer" />

          <button
            className={`rail-btn${activePanel === 'layers' ? ' rail-btn--active' : ''}`}
            onClick={() => togglePanel('layers')}
            title="Mapa base"
          >
            <span className="rail-btn__icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>
              </svg>
            </span>
            <span className="rail-btn__label">Capas</span>
          </button>
        </nav>

        {/* ── Expanded Panel ── */}
        {activePanel && (
          <div className="sidebar-panel">
            <div className="panel-header">
              <h2 className="panel-title">
                {activePanel === 'routes'  && 'Planificar ruta'}
                {activePanel === 'gtfs'    && 'Red de transporte'}
                {activePanel === 'predict' && 'Predicción modal'}
                {activePanel === 'layers'  && 'Mapa base'}
              </h2>
              <button className="panel-close" onClick={() => setActivePanel(null)} title="Cerrar">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>

            <div className="panel-body">

              {/* ════ ROUTES ════ */}
              {activePanel === 'routes' && (
                <>
                  <div className="od-box">
                    <div className="od-row">
                      <span className="od-dot od-dot--origin" />
                      <span className="od-coords">{origin.lat.toFixed(4)}, {origin.lon.toFixed(4)}</span>
                    </div>
                    <div className="od-row">
                      <span className="od-dot od-dot--dest" />
                      <span className="od-coords">{destination.lat.toFixed(4)}, {destination.lon.toFixed(4)}</span>
                    </div>
                  </div>
                  <p className="hint-text">Clic derecho en el mapa para establecer origen o destino.</p>

                  <div className="mode-toolbar">
                    {(["driving", "cycling", "foot"] as Profile[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="mode-button"
                        style={selectedModes.has(p) ? { background: MODE_COLORS[p], borderColor: MODE_COLORS[p], color: '#fff' } : undefined}
                        onClick={(e) => handleModeClick(p, e)}
                        disabled={isCalculating}
                      >
                        {PROFILE_LABELS[p]}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="mode-button"
                      style={selectedModes.has("transit") ? { background: MODE_COLORS.transit, borderColor: MODE_COLORS.transit, color: '#fff' } : undefined}
                      onClick={(e) => handleModeClick("transit", e)}
                      disabled={isCalculating || !transitMutation.data}
                    >
                      Bus
                    </button>
                  </div>

                  <button
                    className="primary-button"
                    onClick={() => {
                      osrmMutation.mutate();
                      setTransitItineraryIndex(0);
                      transitMutation.mutate(0);
                    }}
                    disabled={isCalculating}
                  >
                    {isCalculating ? 'Calculando...' : 'Calcular rutas'}
                  </button>

                  {osrmMutation.error && <p className="error-text">Error OSRM: {(osrmMutation.error as Error).message}</p>}
                  {transitMutation.error && <p className="error-text">Error OTP: {(transitMutation.error as Error).message}</p>}

                  {(osrmMutation.data || transitMutation.data) && (
                    <table className="routes-table">
                      <thead>
                        <tr><th>Modo</th><th>Distancia</th><th>Tiempo</th></tr>
                      </thead>
                      <tbody>
                        {osrmMutation.data?.results.map((r) => (
                          <tr key={r.profile} className={selectedModes.has(r.profile) ? 'row-active' : undefined}>
                            <td>{PROFILE_LABELS[r.profile]}</td>
                            <td>{(r.distance_m / 1000).toFixed(2)} km</td>
                            <td>{(r.duration_s / 60).toFixed(0)} min</td>
                          </tr>
                        ))}
                        {transitMutation.data && (
                          <tr className={selectedModes.has("transit") ? 'row-active' : undefined}>
                            <td>
                              Bus
                              {transitLineLabel && <div style={{ fontSize: '.72rem', color: '#5f6368' }}>Línea {transitLineLabel}</div>}
                            </td>
                            <td>{(transitMutation.data.distance_m / 1000).toFixed(2)} km</td>
                            <td>{(transitMutation.data.duration_s / 60).toFixed(0)} min</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}

                  {transitResult && (
                    <div className="itinerary-nav">
                      <button
                        type="button"
                        onClick={() => {
                          if (transitItineraryIndex <= 0) return;
                          const next = transitItineraryIndex - 1;
                          setTransitItineraryIndex(next);
                          transitMutation.mutate(next);
                        }}
                        disabled={transitItineraryIndex <= 0 || transitMutation.isPending}
                      >← Anterior</button>
                      <span>Itinerario {transitItineraryIndex + 1} / {totalItineraries || '?'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!totalItineraries || transitItineraryIndex >= totalItineraries - 1) return;
                          const next = transitItineraryIndex + 1;
                          setTransitItineraryIndex(next);
                          transitMutation.mutate(next);
                        }}
                        disabled={!totalItineraries || transitItineraryIndex >= totalItineraries - 1 || transitMutation.isPending}
                      >Siguiente →</button>
                    </div>
                  )}

                  {selectedModes.has("transit") && transitResult && (
                    <div className="transit-brief">
                      <h3 className="mini-title">Detalle del itinerario</h3>
                      <ol>
                        {transitResult.segments.map((seg, idx) => {
                          const distKm = seg.distance_m / 1000;
                          const durMin = seg.duration_s / 60;
                          if (seg.mode === 'WALK') {
                            return (
                              <li key={idx}>
                                Caminar {distKm.toFixed(2)} km ({durMin.toFixed(0)} min)
                                {seg.to_stop_name && <> hasta <strong>{seg.to_stop_name}</strong></>}
                              </li>
                            );
                          }
                          const label = seg.route_short_name || seg.route_long_name || seg.route_id || seg.mode;
                          return (
                            <li key={idx}>
                              {seg.departure && <span>{seg.departure} · </span>}
                              <strong>Línea {label}</strong>
                              {seg.from_stop_name && seg.to_stop_name && <> de <strong>{seg.from_stop_name}</strong> a <strong>{seg.to_stop_name}</strong></>}
                              {' · '}{distKm.toFixed(2)} km ({durMin.toFixed(0)} min)
                              {seg.arrival && <> · llegada {seg.arrival}</>}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </>
              )}

              {/* ════ GTFS ════ */}
              {activePanel === 'gtfs' && (
                <>
                  <label className="stops-toggle">
                    <input type="checkbox" checked={showGtfsStops} onChange={(e) => setShowGtfsStops(e.target.checked)} />
                    Mostrar paradas en el mapa
                  </label>

                  {/* Buscador de líneas */}
                  <div style={{ marginBottom: '10px', position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Buscar línea…"
                      value={routeFilter}
                      onChange={e => setRouteFilter(e.target.value)}
                      style={{ width: '100%', height: '34px', padding: '0 10px 0 32px', border: '1px solid #dadce0', borderRadius: '6px', fontSize: '.82rem', fontFamily: 'inherit' }}
                    />
                    <svg style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#9aa0a6" strokeWidth="2.2">
                      <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                  </div>

                  {gtfsRoutesQuery.isLoading && <p style={{ fontSize: '.78rem', color: '#9aa0a6' }}>Cargando líneas…</p>}
                  {gtfsRoutesQuery.error && <p className="error-text">Error cargando rutas.</p>}

                  {/* Lista de tarjetas de línea */}
                  <div className="route-list">
                    {filteredRoutes.map(r => {
                      const color = colorForRouteId(r.id);
                      const isSelected = r.id === selectedTransitRouteId ||
                        (!!r.short_name && r.short_name === selectedRouteShortName);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className={`route-card${isSelected ? ' route-card--active' : ''}`}
                          onClick={() => setSelectedTransitRouteId(isSelected ? null : r.id)}
                        >
                          <span className="route-card__badge" style={{ background: color }}>
                            {r.short_name || r.id}
                          </span>
                          <span className="route-card__name">{r.long_name || ''}</span>
                        </button>
                      );
                    })}
                    {filteredRoutes.length === 0 && routeFilter && (
                      <p style={{ fontSize: '.78rem', color: '#9aa0a6', textAlign: 'center', padding: '12px 0' }}>Sin resultados</p>
                    )}
                  </div>

                  {transitRouteDetailsQuery.data && (
                    <p style={{ fontSize: '.82rem', marginBottom: '10px', paddingTop: '8px', borderTop: '1px solid #f1f3f4' }}>
                      <strong>
                        {transitRouteDetailsQuery.data.route.short_name ||
                          transitRouteDetailsQuery.data.route.long_name ||
                          transitRouteDetailsQuery.data.route.id}
                      </strong>{' — '}{transitRouteStops.length} paradas
                    </p>
                  )}

                  {selectedTransitRouteId && (
                    <>
                      <div className="field-block" style={{ marginBottom: '4px' }}>
                        <span className="field-label">Fecha</span>
                        <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
                      </div>
                      <p style={{ fontSize: '.72rem', color: '#9aa0a6', marginBottom: '10px' }}>
                        Feed válido: 22/02/2026 – 22/05/2026
                      </p>

                      {transitScheduleQuery.isLoading && <p style={{ fontSize: '.8rem', color: '#9aa0a6' }}>Cargando horarios...</p>}
                      {transitScheduleQuery.error && <p className="error-text">Error cargando horarios.</p>}

                      {transitScheduleQuery.data && (
                        transitScheduleQuery.data.directions.length === 0
                          ? <p style={{ fontSize: '.82rem', color: '#5f6368' }}>No hay servicios para esta fecha.</p>
                          : <div>
                              {transitScheduleQuery.data.directions.map((dir, idx) => {
                                const sample = dir.departures.slice(0, 10);
                                const remaining = dir.departures.length - sample.length;
                                return (
                                  <div key={dir.direction_id ?? idx} style={{ marginBottom: '10px', padding: '9px 12px', borderRadius: '8px', background: '#f8f9fa', border: '1px solid #e8eaed' }}>
                                    <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '.82rem' }}>
                                      Sentido {dir.headsign || (dir.direction_id != null && `(dir. ${dir.direction_id})`) || ''}
                                    </div>
                                    <div style={{ fontSize: '.75rem', color: '#5f6368', marginBottom: '4px' }}>
                                      {dir.trip_count} viajes · {stripSeconds(dir.first_departure)} → {stripSeconds(dir.last_departure)}
                                    </div>
                                    <div style={{ fontSize: '.75rem', color: '#3c4043' }}>
                                      {sample.map(t => stripSeconds(t)).join(' · ')}
                                      {remaining > 0 && ` … +${remaining} más`}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                      )}

                      {transitRouteDetailsQuery.data && (
                        <p style={{ fontSize: '.72rem', color: '#9aa0a6', marginTop: '6px' }}>
                          Selecciona otra ruta desde el mapa o el desplegable.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ════ PREDICT ════ */}
              {activePanel === 'predict' && (
                <>
                  <div className="model-toolbar">
                    <span className="status-pill">XGBoost activo</span>
                    <span className="status-note">Inferencia de elección modal.</span>
                  </div>

                  <div className="preset-grid">
                    {PROFILE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`preset-card${selectedPresetId === preset.id ? ' preset-card--active' : ''}`}
                        onClick={() => setLpmcProfile(preset.values)}
                      >
                        <strong>{preset.label}</strong>
                        <span>{preset.description}</span>
                      </button>
                    ))}
                  </div>

                  <div className="form-grid">
                    <label className="field-block">
                      <span className="field-label">Motivo</span>
                      <select value={lpmcProfile.purpose} onChange={(e) => setLpmcProfile((p) => ({ ...p, purpose: e.target.value as LpmcPurpose }))}>
                        {PURPOSE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </label>
                    <label className="field-block">
                      <span className="field-label">Combustible</span>
                      <select value={lpmcProfile.fueltype} onChange={(e) => setLpmcProfile((p) => ({ ...p, fueltype: e.target.value as LpmcFuel }))}>
                        {FUEL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </label>
                    <label className="field-block">
                      <span className="field-label">Día</span>
                      <select value={lpmcProfile.day_of_week} onChange={(e) => setLpmcProfile((p) => ({ ...p, day_of_week: Number(e.target.value) }))}>
                        {DAY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </label>
                    <label className="field-block">
                      <span className="field-label">Hora de salida</span>
                      <input type="time" step={300} value={linearHourToTimeString(lpmcProfile.start_time_linear)} onChange={(e) => setLpmcProfile((p) => ({ ...p, start_time_linear: timeStringToLinearHour(e.target.value) }))} />
                    </label>
                    <label className="field-block">
                      <span className="field-label">Edad</span>
                      <input type="number" min={16} max={100} value={lpmcProfile.age} onChange={(e) => setLpmcProfile((p) => ({ ...p, age: Number(e.target.value) }))} />
                    </label>
                    <label className="field-block">
                      <span className="field-label">Género</span>
                      <select value={lpmcProfile.female} onChange={(e) => setLpmcProfile((p) => ({ ...p, female: Number(e.target.value) }))}>
                        <option value={0}>Masculino</option>
                        <option value={1}>Femenino</option>
                      </select>
                    </label>
                    <label className="field-block">
                      <span className="field-label">Carnet</span>
                      <select value={lpmcProfile.driving_license} onChange={(e) => setLpmcProfile((p) => ({ ...p, driving_license: Number(e.target.value) }))}>
                        <option value={1}>Sí</option>
                        <option value={0}>No</option>
                      </select>
                    </label>
                    <label className="field-block">
                      <span className="field-label">Coches hogar</span>
                      <input type="number" min={0} max={3} value={lpmcProfile.car_ownership} onChange={(e) => setLpmcProfile((p) => ({ ...p, car_ownership: Number(e.target.value) }))} />
                    </label>
                    <label className="field-block">
                      <span className="field-label">Coste bus (€)</span>
                      <input type="number" min={0} step={0.1} value={lpmcProfile.cost_transit} onChange={(e) => setLpmcProfile((p) => ({ ...p, cost_transit: Number(e.target.value) }))} />
                    </label>
                    <label className="field-block">
                      <span className="field-label">Coste coche (€)</span>
                      <input type="number" min={0} step={0.1} value={lpmcProfile.cost_driving_total} onChange={(e) => setLpmcProfile((p) => ({ ...p, cost_driving_total: Number(e.target.value) }))} />
                    </label>
                  </div>

                  <div className="action-row">
                    <button className="primary-button" style={{ flex: 1 }} onClick={() => lpmcPredictMutation.mutate(transitItineraryIndex)} disabled={lpmcPredictMutation.isPending}>
                      {lpmcPredictMutation.isPending ? 'Infiriendo...' : 'Inferir modo'}
                    </button>
                    <button style={{ flex: 1 }} onClick={() => lpmcCompareMutation.mutate(transitItineraryIndex)} disabled={lpmcCompareMutation.isPending}>
                      {lpmcCompareMutation.isPending ? 'Comparando...' : 'Comparar modelos'}
                    </button>
                  </div>

                  {lpmcPredictMutation.error && <p className="error-text">{lpmcPredictMutation.error.message}</p>}

                  {lpmcPredictMutation.data && (
                    <div className="prediction-card">
                      <div style={{ fontWeight: 700, marginBottom: '10px', color: '#1a73e8', fontSize: '.95rem' }}>
                        {LPMC_MODE_LABELS[lpmcPredictMutation.data.predicted_mode]}
                        <span style={{ fontSize: '.8rem', color: '#5f6368', fontWeight: 400, marginLeft: '6px' }}>
                          ({(lpmcPredictMutation.data.confidence * 100).toFixed(1)}% confianza)
                        </span>
                      </div>
                      <div className="prob-bars">
                        {(['walk', 'cycle', 'pt', 'drive'] as const).map((mode) => {
                          const pct = lpmcPredictMutation.data!.probabilities[mode] * 100;
                          const isWinner = lpmcPredictMutation.data!.predicted_mode === mode;
                          return (
                            <div key={mode} className="prob-row">
                              <span className="prob-label">{LPMC_MODE_LABELS[mode]}</span>
                              <div className="prob-track">
                                <div className="prob-fill" style={{ width: `${pct.toFixed(1)}%`, background: isWinner ? '#1a73e8' : '#dadce0' }} />
                              </div>
                              <span className="prob-pct" style={{ color: isWinner ? '#1a73e8' : '#5f6368', fontWeight: isWinner ? 700 : 400 }}>
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {lpmcCompareMutation.error && <p className="error-text">{lpmcCompareMutation.error.message}</p>}

                  {lpmcCompareMutation.data && (() => {
                    const { results } = lpmcCompareMutation.data;
                    const modes: Array<'walk' | 'cycle' | 'pt' | 'drive'> = ['walk', 'cycle', 'pt', 'drive'];
                    const modeLabels: Record<string, string> = { walk: 'A pie', cycle: 'Bici', pt: 'Bus', drive: 'Coche' };
                    const variants: Array<'xgb' | 'rf' | 'dnn'> = ['xgb', 'rf', 'dnn'];
                    const variantLabels: Record<string, string> = { xgb: 'XGBoost', rf: 'RF', dnn: 'DNN' };
                    return (
                      <div className="compare-table-wrap">
                        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '.82rem', color: '#3c4043' }}>Comparación de modelos</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', padding: '4px', color: '#5f6368', fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Modo</th>
                              {variants.map(v => (
                                <th key={v} style={{ textAlign: 'right', padding: '4px', color: results[v] ? '#1a73e8' : '#9aa0a6', fontSize: '.68rem' }}>
                                  {variantLabels[v]}
                                  {results[v] && <div style={{ fontSize: '.65rem', fontWeight: 700 }}>→ {modeLabels[results[v]!.predicted_mode]}</div>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {modes.map(mode => (
                              <tr key={mode} style={{ borderTop: '1px solid #e8eaed' }}>
                                <td style={{ padding: '5px 4px', color: '#3c4043' }}>{modeLabels[mode]}</td>
                                {variants.map(v => {
                                  const prob = results[v]?.probabilities[mode];
                                  const isWinner = results[v]?.predicted_mode === mode;
                                  return (
                                    <td key={v} style={{ textAlign: 'right', padding: '5px 4px', fontWeight: isWinner ? 700 : 400, color: isWinner ? '#1a73e8' : '#3c4043' }}>
                                      {prob !== undefined ? `${(prob * 100).toFixed(1)}%` : '—'}
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

                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button type="button" onClick={() => { setShowLpmcDebug(v => !v); if (!showLpmcDebug) lpmcDebugMutation.mutate(transitItineraryIndex); }}>
                      {showLpmcDebug ? 'Ocultar variables' : 'Ver variables'}
                    </button>
                  </div>

                  {showLpmcDebug && lpmcDebugMutation.data && (
                    <details open style={{ marginTop: '8px' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '.78rem', color: '#5f6368' }}>Vector de entrada al modelo</summary>
                      <pre style={{ marginTop: '6px', fontSize: '.68rem', maxHeight: '200px', overflow: 'auto', background: '#1e293b', color: '#e2e8f0', padding: '10px', borderRadius: '8px' }}>
                        {JSON.stringify(lpmcDebugMutation.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </>
              )}

              {/* ════ LAYERS ════ */}
              {activePanel === 'layers' && (
                <>
                  <p style={{ fontSize: '.82rem', color: '#5f6368', marginBottom: '14px' }}>Selecciona el estilo del mapa base.</p>
                  <div className="basemap-grid">
                    {BASEMAP_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`basemap-card${basemap === option.value ? ' basemap-card--active' : ''}`}
                        onClick={() => setBasemap(option.value)}
                      >
                        <div className={`basemap-thumb basemap-thumb--${option.value}`} />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

            </div>{/* /panel-body */}
          </div>
        )}
      </aside>
    </div>
  );
}

export default App;
