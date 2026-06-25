import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Car, Bike, Footprints, Bus, Play, Square, ChevronLeft, ChevronRight, ChevronDown, MapPin, Route, Activity, Layers, Settings, X, Search, Briefcase, GraduationCap, House, Info, CalendarClock, BarChart3, Table2 } from "lucide-react";
import { MapView } from "./components/MapView";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type Profile = "driving" | "cycling" | "foot";
type UiMode = Profile | "transit";
type BasemapMode = "light" | "color" | "osm" | "relief" | "satellite" | "pnoa";

type Point = { lat: number; lon: number };

type TransitStop = {
  name?: string | null;
  lat: number;
  lon: number;
  stop_id?: string | null;
  time?: string | null;
};

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
  stops?: TransitStop[];
};

type TransitResult = {
  distance_m: number;
  duration_s: number;
  geometry: Point[]; // ruta completa
  segments: TransitSegment[];
  itinerary_index: number;
  total_itineraries: number;
  start_time?: string | null; // hora de salida del viaje completo "HH:MM"
  end_time?: string | null;   // hora de llegada del viaje completo "HH:MM"
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
  service_days?: string | null;
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
  itineraryIndex?: number | null,
  date?: string,
  time?: string
): Promise<TransitResult> {
  const payload: any = { origin, destination };
  if (typeof itineraryIndex === "number") {
    payload.itinerary_index = itineraryIndex;
  }
  if (date) payload.date = date;
  if (time) payload.time = time;

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

function ModeIcon({ mode, size = 15 }: { mode: Profile | "transit"; size?: number }) {
  const props = { size, strokeWidth: 1.75 };
  if (mode === "driving")  return <Car {...props} />;
  if (mode === "cycling")  return <Bike {...props} />;
  if (mode === "foot")     return <Footprints {...props} />;
  return <Bus {...props} />;
}

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

// Perfil aplicado por defecto al cargar la app (también fija la fecha/hora del viaje).
const DEFAULT_PRESET = PROFILE_PRESETS[0]; // Commuter

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

const ROUTE_FEATURE_LABELS: Record<string, string> = {
  dur_walking_h: "A pie (h)",
  dur_cycling_h: "Bicicleta (h)",
  dur_pt_access_h: "Acceso parada PT (h)",
  dur_pt_rail_h: "En PT (h)",
  dur_pt_int_h: "Transbordo PT (h)",
  dur_driving_h: "Conducción (h)",
  cost_transit: "Coste bus (€)",
  cost_driving_total: "Coste coche (€)",
  distance_km: "Distancia (km)",
  pt_interchanges: "Transbordos PT",
  _PT_PENALTY_DURATION_H: "Penalización PT — dur. (h)",
  _PT_PENALTY_INTERCHANGES: "Penalización PT — transbordos",
};

function presetTooltipLines(v: LpmcUserProfile): string[] {
  const day = DAY_OPTIONS.find((d) => d.value === v.day_of_week)?.label ?? String(v.day_of_week);
  const h = Math.floor(v.start_time_linear);
  const m = Math.round((v.start_time_linear - h) * 60);
  const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const fuel = FUEL_OPTIONS.find((f) => f.value === v.fueltype)?.label ?? v.fueltype;
  const purpose = PURPOSE_OPTIONS.find((p) => p.value === v.purpose)?.label ?? v.purpose;
  return [
    purpose,
    `${day} · ${time}`,
    `${v.female ? "Mujer" : "Hombre"}, ${v.age} años`,
    `Carnet: ${v.driving_license ? "sí" : "no"} · ${v.car_ownership} coche${v.car_ownership !== 1 ? "s" : ""}`,
    `Combustible: ${fuel}`,
    `Bus: ${v.cost_transit.toFixed(2)} € · Coche: ${v.cost_driving_total.toFixed(2)} €`,
  ];
}

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

// Detecta si un color (hex de 3/6 díg., "white" o hsl) es blanco o casi blanco,
// para añadirle un contorno oscuro y que no se pierda sobre fondos claros.
function isLightColor(color: string | null | undefined): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  if (c === "white") return true;
  const hsl = c.match(/^hsl\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*([\d.]+)%/);
  if (hsl) return parseFloat(hsl[1]) >= 90;
  let hex = c.startsWith("#") ? c.slice(1) : c;
  if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
  if (!/^[0-9a-f]{6}$/.test(hex)) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 >= 0.9;
}

// Contorno negro inline para badges/puntos cuyo color de línea es muy claro.
function lineOutline(color: string): React.CSSProperties {
  return isLightColor(color) ? { boxShadow: "0 0 0 1px #000" } : {};
}

// Resuelve la línea GTFS (con su color real) que corresponde a un segmento de
// transporte de OTP. OTP devuelve route_id prefijado con el feedId (p.ej.
// "1:50011"), así que probamos: id exacto, id sin prefijo y, en último término,
// short_name (mismo criterio que el panel Red, que agrupa por short_name).
function resolveGtfsRoute(
  seg: TransitSegment,
  routes?: TransitRouteListItem[]
): TransitRouteListItem | undefined {
  if (!routes) return undefined;
  const rid = seg.route_id ?? undefined;
  if (rid) {
    const exact = routes.find((r) => r.id === rid);
    if (exact) return exact;
    const bare = rid.includes(":") ? rid.slice(rid.lastIndexOf(":") + 1) : rid;
    const byBare = routes.find((r) => r.id === bare);
    if (byBare) return byBare;
  }
  const sn = seg.route_short_name ?? undefined;
  if (sn) return routes.find((r) => r.short_name === sn);
  return undefined;
}

// Color, color de texto y etiqueta de un tramo de transporte, coherentes con el
// badge del panel Red. Si no se resuelve la línea GTFS, cae al hash de respaldo.
function transitLegChip(
  seg: TransitSegment,
  routes?: TransitRouteListItem[]
): { color: string; textColor: string; label: string } {
  const gtfs = resolveGtfsRoute(seg, routes);
  const label =
    seg.route_short_name || seg.route_long_name || gtfs?.short_name || seg.route_id || "Bus";
  if (gtfs) {
    return { color: routeColor(gtfs), textColor: routeTextColor(gtfs), label };
  }
  return {
    color: hslForKey(seg.route_short_name || seg.route_id || "bus"),
    textColor: "white",
    label,
  };
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

// Semana de referencia dentro de la ventana del feed (lun 2026-05-11 … dom 2026-05-17),
// para que los presets que indican día de la semana fijen una fecha real con servicio.
const REFERENCE_WEEK: Record<number, string> = {
  1: '2026-05-11', 2: '2026-05-12', 3: '2026-05-13', 4: '2026-05-14',
  5: '2026-05-15', 6: '2026-05-16', 7: '2026-05-17',
};

// Día de la semana (1=lunes … 7=domingo) de una fecha YYYY-MM-DD.
function deriveDayOfWeek(dateStr: string): number {
  const js = new Date(dateStr + 'T00:00:00').getDay(); // 0=domingo … 6=sábado
  return js === 0 ? 7 : js;
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

function PresetIcon({ id, size = 15 }: { id: string; size?: number }) {
  const props = { size, strokeWidth: 1.75 };
  if (id === "commuter") return <Briefcase {...props} />;
  if (id === "student") return <GraduationCap {...props} />;
  return <House {...props} />;
}

function parseCoords(text: string): Point | null {
  const parts = text.split(',');
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0].trim());
  const lon = parseFloat(parts[1].trim());
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function App() {
  const [origin, setOrigin] = useState<Point>({ lat: 39.87845, lon: -4.03703 });
  const [destination, setDestination] = useState<Point>({
    lat: 39.86007,
    lon: -4.00228,
  });
  const [originText, setOriginText] = useState('39.87845, -4.03703');
  const [destText, setDestText]     = useState('39.86007, -4.00228');
  const [originFocused, setOriginFocused] = useState(false);
  const [destFocused, setDestFocused]     = useState(false);

  const [selectedModes, setSelectedModes] = useState<Set<UiMode>>(new Set(["driving"]));
  const [basemap, setBasemap] = useState<BasemapMode>("color");
  const [transitItineraryIndex, setTransitItineraryIndex] = useState(0);

  const [showGtfsStops, setShowGtfsStops] = useState(true);
  const [selectedTransitRouteId, setSelectedTransitRouteId] = useState<
    string | null
  >(null);
  const [highlightedStopId, setHighlightedStopId] = useState<string | null>(null);
  // Parada resaltada del Detalle del itinerario, clave "segIdx-stopIdx" (una parada
  // física puede repetirse entre tramos en un transbordo, por eso no se usa stop_id).
  const [highlightedItinStop, setHighlightedItinStop] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<Point | null>(null);

  // Fecha/hora del viaje. Por defecto = las del preset inicial (Commuter): su día de
  // la semana mapeado a la semana de referencia del feed, y su hora de salida. El feed
  // cubre 22/02/2026–22/05/2026; el control del mapa acota la selección a ese rango.
  const [scheduleDate, setScheduleDate] = useState<string>(REFERENCE_WEEK[DEFAULT_PRESET.values.day_of_week]);
  const [otpTime, setOtpTime] = useState<string>(linearHourToTimeString(DEFAULT_PRESET.values.start_time_linear));
  const [activePanel, setActivePanel] = useState<'about' | 'routes' | 'gtfs' | 'predict' | 'layers' | 'settings' | null>('about');
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [activeModel, setActiveModel] = useState<LpmcVariant>('xgb');
  const [changedFields, setChangedFields] = useState<Set<keyof LpmcUserProfile>>(new Set());
  const [presetInfoAnchor, setPresetInfoAnchor] = useState<{ id: string; rect: DOMRect } | null>(null);
  const changedFieldsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasCalculated = useRef(false);
  const autoCalcMounted = useRef(false);
  const [lpmcProfile, setLpmcProfile] = useState<LpmcUserProfile>(DEFAULT_PRESET.values);

  function togglePanel(panel: 'about' | 'routes' | 'gtfs' | 'predict' | 'layers' | 'settings') {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  function applyPreset(values: LpmcUserProfile) {
    const changed = new Set<keyof LpmcUserProfile>();
    (Object.keys(values) as (keyof LpmcUserProfile)[]).forEach((k) => {
      if (lpmcProfile[k] !== values[k]) changed.add(k);
    });
    setLpmcProfile(values);
    // El preset también define el "cuándo": fija la fecha/hora global del viaje
    // a partir de su día de la semana (semana de referencia) y hora de salida.
    setScheduleDate(REFERENCE_WEEK[values.day_of_week] ?? scheduleDate);
    setOtpTime(linearHourToTimeString(values.start_time_linear));
    setChangedFields(changed);
    if (changedFieldsTimer.current) clearTimeout(changedFieldsTimer.current);
    changedFieldsTimer.current = setTimeout(() => setChangedFields(new Set()), 850);
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
      fetchTransitRoute(origin, destination, idxOverride ?? transitItineraryIndex, scheduleDate, otpTime),
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

  useEffect(() => {
    if (!originFocused) setOriginText(`${origin.lat.toFixed(5)}, ${origin.lon.toFixed(5)}`);
  }, [origin, originFocused]);

  useEffect(() => {
    if (!destFocused) setDestText(`${destination.lat.toFixed(5)}, ${destination.lon.toFixed(5)}`);
  }, [destination, destFocused]);

  useEffect(() => {
    if (!autoCalcMounted.current) { autoCalcMounted.current = true; return; }
    if (!hasCalculated.current) return;
    osrmMutation.mutate();
    setTransitItineraryIndex(0);
    transitMutation.mutate(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination]);

  // Al cambiar fecha u hora (panel Ajustes, o botones de día del panel Red), si
  // ya se calculó alguna vez, se relanza solo OTP (OSRM no depende de la hora).
  useEffect(() => {
    if (!hasCalculated.current) return;
    setTransitItineraryIndex(0);
    transitMutation.mutate(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleDate, otpTime]);

  // El día y la hora del perfil LPMC se derivan siempre del viaje global (control del mapa).
  useEffect(() => {
    setLpmcProfile((p) => ({
      ...p,
      day_of_week: deriveDayOfWeek(scheduleDate),
      start_time_linear: timeStringToLinearHour(otpTime),
    }));
  }, [scheduleDate, otpTime]);

  const isCalculating = osrmMutation.isPending || transitMutation.isPending;

  const handleClearRoutes = () => {
    osrmMutation.reset();
    transitMutation.reset();
    setTransitItineraryIndex(0);
    setHighlightedItinStop(null);
    hasCalculated.current = false;
  };
  const handleClearBus = () => {
    setSelectedTransitRouteId(null);
    setHighlightedStopId(null);
  };
  const handleClearAll = () => {
    hasCalculated.current = false;
    osrmMutation.reset();
    transitMutation.reset();
    setTransitItineraryIndex(0);
    setSelectedTransitRouteId(null);
    setHighlightedStopId(null);
    setHighlightedItinStop(null);
    setOrigin({ lat: 39.87845, lon: -4.03703 });
    setDestination({ lat: 39.86007, lon: -4.00228 });
  };

  const transitResult = transitMutation.data ?? null;
  const totalItineraries = transitResult?.total_itineraries ?? 0;
  // Todos los tramos de transporte público del itinerario (uno por transbordo).
  const transitLegs = transitResult?.segments.filter((s) => s.mode !== "WALK") ?? [];


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

  // Info de línea (color/texto/etiqueta) por índice de segment; undefined en tramos a pie.
  // Sirve para colorear el popup de las paradas OTP del mapa y detectar transbordos en seco.
  // Se define tras gtfsRoutesQuery porque depende de sus datos.
  const transitLegInfo = (transitResult?.segments ?? []).map((seg) =>
    seg.mode === "WALK" ? undefined : transitLegChip(seg, gtfsRoutesQuery.data)
  );

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
      {/* Control global de fecha/hora del viaje — esquina superior izquierda.
          Gobierna OTP (Rutas), los horarios (Red) y el día/hora del perfil (IA). */}
      <div className={`trip-datetime${activePanel ? ' trip-datetime--shifted' : ''}`}>
        <CalendarClock size={16} strokeWidth={1.75} className="trip-datetime__icon" />
        <input
          type="date"
          className="trip-datetime__date"
          value={scheduleDate}
          min="2026-02-22"
          max="2026-05-22"
          onChange={(e) => setScheduleDate(e.target.value)}
          aria-label="Fecha del viaje"
        />
        <input
          type="time"
          className="trip-datetime__time"
          value={otpTime}
          step={300}
          onChange={(e) => setOtpTime(e.target.value)}
          aria-label="Hora del viaje"
        />
      </div>

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
            transitLegInfo={selectedModes.has("transit") ? transitLegInfo : []}
            highlightedItinStop={highlightedItinStop ?? undefined}
            flyTarget={flyTarget}
            onFlyDone={() => setFlyTarget(null)}
            highlightedStopId={highlightedStopId ?? undefined}
            hasRoutes={!!(osrmMutation.data || transitMutation.data)}
            hasBus={!!selectedTransitRouteId}
            onClearRoutes={handleClearRoutes}
            onClearBus={handleClearBus}
            onClearAll={handleClearAll}
      />

      {/* Sidebar */}
      <aside className="sidebar">
        {/* ── Icon Rail ── */}
        <nav className="sidebar-rail">
          <button className="rail-logo" onClick={() => togglePanel('about')} title="Inicio">
            <MapPin size={20} color="white" strokeWidth={1.75} />
          </button>

          <button
            className={`rail-btn${activePanel === 'routes' ? ' rail-btn--active' : ''}`}
            onClick={() => togglePanel('routes')}
            title="Planificar ruta"
          >
            <span className="rail-btn__icon"><Route size={20} strokeWidth={1.75} /></span>
            <span className="rail-btn__label">Rutas</span>
          </button>

          <button
            className={`rail-btn${activePanel === 'gtfs' ? ' rail-btn--active' : ''}`}
            onClick={() => togglePanel('gtfs')}
            title="Red de transporte"
          >
            <span className="rail-btn__icon"><Bus size={20} strokeWidth={1.75} /></span>
            <span className="rail-btn__label">Red</span>
          </button>

          <button
            className={`rail-btn${activePanel === 'predict' ? ' rail-btn--active' : ''}`}
            onClick={() => togglePanel('predict')}
            title="Predicción modal"
          >
            <span className="rail-btn__icon"><Activity size={20} strokeWidth={1.75} /></span>
            <span className="rail-btn__label">IA</span>
          </button>

          <div className="rail-spacer" />

          <button
            className={`rail-btn${activePanel === 'layers' ? ' rail-btn--active' : ''}`}
            onClick={() => togglePanel('layers')}
            title="Mapa base"
          >
            <span className="rail-btn__icon"><Layers size={20} strokeWidth={1.75} /></span>
            <span className="rail-btn__label">Capas</span>
          </button>

          <button
            className={`rail-btn${activePanel === 'settings' ? ' rail-btn--active' : ''}`}
            onClick={() => togglePanel('settings')}
            title="Ajustes"
          >
            <span className="rail-btn__icon"><Settings size={20} strokeWidth={1.75} /></span>
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
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="panel-body">

              {/* ════ ABOUT ════ */}
              {activePanel === 'about' && (
                <div className="about-panel">
                  <div className="about-panel-hero">
                    <div className="about-panel-logo">
                      <MapPin size={28} color="white" strokeWidth={1.75} />
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
                    <div className="about-panel-credit-row"><span>Autor</span><span>Iván Vicente Hernández García de Mora</span></div>
                    <div className="about-panel-credit-row"><span>Tutor</span><span>José Ángel Martín Baos</span></div>
                    <div className="about-panel-credit-row"><span>Centro</span><span>ESIIAB, UCLM</span></div>
                    <div className="about-panel-credit-row"><span>Dataset</span><span>LPMC — Hillel et al., 2018</span></div>
                    <div className="about-panel-credit-row"><span>GTFS</span><span>Unauto (Grupo Ruiz), NAP</span></div>
                    <div className="about-panel-credit-row"><span>Cartografía</span><span>© OpenStreetMap contributors</span></div>
                  </div>

                  <div className="about-panel-footer">
                    Trabajo de Fin de Máster · MUII · 2025/2026
                  </div>
                </div>
              )}

              {/* ════ ROUTES ════ */}
              {activePanel === 'routes' && (
                <>
                  <div className="od-box">
                    <div className="od-row">
                      <span className="od-icon od-icon--origin">
                        <Play size={18} fill="currentColor" strokeWidth={0} />
                      </span>
                      <input
                        className="od-coords od-coords--input"
                        value={originText}
                        onChange={(e) => setOriginText(e.target.value)}
                        onFocus={() => setOriginFocused(true)}
                        onBlur={() => {
                          setOriginFocused(false);
                          const p = parseCoords(originText);
                          if (p) setOrigin(p);
                          else setOriginText(`${origin.lat.toFixed(5)}, ${origin.lon.toFixed(5)}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                          if (e.key === 'Escape') {
                            setOriginText(`${origin.lat.toFixed(5)}, ${origin.lon.toFixed(5)}`);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        placeholder="lat, lon"
                        aria-label="Coordenadas de origen"
                      />
                    </div>
                    <div className="od-row">
                      <span className="od-icon od-icon--dest">
                        <Square size={17} fill="currentColor" strokeWidth={0} />
                      </span>
                      <input
                        className="od-coords od-coords--input"
                        value={destText}
                        onChange={(e) => setDestText(e.target.value)}
                        onFocus={() => setDestFocused(true)}
                        onBlur={() => {
                          setDestFocused(false);
                          const p = parseCoords(destText);
                          if (p) setDestination(p);
                          else setDestText(`${destination.lat.toFixed(5)}, ${destination.lon.toFixed(5)}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                          if (e.key === 'Escape') {
                            setDestText(`${destination.lat.toFixed(5)}, ${destination.lon.toFixed(5)}`);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        placeholder="lat, lon"
                        aria-label="Coordenadas de destino"
                      />
                    </div>
                  </div>

                  <button
                    className="primary-button"
                    onClick={() => {
                      hasCalculated.current = true;
                      osrmMutation.mutate();
                      setTransitItineraryIndex(0);
                      transitMutation.mutate(0);
                    }}
                    disabled={isCalculating}
                  >
                    {isCalculating ? 'Calculando...' : 'Calcular rutas'}
                  </button>

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
                        <ModeIcon mode={p} size={14} /> {PROFILE_LABELS[p]}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="mode-button"
                      style={selectedModes.has("transit") ? { background: MODE_COLORS.transit, borderColor: MODE_COLORS.transit, color: '#fff' } : undefined}
                      onClick={(e) => handleModeClick("transit", e)}
                      disabled={isCalculating || !transitMutation.data}
                    >
                      <ModeIcon mode="transit" size={14} /> Bus
                    </button>
                  </div>

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
                            <td className="td-mode"><ModeIcon mode={r.profile} size={14} /> {PROFILE_LABELS[r.profile]}</td>
                            <td>{(r.distance_m / 1000).toFixed(2)} km</td>
                            <td>{(r.duration_s / 60).toFixed(0)} min</td>
                          </tr>
                        ))}
                        {transitMutation.data && (
                          <tr className={`row-transit${selectedModes.has("transit") ? ' row-active' : ''}`}>
                            <td className="td-mode">
                              <ModeIcon mode="transit" size={14} />
                              <span>Bus</span>
                              {transitLegs.map((seg, i) => {
                                const chip = transitLegChip(seg, gtfsRoutesQuery.data);
                                return (
                                  <span
                                    key={i}
                                    className="line-chip-inline"
                                    style={{ background: chip.color, color: chip.textColor, ...lineOutline(chip.color) }}
                                  >
                                    {chip.label}
                                  </span>
                                );
                              })}
                            </td>
                            <td>{(transitMutation.data.distance_m / 1000).toFixed(2)} km</td>
                            <td>{(transitMutation.data.duration_s / 60).toFixed(0)} min</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}

                  {transitResult && (
                    <div className="transit-card-nav">
                      <button
                        type="button"
                        onClick={() => {
                          if (transitItineraryIndex <= 0) return;
                          const next = transitItineraryIndex - 1;
                          setTransitItineraryIndex(next);
                          transitMutation.mutate(next);
                        }}
                        disabled={transitItineraryIndex <= 0 || transitMutation.isPending}
                      ><ChevronLeft size={15} strokeWidth={2.2} /> Anterior</button>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Bus size={13} strokeWidth={1.75} />
                        Itinerario {transitItineraryIndex + 1} / {totalItineraries || '?'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!totalItineraries || transitItineraryIndex >= totalItineraries - 1) return;
                          const next = transitItineraryIndex + 1;
                          setTransitItineraryIndex(next);
                          transitMutation.mutate(next);
                        }}
                        disabled={!totalItineraries || transitItineraryIndex >= totalItineraries - 1 || transitMutation.isPending}
                      >Siguiente <ChevronRight size={15} strokeWidth={2.2} /></button>
                    </div>
                  )}

                  {selectedModes.has("transit") && transitResult && (
                    <div className="transit-itinerary">
                      <h3 className="mini-title">Detalle del itinerario</h3>
                      {(transitResult.start_time || transitResult.end_time) && (
                        <div className="itin-summary">
                          <span className="itin-summary__time">{transitResult.start_time ?? '--:--'}</span>
                          <span className="itin-summary__arrow">→</span>
                          <span className="itin-summary__time">{transitResult.end_time ?? '--:--'}</span>
                          <span className="itin-summary__dur">{(transitResult.duration_s / 60).toFixed(0)} min</span>
                        </div>
                      )}
                      {transitResult.segments.map((seg, idx) => {
                        const distKm = seg.distance_m / 1000;
                        const durMin = seg.duration_s / 60;

                        if (seg.mode === 'WALK') {
                          return (
                            <div key={idx} className="itin-step itin-step--walk">
                              <span className="itin-step__icon"><Footprints size={16} strokeWidth={1.75} /></span>
                              <span className="itin-step__text">
                                Caminar {distKm.toFixed(2)} km · {durMin.toFixed(0)} min
                                {seg.to_stop_name && <> hasta <strong>{seg.to_stop_name}</strong></>}
                              </span>
                            </div>
                          );
                        }

                        const chip = transitLegChip(seg, gtfsRoutesQuery.data);
                        const stops = seg.stops ?? [];
                        return (
                          <div key={idx} className="itin-step itin-step--transit">
                            <div className="itin-leg-head">
                              <span className="line-chip-inline" style={{ background: chip.color, color: chip.textColor, ...lineOutline(chip.color) }}>
                                {chip.label}
                              </span>
                              {(seg.departure || seg.arrival) && (
                                <span className="itin-leg-time">{seg.departure}{seg.arrival ? ` – ${seg.arrival}` : ''}</span>
                              )}
                              <span className="itin-leg-meta">{distKm.toFixed(2)} km · {durMin.toFixed(0)} min</span>
                            </div>

                            {stops.length > 0 && (
                              <div
                                className="stop-diagram stop-diagram--itin"
                                style={{ '--route-color': chip.color, '--route-outline': isLightColor(chip.color) ? '#000' : 'transparent' } as React.CSSProperties}
                              >
                                {stops.map((stop, sidx) => {
                                  const isFirst = sidx === 0;
                                  const isLast = sidx === stops.length - 1;
                                  const isTerminal = isFirst || isLast;
                                  const isHl = highlightedItinStop === `${idx}-${sidx}`;
                                  return (
                                    <div key={sidx} className={`stop-row${isHl ? ' stop-row--hl' : ''}`}>
                                      <div className="stop-row__track">
                                        <div className={`stop-row__seg${isFirst ? ' stop-row__seg--none' : ''}`} />
                                        <div className={`stop-row__dot${isTerminal ? ' stop-row__dot--terminal' : ''}${isHl ? ' stop-row__dot--hl' : ''}`} />
                                        <div className={`stop-row__seg${isLast ? ' stop-row__seg--none' : ''}`} />
                                      </div>
                                      <button
                                        className={`stop-row__label${isTerminal ? ' stop-row__label--terminal' : ''}`}
                                        onClick={() => { setFlyTarget({ lat: stop.lat, lon: stop.lon }); setHighlightedItinStop(`${idx}-${sidx}`); }}
                                      >
                                        {stop.time && <span className="itin-stop-time">{stop.time}</span>}
                                        <span className="itin-stop-name">{stop.name}</span>
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Transbordo en seco: el siguiente tramo es transporte (sin caminar) */}
                            {transitLegInfo[idx + 1] && (
                              <div className="itin-transfer">
                                Transbordo a{' '}
                                <span
                                  className="line-chip-inline"
                                  style={{ background: transitLegInfo[idx + 1]!.color, color: transitLegInfo[idx + 1]!.textColor, ...lineOutline(transitLegInfo[idx + 1]!.color) }}
                                >
                                  {transitLegInfo[idx + 1]!.label}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ════ GTFS ════ */}
              {activePanel === 'gtfs' && (
                <>
                  {/* Buscador */}
                  <div style={{ marginBottom: '10px', position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Buscar línea…"
                      value={routeFilter}
                      onChange={e => setRouteFilter(e.target.value)}
                      style={{ width: '100%', height: '34px', padding: '0 10px 0 32px', border: '1px solid #dadce0', borderRadius: '6px', fontSize: '.82rem', fontFamily: 'inherit' }}
                    />
                    <Search size={15} strokeWidth={2.2} color="#9aa0a6" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
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
                            <span className="gtfs-line-badge" style={{ background: color, color: routeTextColor(r), ...lineOutline(color) }}>{r.short_name || r.id}</span>
                            <span className="gtfs-line-name">{r.long_name || ''}</span>
                            {hasVariants && (
                              <ChevronDown size={14} strokeWidth={2.5} className={`gtfs-chevron${isOpen ? ' gtfs-chevron--open' : ''}`} />
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
                                        style={{ '--vborder': active ? color : '#e8eaed' } as React.CSSProperties}
                                        onClick={() => setSelectedTransitRouteId(rid)}
                                      >
                                        <span className="gtfs-variant-dot" style={{ background: active ? color : '#9aa0a6', ...(active ? lineOutline(color) : {}) }} />
                                        <span>{info?.long_name || rid}</span>
                                        {info?.service_days && (
                                          <span className="gtfs-variant-days">{info.service_days}</span>
                                        )}
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
                                <div className="stop-diagram" style={{ '--route-color': color, '--route-outline': isLightColor(color) ? '#000' : 'transparent' } as React.CSSProperties}>
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
                              {transitScheduleQuery.data && (() => {
                                const activeMeta = gtfsRoutesQuery.data?.find(r => r.id === activeRouteId);
                                if (transitScheduleQuery.data.directions.length === 0) {
                                  return (
                                    <div className="gtfs-no-service">
                                      <span className="gtfs-no-service__msg">No circula este día</span>
                                      {activeMeta?.service_days && (
                                        <span className="gtfs-no-service__days">Circula: <strong>{activeMeta.service_days}</strong></span>
                                      )}
                                    </div>
                                  );
                                }
                                // Instante seleccionado (control del mapa) en minutos desde medianoche.
                                const [sh, sm] = otpTime.split(':').map(Number);
                                const selMin = (sh || 0) * 60 + (sm || 0);
                                const depTotal = (t: string) => {
                                  const [h, m] = t.split(':').map(Number);
                                  return (h || 0) * 60 + (m || 0);
                                };
                                return (
                                  <div className="gtfs-schedule">
                                    <div className="gtfs-schedule-title">Salidas</div>
                                    {transitScheduleQuery.data.directions.map((dir, didx) => {
                                      const hourRows = groupByHour(dir.departures);
                                      // Próxima salida = menor total >= instante seleccionado.
                                      const futureTotals = dir.departures.map(depTotal).filter((t) => t >= selMin);
                                      const nextTotal = futureTotals.length ? Math.min(...futureTotals) : null;
                                      return (
                                        <div key={didx} className="gtfs-schedule-section">
                                          {transitScheduleQuery.data!.directions.length > 1 && (
                                            <div className="gtfs-schedule-dir">{dir.headsign || `Dirección ${didx + 1}`}</div>
                                          )}
                                          <div className="gtfs-schedule-meta">{dir.trip_count} viajes · {stripSeconds(dir.first_departure)} – {stripSeconds(dir.last_departure)}</div>
                                          {nextTotal === null && (
                                            <div className="gtfs-schedule-nonext">No quedan salidas para la hora seleccionada</div>
                                          )}
                                          <table className="gtfs-schedule-table">
                                            <tbody>
                                              {hourRows.map(([hour, mins]) => (
                                                <tr key={hour}>
                                                  <td className="gtfs-hour">{hour}</td>
                                                  <td className="gtfs-mins">{mins.map((m, i) => {
                                                    const total = parseInt(hour, 10) * 60 + parseInt(m, 10);
                                                    const cls = total < selMin ? 'gtfs-min--past'
                                                      : total === nextTotal ? 'gtfs-min--next'
                                                      : 'gtfs-min--future';
                                                    return <span key={i} className={cls}>{m}</span>;
                                                  })}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
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
                  {/* Origen / destino (informativo): el par O-D alimenta a OSRM y OTP */}
                  <div className="ia-od">
                    <div className="ia-od__row">
                      <span className="od-icon od-icon--origin"><Play size={13} fill="currentColor" strokeWidth={0} /></span>
                      <span className="ia-od__coords">{originText}</span>
                    </div>
                    <div className="ia-od__row">
                      <span className="od-icon od-icon--dest"><Square size={12} fill="currentColor" strokeWidth={0} /></span>
                      <span className="ia-od__coords">{destText}</span>
                    </div>
                    <p className="ia-od__hint">Origen y destino del viaje. Se editan en el panel Rutas o con clic derecho en el mapa.</p>
                  </div>

                  {/* Perfiles rápidos */}
                  <div className="preset-grid">
                    {PROFILE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`preset-card${selectedPresetId === preset.id ? ' preset-card--active' : ''}`}
                        onClick={() => applyPreset(preset.values)}
                      >
                        <div className="preset-card-head">
                          <span className="preset-icon"><PresetIcon id={preset.id} size={14} /></span>
                          <strong className="preset-card-title">{preset.label}</strong>
                          <span
                            className="preset-info-btn"
                            onMouseEnter={(e) => setPresetInfoAnchor({ id: preset.id, rect: e.currentTarget.getBoundingClientRect() })}
                            onMouseLeave={() => setPresetInfoAnchor(null)}
                          >
                            <Info size={9} strokeWidth={2.5} />
                          </span>
                        </div>
                        <span className="preset-desc">{preset.description}</span>
                      </button>
                    ))}
                  </div>

                  {/* Formulario de parámetros */}
                  <div className="form-grid">
                    <span className="form-section-label">Viaje</span>
                    <div className={`field-block field-block--full trip-when-note${changedFields.has('day_of_week') || changedFields.has('start_time_linear') ? ' field-block--changed' : ''}`}>
                      <span className="field-label">Día y hora del viaje</span>
                      <span className="trip-when-value">
                        {DAY_OPTIONS.find((d) => d.value === deriveDayOfWeek(scheduleDate))?.label ?? '—'} · {otpTime}
                      </span>
                      <span className="trip-when-hint">Se ajusta en el control de fecha/hora del mapa.</span>
                    </div>
                    <label className={`field-block field-block--full${changedFields.has('purpose') ? ' field-block--changed' : ''}`}>
                      <span className="field-label">Motivo</span>
                      <select value={lpmcProfile.purpose} onChange={(e) => setLpmcProfile((p) => ({ ...p, purpose: e.target.value as LpmcPurpose }))}>
                        {PURPOSE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </label>

                    <span className="form-section-label">Persona</span>
                    <label className={`field-block${changedFields.has('age') ? ' field-block--changed' : ''}`}>
                      <span className="field-label">Edad</span>
                      <input type="number" min={16} max={100} value={lpmcProfile.age} onChange={(e) => setLpmcProfile((p) => ({ ...p, age: Number(e.target.value) }))} />
                    </label>
                    <label className={`field-block${changedFields.has('female') ? ' field-block--changed' : ''}`}>
                      <span className="field-label">Género</span>
                      <select value={lpmcProfile.female} onChange={(e) => setLpmcProfile((p) => ({ ...p, female: Number(e.target.value) }))}>
                        <option value={0}>Masculino</option>
                        <option value={1}>Femenino</option>
                      </select>
                    </label>
                    <label className={`field-block${changedFields.has('driving_license') ? ' field-block--changed' : ''}`}>
                      <span className="field-label">Carnet</span>
                      <select value={lpmcProfile.driving_license} onChange={(e) => setLpmcProfile((p) => ({ ...p, driving_license: Number(e.target.value) }))}>
                        <option value={1}>Sí</option>
                        <option value={0}>No</option>
                      </select>
                    </label>
                    <label className={`field-block${changedFields.has('car_ownership') ? ' field-block--changed' : ''}`}>
                      <span className="field-label">Coches hogar</span>
                      <input type="number" min={0} max={3} value={lpmcProfile.car_ownership} onChange={(e) => setLpmcProfile((p) => ({ ...p, car_ownership: Number(e.target.value) }))} />
                    </label>
                    <label className={`field-block field-block--full${changedFields.has('fueltype') ? ' field-block--changed' : ''}`}>
                      <span className="field-label">Combustible</span>
                      <select value={lpmcProfile.fueltype} onChange={(e) => setLpmcProfile((p) => ({ ...p, fueltype: e.target.value as LpmcFuel }))}>
                        {FUEL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </label>

                    <span className="form-section-label">Costes</span>
                    <label className={`field-block${changedFields.has('cost_transit') ? ' field-block--changed' : ''}`}>
                      <span className="field-label">Coste bus (€)</span>
                      <input type="number" min={0} step={0.1} value={lpmcProfile.cost_transit} onChange={(e) => setLpmcProfile((p) => ({ ...p, cost_transit: Number(e.target.value) }))} />
                    </label>
                    <label className={`field-block${changedFields.has('cost_driving_total') ? ' field-block--changed' : ''}`}>
                      <span className="field-label">Coste coche (€)</span>
                      <input type="number" min={0} step={0.1} value={lpmcProfile.cost_driving_total} onChange={(e) => setLpmcProfile((p) => ({ ...p, cost_driving_total: Number(e.target.value) }))} />
                    </label>
                  </div>

                  {/* Botón principal */}
                  <button
                    className="infer-button"
                    onClick={() => lpmcPredictMutation.mutate(transitItineraryIndex)}
                    disabled={lpmcPredictMutation.isPending}
                  >
                    <span>{lpmcPredictMutation.isPending ? 'Infiriendo…' : 'Inferir modo'}</span>
                    <span className="infer-model-badge">{modelVariantLabel(activeModel)}</span>
                  </button>

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

                  {/* Resultados */}
                  {lpmcPredictMutation.data && (
                    <>
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

                      {/* Acciones secundarias post-inferencia */}
                      <div className="results-actions">
                        <button
                          type="button"
                          className="results-action-btn"
                          onClick={() => lpmcCompareMutation.mutate(transitItineraryIndex)}
                          disabled={lpmcCompareMutation.isPending}
                        >
                          <BarChart3 size={14} strokeWidth={1.9} />
                          {lpmcCompareMutation.isPending ? 'Comparando…' : 'Comparar modelos'}
                        </button>
                        <button
                          type="button"
                          className="results-action-btn"
                          onClick={() => {
                            setShowDebugModal(true);
                            if (!lpmcDebugMutation.data) lpmcDebugMutation.mutate(transitItineraryIndex);
                          }}
                        >
                          <Table2 size={14} strokeWidth={1.9} />
                          Ver variables…
                        </button>
                      </div>
                    </>
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

                  {/* Tabla comparativa */}
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

      {/* ════ MODAL VARIABLES ════ */}
      {showDebugModal && (
        <div className="debug-modal-overlay" onClick={() => setShowDebugModal(false)}>
          <div className="debug-modal" onClick={(e) => e.stopPropagation()}>
            <div className="debug-modal-header">
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#202124', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Table2 size={17} strokeWidth={1.9} /> Variables del modelo
              </span>
              <button className="debug-modal-close" onClick={() => setShowDebugModal(false)}>✕</button>
            </div>

            {(lpmcDebugMutation.data?.route_features || lpmcPredictMutation.data?.route_features) && (() => {
              const rf = lpmcDebugMutation.data?.route_features ?? lpmcPredictMutation.data!.route_features;
              return (
                <div className="debug-section">
                  <div className="debug-section-title">Características de ruta</div>
                  <table className="debug-kv-table">
                    <tbody>
                      {Object.entries(rf).map(([k, v]) => (
                        <tr key={k}>
                          <td>{ROUTE_FEATURE_LABELS[k] ?? k}</td>
                          <td>{typeof v === 'number' ? v.toFixed(4) : String(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <div className="debug-section">
              <div className="debug-section-title">Perfil del viajero</div>
              <table className="debug-kv-table">
                <tbody>
                  <tr><td>Motivo</td><td>{PURPOSE_OPTIONS.find(p => p.value === lpmcProfile.purpose)?.label ?? lpmcProfile.purpose}</td></tr>
                  <tr><td>Combustible</td><td>{FUEL_OPTIONS.find(f => f.value === lpmcProfile.fueltype)?.label ?? lpmcProfile.fueltype}</td></tr>
                  <tr><td>Día</td><td>{DAY_OPTIONS.find(d => d.value === lpmcProfile.day_of_week)?.label ?? lpmcProfile.day_of_week}</td></tr>
                  <tr><td>Hora de salida</td><td>{linearHourToTimeString(lpmcProfile.start_time_linear)}</td></tr>
                  <tr><td>Edad</td><td>{lpmcProfile.age}</td></tr>
                  <tr><td>Género</td><td>{lpmcProfile.female ? 'Femenino' : 'Masculino'}</td></tr>
                  <tr><td>Carnet de conducir</td><td>{lpmcProfile.driving_license ? 'Sí' : 'No'}</td></tr>
                  <tr><td>Coches en hogar</td><td>{lpmcProfile.car_ownership}</td></tr>
                  <tr><td>Coste bus (€)</td><td>{lpmcProfile.cost_transit.toFixed(2)}</td></tr>
                  <tr><td>Coste coche (€)</td><td>{lpmcProfile.cost_driving_total.toFixed(2)}</td></tr>
                </tbody>
              </table>
            </div>

            {lpmcDebugMutation.isPending && (
              <p style={{ fontSize: '.8rem', color: '#9aa0a6', padding: '8px 0' }}>Cargando vector de entrada…</p>
            )}
            {lpmcDebugMutation.data && (
              <>
                <div className="debug-section">
                  <div className="debug-section-title">Features brutas (sin escalar)</div>
                  <table className="debug-kv-table">
                    <tbody>
                      {lpmcDebugMutation.data.feature_names.map((name) => (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{lpmcDebugMutation.data!.raw_features[name]?.toFixed(4) ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="debug-section">
                  <div className="debug-section-title">Features escaladas</div>
                  <table className="debug-kv-table">
                    <tbody>
                      {lpmcDebugMutation.data.scaled_columns.map((name) => (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{lpmcDebugMutation.data!.scaled_features[name]?.toFixed(4) ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="debug-section">
                  <div className="debug-section-title">Info del modelo</div>
                  <table className="debug-kv-table">
                    <tbody>
                      {Object.entries(lpmcDebugMutation.data.model_info).map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td>{String(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Request completo */}
            <div className="debug-section">
              <div className="debug-section-title">Request enviado a la API</div>
              <pre className="debug-request-pre">{JSON.stringify({
                origin,
                destination,
                user_profile: lpmcProfile,
                itinerary_index: transitItineraryIndex ?? undefined,
                model_variant: activeModel,
              }, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Popup info de perfil (fixed, escapa el overflow del panel) */}
      {presetInfoAnchor && (() => {
        const preset = PROFILE_PRESETS.find((p) => p.id === presetInfoAnchor.id);
        if (!preset) return null;
        const { rect } = presetInfoAnchor;
        return (
          <div
            className="preset-info-popup"
            style={{
              position: 'fixed',
              top: rect.bottom + 4,
              left: Math.max(12, rect.right - 210),
              zIndex: 5000,
              pointerEvents: 'none',
            }}
          >
            {presetTooltipLines(preset.values).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        );
      })()}

    </div>
  );
}

export default App;
