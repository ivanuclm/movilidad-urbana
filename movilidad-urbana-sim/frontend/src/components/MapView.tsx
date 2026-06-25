import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
  Polyline,
  CircleMarker,
  Popup,
  Pane,
} from "react-leaflet";
import { useState, useEffect, useRef } from "react";
import { Crosshair, MapPin, Plus, Minus, Route, Bus, RotateCcw, Check } from "lucide-react";
import L from "leaflet";
import pinOriginUrl from "../assets/pin-origin.svg";
import pinDestinationUrl from "../assets/pin-destination.svg";

const defaultCenter: [number, number] = [39.86251, -4.02726]; // Centro en Toledo

const originIcon = L.icon({
  iconUrl: pinOriginUrl,
  iconSize: [37.5, 50],
  iconAnchor: [18.75, 40],
});

const destinationIcon = L.icon({
  iconUrl: pinDestinationUrl,
  iconSize: [37.5, 50],
  iconAnchor: [18.75, 40],
});

type UiMode = "driving" | "cycling" | "foot" | "transit";
type BasemapMode = "light" | "color" | "osm" | "relief" | "satellite" | "pnoa";

type Point = { lat: number; lon: number };

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
  stops?: TransitStop[];
};

interface OsrmResult {
  profile: string;
  geometry: Point[];
}

const OSRM_PROFILE_STYLES: Record<string, { color: string; weight: number; dashArray: string }> = {
  driving: { color: "#2563eb", weight: 6, dashArray: "" },
  cycling: { color: "#16a34a", weight: 5, dashArray: "" },
  foot:    { color: "#4b5563", weight: 4, dashArray: "6 6" },
};

interface MapViewProps {
  origin: Point;
  destination: Point;
  setOrigin: (p: Point) => void;
  setDestination: (p: Point) => void;
  selectedModes: Set<UiMode>;
  basemap: BasemapMode;
  gtfsStops?: GtfsStop[];
  transitShape?: Point[];
  transitRouteStops?: GtfsStop[];
  transitRouteColor?: string;
  onSelectTransitRoute?: (routeId: string, fromStopId?: string) => void;
  transitSegments?: TransitSegment[];
  // Info de línea por índice de segment (color/texto/etiqueta); undefined en tramos a pie.
  transitLegInfo?: ({ color: string; textColor: string; label: string } | undefined)[];
  // Parada del Detalle del itinerario resaltada, clave "segIdx-stopIdx".
  highlightedItinStop?: string;
  osrmResults?: OsrmResult[];
  flyTarget?: Point | null;
  onFlyDone?: () => void;
  highlightedStopId?: string;
  hasRoutes?: boolean;
  hasBus?: boolean;
  onClearRoutes?: () => void;
  onClearBus?: () => void;
  onClearAll?: () => void;
}

type ContextMenuState = { x: number; y: number; lat: number; lng: number } | null;

function hslForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 70%, 35%)`;
}

function dedupeRoutes(routes: TransitRouteRef[]): TransitRouteRef[] {
  const seen = new Set<string>();
  return routes.filter(r => {
    const key = r.short_name || r.long_name || r.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

// Estilo del chip de línea en popups: color real + contorno negro si es claro.
function chipStyle(r: TransitRouteRef): React.CSSProperties {
  const bg = r.color ? `#${r.color}` : hslForKey(r.short_name || r.id);
  return {
    background: bg,
    color: r.text_color ? `#${r.text_color}` : "white",
    ...(isLightColor(bg) ? { boxShadow: "0 0 0 1px #000" } : {}),
  };
}

function MapRefCapture({ onMount }: { onMount: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onMount(map); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function MapInteractionHandler({
  onContextMenu,
}: {
  onContextMenu: (state: ContextMenuState) => void;
}) {
  useMapEvents({
    click() {
      onContextMenu(null); // cierra el menú si está abierto
    },
    contextmenu(e) {
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      onContextMenu({
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    },
  });

  return null;
}

function BasemapZoomSnapper({ basemap }: { basemap: BasemapMode }) {
  const map = useMap();
  const prev = useRef(basemap);
  useEffect(() => {
    if (prev.current === basemap) return;
    prev.current = basemap;
    const z = map.getZoom();
    const rounded = Math.round(z);
    if (z !== rounded) map.setZoom(rounded, { animate: false });
  }, [basemap, map]);
  return null;
}

function FlyToHandler({ target, onDone }: { target: Point | null | undefined; onDone?: () => void }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lon], 17, { duration: 0.8 });
    onDone?.();
  }, [target]);
  return null;
}

export function MapView({
  origin,
  destination,
  setOrigin,
  setDestination,
  selectedModes,
  basemap,
  gtfsStops,
  transitShape,
  transitRouteStops,
  transitRouteColor,
  onSelectTransitRoute,
  transitSegments,
  transitLegInfo,
  highlightedItinStop,
  osrmResults,
  flyTarget,
  onFlyDone,
  highlightedStopId,
  hasRoutes,
  hasBus,
  onClearRoutes,
  onClearBus,
  onClearAll,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const basemapConfig: Record<
    BasemapMode,
    { url: string; attribution: string }
  > = {
    light: {
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    },
    color: {
      url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    },
    osm: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors",
    },
    relief: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution:
        "&copy; OpenStreetMap contributors, SRTM | map style: &copy; OpenTopoMap",
    },
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
    },
    pnoa: {
      url: "https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=OI.OrthoimageCoverage&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg",
      attribution: "&copy; Instituto Geográfico Nacional de España",
    },
  };

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const routeMarkerRefs = useRef<Map<string, L.CircleMarker>>(new Map());
  // Refs de las paradas del trayecto OTP, por clave "segIdx-stopIdx".
  const otpMarkerRefs = useRef<Map<string, L.CircleMarker>>(new Map());

  useEffect(() => {
    if (!highlightedStopId) return;
    const t = setTimeout(() => {
      routeMarkerRefs.current.get(highlightedStopId)?.openPopup();
    }, 900);
    return () => clearTimeout(t);
  }, [highlightedStopId]);

  // Al clicar una parada en el Detalle del itinerario, abre su popup en el mapa.
  useEffect(() => {
    if (!highlightedItinStop) return;
    const t = setTimeout(() => {
      otpMarkerRefs.current.get(highlightedItinStop)?.openPopup();
    }, 900);
    return () => clearTimeout(t);
  }, [highlightedItinStop]);

  useEffect(() => { setCopiedCoords(false); }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    // Sin capture: stopPropagation() en el menú previene el cierre al clicar dentro
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const transitPolylinePositions = (transitShape ?? []).map(
    (p) => [p.lat, p.lon] as [number, number]
  );

  const otpTransitPolylines =
    selectedModes.has("transit") && transitSegments
      ? transitSegments.map((seg) => ({
          mode: seg.mode,
          positions: seg.geometry.map(
            (p) => [p.lat, p.lon] as [number, number]
          ),
        }))
      : [];

  return (
    <>
    <MapContainer center={defaultCenter} zoom={13} zoomSnap={0.25} wheelPxPerZoomLevel={60} zoomControl={false} className="map-container">
      <MapRefCapture onMount={(m) => { mapRef.current = m; }} />
      <BasemapZoomSnapper basemap={basemap} />
      <FlyToHandler target={flyTarget} onDone={onFlyDone} />
      <TileLayer
        attribution={basemapConfig[basemap].attribution}
        url={basemapConfig[basemap].url}
      />

      {/* Pane propio para las paradas: z-index 450, por encima de las polilíneas
          (overlayPane=400) para que siempre sean clicables, y por debajo de los
          pines de origen/destino (markerPane=600). */}
      <Pane name="stopsPane" style={{ zIndex: 450 }} />

      <MapInteractionHandler
        setOrigin={setOrigin}
        setDestination={setDestination}
        onContextMenu={setContextMenu}
      />

      {/* Origen / destino */}
      <Marker position={[origin.lat, origin.lon]} icon={originIcon} />
      <Marker
        position={[destination.lat, destination.lon]}
        icon={destinationIcon}
      />

      {(osrmResults ?? []).map((result) => {
        const styles = OSRM_PROFILE_STYLES[result.profile];
        if (!styles || result.geometry.length === 0) return null;
        if (!selectedModes.has(result.profile as UiMode)) return null;
        const positions = result.geometry.map((p) => [p.lat, p.lon] as [number, number]);
        return (
          <Polyline
            key={result.profile}
            positions={positions}
            pathOptions={{
              color: styles.color,
              weight: styles.weight,
              dashArray: styles.dashArray,
              opacity: 1,
            }}
          />
        );
      })}

      {/* Ruta GTFS seleccionada (desde routes.txt). El casing negro va por
          debajo y solo es visible si la línea es de color claro. Se renderiza
          SIEMPRE (con opacity 0 si no aplica), no de forma condicional, para
          que conserve su z-order por debajo de la línea de color: si se montara
          y desmontara, al volver a una línea clara quedaría por encima. */}
      {transitPolylinePositions.length > 0 && (
        <>
          <Polyline
            positions={transitPolylinePositions}
            pathOptions={{
              color: "#000",
              weight: 7,
              opacity: isLightColor(transitRouteColor || "#f97316") ? 1 : 0,
              interactive: false,
            }}
          />
          <Polyline
            positions={transitPolylinePositions}
            pathOptions={{ color: transitRouteColor || "#f97316", weight: 5 }}
          />
        </>
      )}

      {/* Segmentos de OTP (solo en modo transit):
          - WALK: gris discontinua
          - resto (bus, etc): naranja más gruesa */}
      {otpTransitPolylines.map((seg, idx) => {
        const isWalk = seg.mode === "WALK";
        return (
          <Polyline
            key={`otp-${idx}`}
            positions={seg.positions}
            pathOptions={
              isWalk
                ? {
                    color: "#92400e",
                    weight: 5,
                    dashArray: "6 6",
                  }
                : {
                    color: "#f97316",
                    weight: 6,
                  }
            }
          />
        );
      })}

      {/* Paradas GTFS (todas) */}
      {gtfsStops &&
        gtfsStops.map((s) => (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lon]}
            radius={5}
            pane="stopsPane"
            pathOptions={{
              color: "#fff",
              weight: 1.5,
              fillColor: "#1a73e8",
              fillOpacity: 1,
            }}
          >
            <Popup minWidth={190} className="stop-popup">
              <div className="stop-popup__inner">
                <div className="stop-popup__name">{s.name}</div>
                {s.code && (
                  <div className="stop-popup__code">Parada {s.code}</div>
                )}
                {s.routes && s.routes.length > 0 && (
                  <div className="stop-popup__routes">
                    <div className="stop-popup__routes-label">Líneas</div>
                    <div className="stop-popup__chips">
                      {dedupeRoutes(s.routes).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="stop-route-chip"
                          style={chipStyle(r)}
                          title={r.long_name || r.short_name || r.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectTransitRoute?.(r.id, s.id);
                          }}
                        >
                          {r.short_name || r.id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}

      {/* Paradas de la ruta GTFS seleccionada (resaltadas) */}
      {transitRouteStops &&
        transitRouteStops.map((s) => {
          const isHighlighted = s.id === highlightedStopId;
          const lineCol = transitRouteColor || '#f97316';
          // El punto se rellena con el color de la línea; el contorno (blanco, o
          // negro si la línea es clara) lo separa visualmente de la polilínea.
          const outline = isLightColor(lineCol) ? '#000' : '#fff';
          return (
            <CircleMarker
              key={`route-${s.id}`}
              center={[s.lat, s.lon]}
              radius={isHighlighted ? 8 : 5}
              pane="stopsPane"
              eventHandlers={{
                add: (e) => { routeMarkerRefs.current.set(s.id, e.target as L.CircleMarker); },
                remove: () => { routeMarkerRefs.current.delete(s.id); },
              }}
              pathOptions={{
                color: outline,
                weight: isHighlighted ? 3 : 2,
                fillColor: lineCol,
                fillOpacity: 1,
              }}
            >
              <Popup minWidth={190} className="stop-popup">
                <div className="stop-popup__inner">
                  <div className="stop-popup__name">{s.name}</div>
                  {s.code && <div className="stop-popup__code">Parada {s.code}</div>}
                  {s.routes && s.routes.length > 0 && (
                    <div className="stop-popup__routes">
                      <div className="stop-popup__routes-label">Líneas</div>
                      <div className="stop-popup__chips">
                        {dedupeRoutes(s.routes).map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            className="stop-route-chip"
                            style={chipStyle(r)}
                            title={r.long_name || r.short_name || r.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSelectTransitRoute?.(r.id, s.id);
                            }}
                          >
                            {r.short_name || r.id}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

      {/* Paradas del trayecto OTP (solo en modo transit). Se rellenan con el color
          de su línea; el popup muestra la línea, la hora de paso y, si la parada es
          un transbordo en seco (cambio de bus sin caminar), las líneas implicadas.
          Clave "segIdx-stopIdx" para abrir el popup desde el Detalle del itinerario. */}
      {selectedModes.has("transit") && transitSegments &&
        transitSegments.flatMap((seg, segIdx) => {
          if (seg.mode === "WALK" || !seg.stops) return [];
          const legInfo = transitLegInfo?.[segIdx];
          const fill = legInfo?.color ?? "#f97316";
          return seg.stops.map((stop, i) => {
            const key = `${segIdx}-${i}`;
            const isHl = highlightedItinStop === key;
            const transferTo = i === seg.stops!.length - 1 ? transitLegInfo?.[segIdx + 1] : undefined;
            const transferFrom = i === 0 ? transitLegInfo?.[segIdx - 1] : undefined;
            return (
              <CircleMarker
                key={`otp-stop-${key}`}
                center={[stop.lat, stop.lon]}
                radius={isHl ? 7 : 4}
                pane="stopsPane"
                eventHandlers={{
                  add: (e) => { otpMarkerRefs.current.set(key, e.target as L.CircleMarker); },
                  remove: () => { otpMarkerRefs.current.delete(key); },
                }}
                pathOptions={{
                  color: isHl ? "#1a73e8" : "#fff",
                  weight: isHl ? 3 : 2,
                  fillColor: fill,
                  fillOpacity: 1,
                }}
              >
                <Popup minWidth={170} className="stop-popup">
                  <div className="stop-popup__inner">
                    {legInfo && (
                      <span
                        className="stop-route-chip stop-popup__line"
                        style={{ background: legInfo.color, color: legInfo.textColor, ...(isLightColor(legInfo.color) ? { boxShadow: "0 0 0 1px #000" } : {}) }}
                      >
                        {legInfo.label}
                      </span>
                    )}
                    <div className="stop-popup__name">{stop.name}</div>
                    {stop.time && <div className="stop-popup__time">Pasa a las {stop.time}</div>}
                    {(transferTo || transferFrom) && (
                      <div className="stop-popup__transfer">
                        Transbordo {transferFrom ? `desde ${transferFrom.label}` : ''}{transferFrom && transferTo ? ' · ' : ''}{transferTo ? `a ${transferTo.label}` : ''}
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          });
        })}
    </MapContainer>

    {/* Controles zoom + home — esquina inferior derecha */}
    <div className="map-controls map-controls--bottom-right">
      <div className="map-controls__group">
        <button
          className="map-control-btn"
          title="Acercar"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <Plus size={18} strokeWidth={2} />
        </button>
        <button
          className="map-control-btn"
          title="Alejar"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <Minus size={18} strokeWidth={2} />
        </button>
      </div>
      <div className="map-controls__group">
        <button
          className="map-control-btn"
          title="Centrar en Toledo"
          onClick={() => mapRef.current?.setView(defaultCenter, 13)}
        >
          <Crosshair size={18} strokeWidth={2} />
        </button>
      </div>
    </div>

    {/* Controles de limpieza — esquina superior derecha, horizontal */}
    <div className="map-controls map-controls--top-right">
      <div className="map-controls__group map-controls__group--horizontal">
        <button
          className="map-control-btn map-control-btn--clear"
          title="Limpiar rutas de navegación"
          disabled={!hasRoutes}
          onClick={onClearRoutes}
        >
          <Route size={16} strokeWidth={2} />
        </button>
        <button
          className="map-control-btn map-control-btn--clear"
          title="Limpiar línea de bus seleccionada"
          disabled={!hasBus}
          onClick={onClearBus}
        >
          <Bus size={16} strokeWidth={2} />
        </button>
        <button
          className="map-control-btn map-control-btn--clear"
          title="Limpiar todo"
          disabled={!hasRoutes && !hasBus}
          onClick={onClearAll}
        >
          <RotateCcw size={16} strokeWidth={2} />
        </button>
      </div>
    </div>

    {/* Menú contextual de clic derecho */}
    {contextMenu && (
      <div
        className="map-context-menu"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className={`map-context-menu__coords${copiedCoords ? ' map-context-menu__coords--copied' : ''}`}
          onClick={() => {
            const text = `${contextMenu.lat.toFixed(5)}, ${contextMenu.lng.toFixed(5)}`;
            navigator.clipboard?.writeText(text).then(() => setCopiedCoords(true)).catch(() => {});
          }}
        >
          <span>{copiedCoords ? '¡Copiado!' : `${contextMenu.lat.toFixed(5)}, ${contextMenu.lng.toFixed(5)}`}</span>
          {copiedCoords && <Check size={13} strokeWidth={2.5} />}
        </button>
        <button
          onClick={() => {
            setOrigin({ lat: contextMenu.lat, lon: contextMenu.lng });
            setContextMenu(null);
          }}
        >
          <Crosshair size={16} color="#34a853" strokeWidth={2} />
          Establecer como origen
        </button>
        <button
          onClick={() => {
            setDestination({ lat: contextMenu.lat, lon: contextMenu.lng });
            setContextMenu(null);
          }}
        >
          <MapPin size={16} color="#ea4335" strokeWidth={2} />
          Establecer como destino
        </button>
      </div>
    )}
    </>
  );
}
