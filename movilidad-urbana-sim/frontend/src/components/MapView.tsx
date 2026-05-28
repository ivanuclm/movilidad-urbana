import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  Polyline,
  CircleMarker,
  Popup,
} from "react-leaflet";
import { useState } from "react";
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
type BasemapMode = "light" | "color" | "relief" | "satellite";

type Point = { lat: number; lon: number };

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
  routeGeometry: Point[];
  selectedModes: Set<UiMode>;
  basemap: BasemapMode;
  gtfsStops?: GtfsStop[];
  transitShape?: Point[];
  transitRouteStops?: GtfsStop[];
  transitRouteColor?: string;
  onSelectTransitRoute?: (routeId: string) => void;
  transitSegments?: TransitSegment[];
  osrmResults?: OsrmResult[];
}

function ClickHandler({
  setOrigin,
  setDestination,
}: {
  setOrigin: (p: Point) => void;
  setDestination: (p: Point) => void;
}) {
  const [placingOrigin, setPlacingOrigin] = useState(true);

  useMapEvents({
    click(e) {
      const p = { lat: e.latlng.lat, lon: e.latlng.lng };
      if (placingOrigin) {
        setOrigin(p);
      } else {
        setDestination(p);
      }
      setPlacingOrigin(!placingOrigin);
    },
  });

  return null;
}

export function MapView({
  origin,
  destination,
  setOrigin,
  setDestination,
  routeGeometry,
  selectedModes,
  basemap,
  gtfsStops,
  transitShape,
  transitRouteStops,
  transitRouteColor,
  onSelectTransitRoute,
  transitSegments,
  osrmResults,
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
  };

  const osrmPolylinePositions = routeGeometry.map(
    (p) => [p.lat, p.lon] as [number, number]
  );

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

  // Estilos para la línea principal según modo
  // let mainRoutePathOptions:
  //   | L.PathOptions
  //   | undefined = undefined;

  // if (mode === "driving") {
  //   mainRoutePathOptions = { color: "#2563eb", weight: 5 };
  // } else if (mode === "cycling") {
  //   mainRoutePathOptions = { color: "#16a34a", weight: 4 };
  // } else if (mode === "foot") {
  //   mainRoutePathOptions = {
  //     color: "#4b5563",
  //     weight: 3,
  //     dashArray: "6 6",
  //   };
  // }

  return (
    <MapContainer center={defaultCenter} zoom={13} className="map-container">
      <TileLayer
        attribution={basemapConfig[basemap].attribution}
        url={basemapConfig[basemap].url}
      />

      <ClickHandler setOrigin={setOrigin} setDestination={setDestination} />

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
            radius={4}
            pathOptions={{
              color: "#0f172a",
              weight: 1.2,
              fillColor: "#38bdf8",
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <div>
                <strong>{s.name}</strong>
                {s.code && <div>Código: {s.code}</div>}

                {s.routes && s.routes.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        marginBottom: 2,
                        fontSize: "0.8rem",
                      }}
                    >
                      Líneas:
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.25rem",
                      }}
                    >
                      {s.routes.map((r) => {
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
                          <button
                            key={r.id}
                            type="button"
                            className="tooltip-chip"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSelectTransitRoute?.(r.id);
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}

                    </div>
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}

      {/* Paradas de la ruta GTFS seleccionada (resaltadas) */}
      {transitRouteStops &&
        transitRouteStops.map((s) => (
          <CircleMarker
            key={`route-${s.id}`}
            center={[s.lat, s.lon]}
            radius={5}
            pathOptions={{ color: transitRouteColor || "#f97316", weight: 2 }}
          />
        ))}
    </MapContainer>
  );
}
