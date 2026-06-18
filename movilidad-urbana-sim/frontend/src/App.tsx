import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MapView } from "./components/MapView";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type Profile = "driving" | "cycling" | "foot";
type UiMode = Profile | "transit";
type BasemapMode = "light" | "color" | "osm" | "relief" | "satellite" | "pnoa";

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
  color?: string | null;
  text_color?: string | null;
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

type TransitRouteVariant = {
  direction_id?: number | null;
  headsign?: string | null;
  stops: (GtfsStop & { sequence: number })[];
  shape?: Point[];
};

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
  variants: TransitRouteVariant[];
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

type LpmcVariant = string;
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
    pt_available: boolean;
    short_trip: boolean;
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
  model_info: { itinerary_index: number; total_itineraries: number; pt_available: boolean; short_trip: boolean };
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
  itinerary_index?: number,
  model_variant?: LpmcVariant
): Promise<LpmcPredictResponse> {
  const res = await fetch(`${API_BASE_URL}/api/lpmc/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination, user_profile, itinerary_index, model_variant }),
  });
  if (!res.ok) throw new Error(`Error LPMC predict: ${res.status}`);
  return res.json();
}

async function fetchLpmcDebug(
  origin: Point,
  destination: Point,
  user_profile: LpmcUserProfile,
  itinerary_index?: number,
  model_variant?: LpmcVariant
): Promise<LpmcDebugResponse> {
  const res = await fetch(`${API_BASE_URL}/api/lpmc/debug-features`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination, user_profile, itinerary_index, model_variant }),
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

const BASEMAP_OPTIONS: { value: BasemapMode; label: string; thumb: string; credit: string }[] = [
  {
    value: "light",
    label: "B&N",
    thumb: "https://a.basemaps.cartocdn.com/light_all/11/1001/775.png",
    credit: "© OpenStreetMap · CARTO",
  },
  {
    value: "color",
    label: "Color",
    thumb: "https://a.basemaps.cartocdn.com/rastertiles/voyager/11/1001/775.png",
    credit: "© OpenStreetMap · CARTO",
  },
  {
    value: "relief",
    label: "Topográfico",
    thumb: "https://a.tile.opentopomap.org/11/1001/775.png",
    credit: "© OpenStreetMap · OpenTopoMap",
  },
  {
    value: "satellite",
    label: "Satélite",
    thumb: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/11/775/1001",
    credit: "© Esri",
  },
  {
    value: "osm",
    label: "OSM",
    thumb: "https://tile.openstreetmap.org/11/1001/775.png",
    credit: "© OpenStreetMap",
  },
  {
    value: "pnoa",
    label: "PNOA",
    thumb: "https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=OI.OrthoimageCoverage&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX=11&TILEROW=775&TILECOL=1001&FORMAT=image/jpeg",
    credit: "© IGN España",
  },
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

const MODEL_VARIANT_LABELS: Record<string, string> = {
  xgb: "XGBoost",
  rf:  "Random Forest",
  dnn: "DNN",
};

function modelVariantLabel(v: string): string {
  return MODEL_VARIANT_LABELS[v] ?? v.toUpperCase();
}

const KNOWN_MODEL_DESCRIPTIONS: Record<string, string> = {
  xgb: "Gradient boosting. Mejor rendimiento general (acc. ~0.73 test).",
  rf:  "Bosque aleatorio. Más robusto a outliers.",
  dnn: "Red neuronal profunda con BatchNorm y Dropout.",
};

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

// 26 colores distintos para las 25 líneas únicas del GTFS de Toledo.
// Todos oscuros suficiente para texto blanco en badges y visibles en el mapa.
function hslForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 70%, 35%)`;
}

function routeColor(r: { color?: string | null; short_name?: string | null; id: string }): string {
  if (r.color) return `#${r.color}`;
  return hslForKey(r.short_name || r.id);
}

function routeTextColor(r: { text_color?: string | null }): string {
  return r.text_color ? `#${r.text_color}` : 'white';
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

function groupByHour(departures: string[]): [string, string[]][] {
  const map = new Map<string, string[]>();
  for (const t of departures) {
    const parts = t.split(':');
    const hour = parts[0].padStart(2, '0');
    const min = (parts[1] || '00');
    if (!map.has(hour)) map.set(hour, []);
    map.get(hour)!.push(min);
  }
  return [...map.entries()];
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
  const [highlightedStopId, setHighlightedStopId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<Point | null>(null);

  // Fecha por defecto = última fecha válida del feed GTFS activo (22/05/2026).
  // El feed cubre 22/02/2026–22/05/2026; fuera de ese rango el backend devuelve vacío.
  // Mismo parche que OTP (date=2025-12-01): usar fecha fija dentro del rango del feed.
  const [scheduleDate, setScheduleDate] = useState<string>('2026-05-22');
  const [activePanel, setActivePanel] = useState<'about' | 'routes' | 'gtfs' | 'predict' | 'layers' | 'settings' | null>('about');
  const [showLpmcDebug, setShowLpmcDebug] = useState(false);
  const [activeModel, setActiveModel] = useState<LpmcVariant>('xgb');
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

  function togglePanel(panel: 'routes' | 'gtfs' | 'predict' | 'layers' | 'settings') {
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
      fetchLpmcPredict(origin, destination, lpmcProfile, idx ?? transitItineraryIndex, activeModel),
  });

  const lpmcDebugMutation = useMutation<LpmcDebugResponse, Error, number | undefined>({
    mutationFn: (idx) =>
      fetchLpmcDebug(origin, destination, lpmcProfile, idx ?? transitItineraryIndex, activeModel),
  });

  const lpmcCompareMutation = useMutation<LpmcCompareResponse, Error, number | undefined>({
    mutationFn: (idx) =>
      fetchLpmcCompare(origin, destination, lpmcProfile, idx ?? transitItineraryIndex),
  });

  const lpmcModelsQuery = useQuery<{ available: string[]; default_variant: string }>({
    queryKey: ["lpmc-models"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/lpmc/models`);
      if (!res.ok) throw new Error("Error cargando disponibilidad de modelos");
      return res.json();
    },
    staleTime: 60_000,
  });

  const modelInitialized = useRef(false);
  useEffect(() => {
    if (!modelInitialized.current && lpmcModelsQuery.data) {
      setActiveModel(lpmcModelsQuery.data.default_variant);
      modelInitialized.current = true;
    }
  }, [lpmcModelsQuery.data]);

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
  // El GTFS de Toledo no tiene direction_id: cada sentido es un route_id distinto
  // con el mismo short_name (p.ej. L5 → 50011 y 50012). Los "hermanos" son todos
  // los route_id que comparten short_name con el seleccionado.
  const selectedRouteShortName = gtfsRoutesQuery.data?.find(r => r.id === selectedTransitRouteId)?.short_name;
  const siblingRouteIds: string[] = selectedRouteShortName
    ? (gtfsRoutesQuery.data?.filter(r => r.short_name === selectedRouteShortName).map(r => r.id) ?? [])
    : (selectedTransitRouteId ? [selectedTransitRouteId] : []);
  // El índice activo se deriva de dónde cae selectedTransitRouteId en los hermanos.
  // Así, clicar un chip de parada (que conoce el route_id exacto) muestra el sentido correcto.
  const selectedVariantIndex = selectedTransitRouteId
    ? Math.max(0, siblingRouteIds.indexOf(selectedTransitRouteId))
    : 0;
  const activeRouteId = selectedTransitRouteId;

  const transitRouteDetailsQuery = useQuery<TransitRouteDetails>({
    queryKey: ["gtfs-route-details", activeRouteId],
    enabled: !!activeRouteId,
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/gtfs/routes/${activeRouteId}`
      );
      if (!res.ok) throw new Error("Error cargando detalles de ruta GTFS");
      return res.json();
    },
  });

  // Toledo GTFS: cada route_id tiene un único direction_id (variants[0] siempre)
  const selectedVariant = transitRouteDetailsQuery.data?.variants[0];
  const transitShape = selectedVariant?.shape ?? [];
  const transitRouteStops = selectedVariant?.stops ?? [];
  const transitRouteColor = transitRouteDetailsQuery.data
    ? routeColor(transitRouteDetailsQuery.data.route)
    : hslForKey(activeRouteId ?? '');

  // ------------- GTFS: horarios de la ruta seleccionada -------------

  const transitScheduleQuery = useQuery<TransitRouteSchedule>({
    queryKey: ["gtfs-route-schedule", activeRouteId, scheduleDate],
    enabled: !!activeRouteId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (scheduleDate) {
        params.set("date", scheduleDate);
      }
      const res = await fetch(
        `${API_BASE_URL}/api/gtfs/routes/${activeRouteId}/schedule?${params.toString()}`
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
    const routes = gtfsRoutesQuery.data.filter(r => {
      const key = r.short_name || r.long_name || r.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return routes.sort((a, b) =>
      (a.short_name || a.id).localeCompare(b.short_name || b.id, undefined, { numeric: true })
    );
  })();
  const filteredRoutes = routeFilter.trim()
    ? uniqueRoutes.filter(r => {
        const q = routeFilter.toLowerCase();
        return (r.short_name || '').toLowerCase().includes(q)
          || (r.long_name || '').toLowerCase().includes(q);
      })
    : uniqueRoutes;

  const routeSiblingsByShortName = new Map<string, string[]>();
  if (gtfsRoutesQuery.data) {
    for (const r of gtfsRoutesQuery.data) {
      const key = r.short_name || r.id;
      if (!routeSiblingsByShortName.has(key)) routeSiblingsByShortName.set(key, []);
      routeSiblingsByShortName.get(key)!.push(r.id);
    }
  }

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
            onSelectTransitRoute={(routeId, fromStopId) => {
              setSelectedTransitRouteId(routeId);
              setHighlightedStopId(fromStopId ?? null);
              setActivePanel('gtfs');
            }}
            transitSegments={
              selectedModes.has("transit") ? transitResult?.segments ?? [] : []
            }
            flyTarget={flyTarget}
            onFlyDone={() => setFlyTarget(null)}
            highlightedStopId={highlightedStopId ?? undefined}
      />

      {/* Sidebar */}
      <aside className="sidebar">
        {/* ── Icon Rail ── */}
        <nav className="sidebar-rail">
          <button className="rail-logo" onClick={() => togglePanel('about')} title="Inicio">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </button>

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

          <button
            className={`rail-btn${activePanel === 'settings' ? ' rail-btn--active' : ''}`}
            onClick={() => togglePanel('settings')}
            title="Ajustes"
          >
            <span className="rail-btn__icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.22-.07.47.12.61l2.03 1.58c-.05.3-.07.63-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </span>
            <span className="rail-btn__label">Ajustes</span>
          </button>
        </nav>

        {/* ── Expanded Panel ── */}
        {activePanel && (
          <div className="sidebar-panel">
            <div className="panel-header">
              <h2 className="panel-title">
                {activePanel === 'about'    && 'Inicio'}
                {activePanel === 'routes'   && 'Planificar ruta'}
                {activePanel === 'gtfs'     && 'Red de transporte'}
                {activePanel === 'predict'  && 'Predicción modal'}
                {activePanel === 'layers'   && 'Mapa base'}
                {activePanel === 'settings' && 'Ajustes'}
              </h2>
              <button className="panel-close" onClick={() => setActivePanel(null)} title="Cerrar">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>

            <div className="panel-body">

              {/* ════ ABOUT ════ */}
              {activePanel === 'about' && (
                <div className="about-panel">
                  <div className="about-panel-hero">
                    <div className="about-panel-logo">
                      <svg viewBox="0 0 24 24" width="32" height="32" fill="white">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                      </svg>
                    </div>
                    <div>
                      <div className="about-panel-name">Simulador de Movilidad Urbana</div>
                      <div className="about-panel-loc">Toledo</div>
                    </div>
                  </div>

                  <p className="about-panel-desc">
                    Prototipo web para analizar el impacto de políticas de transporte en
                    el reparto modal. Combina enrutado viario real (OSRM), transporte
                    público (OpenTripPlanner + GTFS Toledo) y modelos de Machine Learning
                    entrenados con el dataset LPMC para predecir la elección entre a pie,
                    bicicleta, transporte público y coche.
                  </p>

                  <div className="about-panel-section">Tecnologías</div>
                  <ul className="about-panel-tech">
                    <li><span className="about-badge">FastAPI</span>Backend y orquestación de servicios</li>
                    <li><span className="about-badge">React + Leaflet</span>Interfaz web interactiva</li>
                    <li><span className="about-badge">OSRM</span>Enrutado viario (coche, bici, a pie)</li>
                    <li><span className="about-badge">OpenTripPlanner</span>Planificación multimodal con GTFS</li>
                    <li><span className="about-badge">XGBoost · RF · DNN</span>Elección modal (LPMC)</li>
                  </ul>

                  <div className="about-panel-section">Créditos</div>
                  <div className="about-panel-credits">
                    <div className="about-panel-credit-row"><span>Autor</span><span>Iván Hernández</span></div>
                    <div className="about-panel-credit-row"><span>Tutor</span><span>José Martín Baos</span></div>
                    <div className="about-panel-credit-row"><span>Centro</span><span>ESIIAB, UCLM</span></div>
                    <div className="about-panel-credit-row"><span>Dataset</span><span>LPMC — Hillel et al., 2018</span></div>
                    <div className="about-panel-credit-row"><span>GTFS</span><span>Bus Urbano de Toledo, NAP</span></div>
                    <div className="about-panel-credit-row"><span>Cartografía</span><span>© OpenStreetMap contributors</span></div>
                  </div>

                  <div className="about-panel-footer">
                    Trabajo de Fin de Máster · MUII · Convocatoria ordinaria julio 2026
                  </div>
                </div>
              )}

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
                  {/* Controles siempre visibles */}
                  <div className="field-block" style={{ marginBottom: '2px' }}>
                    <span className="field-label">Fecha horarios</span>
                    <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
                  </div>
                  <p style={{ fontSize: '.7rem', color: '#9aa0a6', marginBottom: '10px' }}>Feed: 22/02/2026 – 22/05/2026</p>

                  {/* Buscador */}
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

                  {/* Lista acordeón */}
                  <div className="gtfs-accordion">
                    {filteredRoutes.map(r => {
                      const color = routeColor(r);
                      const key = r.short_name || r.id;
                      const siblings = routeSiblingsByShortName.get(key) ?? [r.id];
                      const hasVariants = siblings.length > 1;
                      const isOpen = !!selectedRouteShortName
                        ? r.short_name === selectedRouteShortName
                        : r.id === selectedTransitRouteId;

                      return (
                        <div key={r.id} className={`gtfs-line${isOpen ? ' gtfs-line--open' : ''}`}>
                          <button
                            className="gtfs-line-header"
                            onClick={() => {
                              if (isOpen) {
                                setSelectedTransitRouteId(null);
                                setHighlightedStopId(null);
                              } else {
                                setSelectedTransitRouteId(siblings[0]);
                                setHighlightedStopId(null);
                              }
                            }}
                          >
                            <span className="gtfs-line-badge" style={{ background: color, color: routeTextColor(r) }}>{r.short_name || r.id}</span>
                            <span className="gtfs-line-name">{r.long_name || ''}</span>
                            {hasVariants && (
                              <svg className={`gtfs-chevron${isOpen ? ' gtfs-chevron--open' : ''}`} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M6 9l6 6 6-6"/>
                              </svg>
                            )}
                          </button>

                          {isOpen && (
                            <div className="gtfs-line-body">
                              {/* Sub-trayectos */}
                              {hasVariants && (
                                <div className="gtfs-variant-list">
                                  {siblings.map(rid => {
                                    const info = gtfsRoutesQuery.data?.find(r2 => r2.id === rid);
                                    const active = activeRouteId === rid;
                                    return (
                                      <button
                                        key={rid}
                                        className={`gtfs-variant-item${active ? ' gtfs-variant-item--active' : ''}`}
                                        style={{ borderLeftColor: active ? color : '#e8eaed' }}
                                        onClick={() => setSelectedTransitRouteId(rid)}
                                      >
                                        <span className="gtfs-variant-dot" style={{ background: active ? color : '#9aa0a6' }} />
                                        <span>{info?.long_name || rid}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {transitRouteDetailsQuery.isFetching && (
                                <p style={{ fontSize: '.75rem', color: '#9aa0a6', padding: '6px 12px' }}>Cargando paradas…</p>
                              )}

                              {/* Diagrama de paradas */}
                              {transitRouteStops.length > 0 && (
                                <div className="stop-diagram" style={{ '--route-color': color } as React.CSSProperties}>
                                  <div className="stop-diagram-title">{transitRouteStops.length} paradas</div>
                                  {transitRouteStops.map((stop, idx) => {
                                    const isFirst = idx === 0;
                                    const isLast = idx === transitRouteStops.length - 1;
                                    const isHighlighted = stop.id === highlightedStopId;
                                    const isTerminal = isFirst || isLast;
                                    return (
                                      <div key={stop.id} className={`stop-row${isHighlighted ? ' stop-row--hl' : ''}`}>
                                        <div className="stop-row__track">
                                          <div className={`stop-row__seg${isFirst ? ' stop-row__seg--none' : ''}`} />
                                          <div className={`stop-row__dot${isTerminal ? ' stop-row__dot--terminal' : ''}${isHighlighted ? ' stop-row__dot--hl' : ''}`} />
                                          <div className={`stop-row__seg${isLast ? ' stop-row__seg--none' : ''}`} />
                                        </div>
                                        <button className="stop-row__label" onClick={() => { setFlyTarget({ lat: stop.lat, lon: stop.lon }); setHighlightedStopId(stop.id); }}>
                                          {stop.name}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Horarios */}
                              {transitScheduleQuery.isLoading && <p style={{ fontSize: '.75rem', color: '#9aa0a6', padding: '6px 12px' }}>Cargando horarios…</p>}
                              {transitScheduleQuery.data && (
                                transitScheduleQuery.data.directions.length === 0
                                  ? <p style={{ fontSize: '.8rem', color: '#5f6368', padding: '6px 12px' }}>No hay servicios para esta fecha.</p>
                                  : <div className="gtfs-schedule">
                                      <div className="gtfs-schedule-title">Salidas</div>
                                      {transitScheduleQuery.data.directions.map((dir, didx) => {
                                        const hourRows = groupByHour(dir.departures);
                                        return (
                                          <div key={didx} className="gtfs-schedule-section">
                                            {transitScheduleQuery.data!.directions.length > 1 && (
                                              <div className="gtfs-schedule-dir">{dir.headsign || `Dirección ${didx + 1}`}</div>
                                            )}
                                            <div className="gtfs-schedule-meta">{dir.trip_count} viajes · {stripSeconds(dir.first_departure)} – {stripSeconds(dir.last_departure)}</div>
                                            <table className="gtfs-schedule-table">
                                              <tbody>
                                                {hourRows.map(([hour, mins]) => (
                                                  <tr key={hour}>
                                                    <td className="gtfs-hour">{hour}</td>
                                                    <td className="gtfs-mins">{mins.join(' ')}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        );
                                      })}
                                    </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filteredRoutes.length === 0 && routeFilter && (
                      <p style={{ fontSize: '.78rem', color: '#9aa0a6', textAlign: 'center', padding: '12px 0' }}>Sin resultados</p>
                    )}
                  </div>
                </>
              )}

              {/* ════ PREDICT ════ */}
              {activePanel === 'predict' && (
                <>
                  <div className="model-toolbar">
                    <span className="status-pill">{modelVariantLabel(activeModel)} activo</span>
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

                  {lpmcPredictMutation.data?.model_info?.short_trip && (
                    <div className="short-trip-notice">
                      Trayecto corto (&lt;500 m): se ha añadido un overhead de aparcamiento al coche.
                    </div>
                  )}
                  {lpmcPredictMutation.data?.model_info?.pt_available === false && (
                    <div className="pt-unavailable-notice">
                      Sin servicio de bus en este trayecto: la probabilidad de transporte público ha sido suprimida.
                    </div>
                  )}

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

                  {lpmcCompareMutation.data?.model_info?.short_trip && (
                    <div className="short-trip-notice">
                      Trayecto corto (&lt;500 m): se ha añadido un overhead de aparcamiento al coche.
                    </div>
                  )}
                  {lpmcCompareMutation.data?.model_info?.pt_available === false && (
                    <div className="pt-unavailable-notice">
                      Sin servicio de bus en este trayecto: la probabilidad de transporte público ha sido suprimida.
                    </div>
                  )}

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
                        <img className="basemap-thumb" src={option.thumb} alt={option.label} loading="lazy" />
                        <span className="basemap-label">{option.label}</span>
                        <span className="basemap-credit">{option.credit}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ════ SETTINGS ════ */}
              {activePanel === 'settings' && (
                <>
                  {/* Visualización */}
                  <div className="settings-section">
                    <div className="settings-section-title">Visualización del mapa</div>
                    <label className="stops-toggle">
                      <input
                        type="checkbox"
                        checked={showGtfsStops}
                        onChange={(e) => setShowGtfsStops(e.target.checked)}
                      />
                      Mostrar paradas de bus en el mapa
                    </label>
                  </div>

                  {/* Modelo activo */}
                  <div className="settings-section">
                    <div className="settings-section-title">Modelo de inferencia activo</div>
                    <p className="settings-hint">
                      El modelo seleccionado se usa con el botón "Inferir modo" en el panel IA.
                      "Comparar modelos" siempre ejecuta los tres independientemente.
                    </p>
                    {(lpmcModelsQuery.data?.available ?? ["xgb", "rf", "dnn"]).map((variant) => {
                      const isActive = activeModel === variant;
                      return (
                        <button
                          key={variant}
                          type="button"
                          className={`model-option${isActive ? ' model-option--active' : ''}`}
                          onClick={() => setActiveModel(variant)}
                        >
                          <span className="model-option__name">{modelVariantLabel(variant)}</span>
                          <span className="model-option__desc">
                            {KNOWN_MODEL_DESCRIPTIONS[variant] ?? "Modelo personalizado"}
                          </span>
                          {isActive && (
                            <span className="model-badge model-badge--active">Activo</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Instrucciones modelo propio */}
                  <div className="settings-section">
                    <div className="settings-section-title">Añadir modelo propio</div>
                    <details className="model-instructions">
                      <summary>¿Cómo añadir un modelo entrenado?</summary>
                      <div className="model-instructions-body">
                        <p>Copia los dos artefactos en <code>lpmc/models/</code> siguiendo el convenio:</p>
                        <pre>{`{nombre}_lpmc.joblib\n{nombre}_lpmc_scaler.joblib`}</pre>
                        <p>El nombre puede ser cualquier combinación de letras minúsculas, dígitos y guiones bajos. El modelo aparece automáticamente en este panel sin reiniciar el contenedor.</p>
                        <p>Formato del bundle para scikit-learn (XGBoost, RF, SVM…):</p>
                        <pre>{`{ "model": <estimator>,\n  "feature_names": [...] }`}</pre>
                        <p>Formato para PyTorch:</p>
                        <pre>{`{ "pt_path": "ruta/modelo.pt",\n  "n_features": <int> }`}</pre>
                        <p>Para que el modelo arranque seleccionado por defecto, establece <code>LPMC_MODEL_VARIANT: nombre</code> en el <code>docker-compose.yml</code> y reinicia el backend.</p>
                        <p>Si los ficheros están fuera de <code>lpmc/models/</code>, usa <code>LPMC_MODEL_PATH</code> y <code>LPMC_SCALER_PATH</code> junto con <code>LPMC_MODEL_VARIANT</code>.</p>
                      </div>
                    </details>
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
