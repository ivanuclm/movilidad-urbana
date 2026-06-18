import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
  Polyline,
  CircleMarker,
  Popup,
} from "react-leaflet";
import { useState, useEffect, useRef } from "react";
import L from "leaflet";

const defaultCenter: [number, number] = [39.86251, -4.02726]; // Centro en Toledo

const originIcon = L.divIcon({
  className: "osm-marker",
  html: `
    <svg viewBox="0 0 25 40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="marker-shadow" x="-50%" y="-10%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.4" />
        </filter>
      </defs>
      <g filter="url(#marker-shadow)">
        <path
          d="M12.5 1C7.5 1 3.5 4.9 3.5 9.9C3.5 15.8 12.5 25 12.5 25C12.5 25 21.5 15.8 21.5 9.9C21.5 4.9 17.5 1 12.5 1Z"
          fill="#16a34a"
        />
        <circle cx="12.5" cy="9.9" r="5.2" fill="white" />
        <polygon points="11,6.3 11,13.5 16,9.9" fill="#16a34a" />
      </g>
    </svg>
  `,
  iconSize: [37.5, 50],
  iconAnchor: [18.75, 40],
});

const destinationIcon = L.divIcon({
  className: "osm-marker",
  html: `
    <svg viewBox="0 0 25 40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="marker-shadow" x="-50%" y="-10%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.4" />
        </filter>
      </defs>
      <g filter="url(#marker-shadow)">
        <path
          d="M12.5 1C7.5 1 3.5 4.9 3.5 9.9C3.5 15.8 12.5 25 12.5 25C12.5 25 21.5 15.8 21.5 9.9C21.5 4.9 17.5 1 12.5 1Z"
          fill="#dc2626"
        />
        <circle cx="12.5" cy="9.9" r="5.2" fill="white" />
        <rect x="9.6" y="6.9" width="6" height="6" fill="#dc2626" rx="1" />
      </g>
    </svg>
  `,
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

type TransitSegment = {
  mode: string;
  distance_m: number;
  duration_s: number;
  geometry: Point[];
};

interface OsrmResult {
  profile: string;
  geometry: Point[];
}

const OSRM_PROFILE_STYLES: Record<string, { color: string; weight: number; dashArray: string }> = {
  driving: { color: "#2563eb", weight: 5, dashArray: "" },
  cycling: { color: "#16a34a", weight: 4, dashArray: "" },
  foot:    { color: "#4b5563", weight: 3, dashArray: "6 6" },
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
  osrmResults?: OsrmResult[];
  flyTarget?: Point | null;
  onFlyDone?: () => void;
  highlightedStopId?: string;
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
  osrmResults,
  flyTarget,
  onFlyDone,
  highlightedStopId,
}: MapViewProps) {
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
  const routeMarkerRefs = useRef<Map<string, L.CircleMarker>>(new Map());

  useEffect(() => {
    if (!highlightedStopId) return;
    const t = setTimeout(() => {
      routeMarkerRefs.current.get(highlightedStopId)?.openPopup();
    }, 900);
    return () => clearTimeout(t);
  }, [highlightedStopId]);

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
    <MapContainer center={defaultCenter} zoom={13} zoomSnap={0.25} wheelPxPerZoomLevel={120} className="map-container">
      <BasemapZoomSnapper basemap={basemap} />
      <FlyToHandler target={flyTarget} onDone={onFlyDone} />
      <TileLayer
        attribution={basemapConfig[basemap].attribution}
        url={basemapConfig[basemap].url}
      />

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

      {/* Ruta GTFS seleccionada (desde routes.txt) */}
      {transitPolylinePositions.length > 0 && (
        <Polyline
          positions={transitPolylinePositions}
          pathOptions={{
            color: transitRouteColor || "#f97316",
            weight: 4,
          }}
        />
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
                    color: "#4b5563",
                    weight: 4,
                    dashArray: "6 6",
                  }
                : {
                    color: "#f97316",
                    weight: 5,
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
                          style={{
                            background: r.color ? `#${r.color}` : hslForKey(r.short_name || r.id),
                            color: r.text_color ? `#${r.text_color}` : 'white',
                          }}
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
          return (
            <CircleMarker
              key={`route-${s.id}`}
              center={[s.lat, s.lon]}
              radius={isHighlighted ? 8 : 5}
              eventHandlers={{
                add: (e) => { routeMarkerRefs.current.set(s.id, e.target as L.CircleMarker); },
                remove: () => { routeMarkerRefs.current.delete(s.id); },
              }}
              pathOptions={{
                color: transitRouteColor || '#f97316',
                weight: 2,
                fillColor: isHighlighted ? transitRouteColor || '#f97316' : 'white',
                fillOpacity: isHighlighted ? 1 : 0,
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
                            style={{
                              background: r.color ? `#${r.color}` : hslForKey(r.short_name || r.id),
                              color: r.text_color ? `#${r.text_color}` : 'white',
                            }}
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
    </MapContainer>

    {/* Menú contextual de clic derecho */}
    {contextMenu && (
      <div
        className="map-context-menu"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="map-context-menu__coords">
          {contextMenu.lat.toFixed(5)}, {contextMenu.lng.toFixed(5)}
        </div>
        <button
          onClick={() => {
            setOrigin({ lat: contextMenu.lat, lon: contextMenu.lng });
            setContextMenu(null);
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="#34a853"><circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#34a853" strokeWidth="2"/></svg>
          Establecer como origen
        </button>
        <button
          onClick={() => {
            setDestination({ lat: contextMenu.lat, lon: contextMenu.lng });
            setContextMenu(null);
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="#ea4335"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          Establecer como destino
        </button>
      </div>
    )}
    </>
  );
}
