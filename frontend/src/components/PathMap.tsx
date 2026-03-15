"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { TempPoint } from "@/components/RegionExplorer";
import type {
  RegionFeature,
  PathFeature,
  PathFeatureCollection,
  RouteResponse,
  Place,
  SegmentFeature,
  SegmentFeatureCollection,
} from "@/types/geo";

interface PathMapProps {
  region: RegionFeature;
  paths: PathFeatureCollection;
  route?: RouteResponse | null;
  hoveredPathId?: number | null;
  onPathHover?: (pathId: number | null) => void;
  walkedPathIds?: Set<number>;
  partiallyWalkedPathIds?: Set<number>;
  isFavorite?: boolean;
  places?: Place[];
  isCreatingPlace?: boolean;
  focusPlaceLocation?: [number, number] | null;
  focusPlaceKey?: number;
  onPlaceCreate?: (location: [number, number]) => void;
  onPlaceDelete?: () => void;
  composing?: boolean;
  segments?: SegmentFeatureCollection | null;
  selectedSegmentIds?: number[];
  onSegmentClick?: (segmentId: number) => void;
  composerError?: string | null;
  composedStartPoint?: [number, number] | null;
  composedEndPoint?: [number, number] | null;
  pickingPoint?: "start" | "end" | null;
  onPickPoint?: (coords: [number, number]) => void;
  startTempPoint?: TempPoint | null;
  endTempPoint?: TempPoint | null;
  hoveredPlaceId?: number | null;
  onPlaceHover?: (placeId: number | null) => void;
  searchHighlight?: [number, number] | null;
  focusPathId?: number | null;
  focusPathKey?: number;
  hoveredRouteId?: number | null;
  previewRoute?: RouteResponse | null;
}

const PATH_DIMMED_STYLE: PathOptions = {
  color: "#3b82f6",
  weight: 2,
  opacity: 0.3,
};

const HOVER_STYLE: PathOptions = {
  color: "#1d4ed8",
  weight: 4,
  opacity: 1,
};

const WALKED_HOVER_STYLE: PathOptions = {
  color: "#047857",
  weight: 5,
  opacity: 1,
};

const WALKED_HIGHLIGHT_STYLE: PathOptions = {
  color: "#059669",
  weight: 4,
  opacity: 1.0,
};

const UNWALKED_DIMMED_STYLE: PathOptions = {
  color: "#60a5fa",
  weight: 2,
  opacity: 0.8,
};

const ROUTE_HOVER_STYLE: PathOptions = {
  color: "#d97706",
  weight: 5,
  opacity: 1,
};

const SEGMENT_AVAILABLE_STYLE: PathOptions = {
  color: "#9ca3af",
  weight: 3,
  opacity: 0.6,
};

const SEGMENT_HOVER_STYLE: PathOptions = {
  color: "#6b7280",
  weight: 5,
  opacity: 0.8,
};

const SEGMENT_REJECTED_STYLE: PathOptions = {
  color: "#ef4444",
  weight: 5,
  opacity: 1,
};

const COLOR_START: [number, number, number] = [34, 197, 94]; // #22c55e green
const COLOR_MID: [number, number, number] = [245, 158, 11]; // #f59e0b amber
const COLOR_END: [number, number, number] = [239, 68, 68]; // #ef4444 red

function interpolateColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function getSegmentColor(sequenceIndex: number, total: number): string {
  if (total <= 1) return interpolateColor(COLOR_START, COLOR_START, 0);
  const t = sequenceIndex / (total - 1);
  if (t <= 0.5) {
    return interpolateColor(COLOR_START, COLOR_MID, t * 2);
  }
  return interpolateColor(COLOR_MID, COLOR_END, (t - 0.5) * 2);
}

function buildRouteTooltip(
  props: PathFeature["properties"],
  geometry: GeoJSON.LineString | GeoJSON.MultiLineString,
  total: number,
): string {
  const distKm = (computePathLength(geometry) / 1000).toFixed(1);
  const lines = [
    `<strong>${props.name || "Unnamed"}</strong>`,
    `Distance: ${distKm} km`,
    `Category: ${props.category}`,
    `Surface: ${props.surface || "unknown"}`,
  ];
  if (props.sequence_index != null) {
    lines.push(`Segment ${props.sequence_index + 1} of ${total}`);
  }
  return lines.join("<br>");
}

function RouteMarkers({ route }: { route: RouteResponse }) {
  const { start_point, end_point } = route;

  if (!start_point || !end_point) return null;

  const startLatLng: [number, number] = [start_point[1], start_point[0]];
  const endLatLng: [number, number] = [end_point[1], end_point[0]];

  const isSamePoint =
    Math.abs(start_point[0] - end_point[0]) < 1e-6 &&
    Math.abs(start_point[1] - end_point[1]) < 1e-6;

  if (isSamePoint) {
    return (
      <CircleMarker
        center={startLatLng}
        radius={8}
        pathOptions={{
          fillColor: "#22c55e",
          color: "#ffffff",
          weight: 2,
          fillOpacity: 1,
        }}
      >
        <Tooltip>Start / Finish</Tooltip>
      </CircleMarker>
    );
  }

  return (
    <>
      <CircleMarker
        center={startLatLng}
        radius={8}
        pathOptions={{
          fillColor: "#22c55e",
          color: "#ffffff",
          weight: 2,
          fillOpacity: 1,
        }}
      >
        <Tooltip>Start</Tooltip>
      </CircleMarker>
      <CircleMarker
        center={endLatLng}
        radius={8}
        pathOptions={{
          fillColor: "#ef4444",
          color: "#ffffff",
          weight: 2,
          fillOpacity: 1,
        }}
      >
        <Tooltip>End</Tooltip>
      </CircleMarker>
    </>
  );
}

function FitBounds({ region, paths, route }: PathMapProps) {
  const map = useMap();
  const prevRouteRef = useRef<RouteResponse | null | undefined>(undefined);

  useEffect(() => {
    const prevRoute = prevRouteRef.current;
    prevRouteRef.current = route ?? null;

    // Route cleared (non-null -> null): keep current view
    if (prevRoute && !route) {
      return;
    }

    const fitTarget =
      route && route.segments.features.length > 0
        ? route.segments
        : paths.features.length > 0
          ? paths
          : region.geometry;

    const bounds = L.geoJSON(fitTarget).getBounds();
    if (bounds.isValid()) {
      const padding: [number, number] = route ? [40, 40] : [20, 20];
      map.fitBounds(bounds, { padding });
    }
  }, [map, region, paths, route]);

  return null;
}

function ResetViewControl({ region, paths }: { region: RegionFeature; paths: PathFeatureCollection }) {
  const map = useMap();

  useEffect(() => {
    const control = new L.Control({ position: "topleft" });

    control.onAdd = () => {
      const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
      const button = L.DomUtil.create("a", "", container);
      button.innerHTML = "&#8634;";
      button.title = "Reset view";
      button.href = "#";
      button.role = "button";
      button.setAttribute("aria-label", "Reset view");
      Object.assign(button.style, {
        fontSize: "18px",
        fontWeight: "bold",
        lineHeight: "26px",
        textAlign: "center",
        textDecoration: "none",
        cursor: "pointer",
        width: "30px",
        height: "30px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      });

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(button, "click", (e) => {
        L.DomEvent.preventDefault(e);
        const fitTarget = paths.features.length > 0 ? paths : region.geometry;
        const bounds = L.geoJSON(fitTarget).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20] });
        }
      });

      return container;
    };

    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map, region, paths]);

  return null;
}

function PlaceMarkers({
  places,
  hoveredPlaceId,
  onPlaceHover,
}: {
  places: Place[];
  hoveredPlaceId?: number | null;
  onPlaceHover?: (placeId: number | null) => void;
}) {
  const markerRefs = useRef<Map<number, L.CircleMarker>>(new Map());

  useEffect(() => {
    markerRefs.current.forEach((marker, id) => {
      if (id === hoveredPlaceId) {
        marker.openTooltip();
      } else {
        marker.closeTooltip();
      }
    });
  }, [hoveredPlaceId]);

  return (
    <>
      {places.map((place) => {
        const isHovered = hoveredPlaceId === place.id;
        return (
          <CircleMarker
            key={place.id}
            ref={(el) => {
              if (el) {
                markerRefs.current.set(place.id, el);
              } else {
                markerRefs.current.delete(place.id);
              }
            }}
            center={[place.location[1], place.location[0]]}
            radius={isHovered ? 10 : 7}
            pathOptions={{
              fillColor: isHovered ? "#a78bfa" : "#8b5cf6",
              color: "#ffffff",
              weight: 2,
              fillOpacity: 1,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
              },
              mouseover: () => {
                onPlaceHover?.(place.id);
              },
              mouseout: () => {
                onPlaceHover?.(null);
              },
            }}
          >
            <Tooltip className="!text-sm">{place.name}</Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

function PlaceCreationHandler({
  onPlaceCreate,
}: {
  onPlaceCreate: (location: [number, number]) => void;
}) {
  useMapEvents({
    click: (e) => {
      onPlaceCreate([e.latlng.lng, e.latlng.lat]);
    },
  });
  return null;
}

function PointPickingHandler({
  onPickPoint,
}: {
  onPickPoint: (coords: [number, number]) => void;
}) {
  useMapEvents({
    click: (e) => {
      onPickPoint([e.latlng.lng, e.latlng.lat]);
    },
  });
  return null;
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computePathLength(geometry: GeoJSON.LineString | GeoJSON.MultiLineString): number {
  const lines = geometry.type === "MultiLineString"
    ? geometry.coordinates
    : [geometry.coordinates];
  let total = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      total += haversineDistance(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0]);
    }
  }
  return total;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function MeasureControl({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    const control = new L.Control({ position: "topleft" });

    control.onAdd = () => {
      const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
      const button = L.DomUtil.create("a", "", container);
      button.innerHTML = "&#128207;";
      button.title = "Measure distance";
      button.href = "#";
      button.role = "button";
      button.setAttribute("aria-label", "Measure distance");
      Object.assign(button.style, {
        fontSize: "16px",
        lineHeight: "26px",
        textAlign: "center",
        textDecoration: "none",
        cursor: "pointer",
        width: "30px",
        height: "30px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? "#f59e0b" : "",
        color: active ? "#ffffff" : "",
      });

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(button, "click", (e) => {
        L.DomEvent.preventDefault(e);
        onToggle();
      });

      return container;
    };

    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map, active, onToggle]);

  return null;
}

function MeasureClickHandler({
  onAdd,
}: {
  onAdd: (latlng: L.LatLng) => void;
}) {
  useMapEvents({
    click: (e) => {
      onAdd(e.latlng);
    },
  });
  return null;
}

function MeasureLayer({ points }: { points: L.LatLng[] }) {
  const positions = points.map((p): [number, number] => [p.lat, p.lng]);
  return (
    <>
      <Polyline
        positions={positions}
        pathOptions={{
          color: "#f59e0b",
          weight: 3,
          dashArray: "8 8",
          opacity: 0.9,
        }}
      />
      {points.map((p, i) => (
        <CircleMarker
          key={i}
          center={[p.lat, p.lng]}
          radius={5}
          pathOptions={{
            fillColor: "#f59e0b",
            color: "#ffffff",
            weight: 2,
            fillOpacity: 1,
          }}
        />
      ))}
    </>
  );
}

function SearchHighlightMarker({
  location,
}: {
  location: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    map.flyTo([location[1], location[0]], Math.max(map.getZoom(), 15), {
      duration: 0.5,
    });
  }, [map, location]);

  return (
    <CircleMarker
      center={[location[1], location[0]]}
      radius={10}
      pathOptions={{
        fillColor: "#f59e0b",
        color: "#ffffff",
        weight: 2,
        fillOpacity: 0.9,
      }}
    >
      <Tooltip>Search result</Tooltip>
    </CircleMarker>
  );
}

function FlyToPlace({ location }: { location: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo([location[1], location[0]], Math.max(map.getZoom(), 15), {
      duration: 0.5,
    });
  }, [map, location]);

  return null;
}

function FitToPath({
  pathId,
  paths,
}: {
  pathId: number;
  paths: PathFeatureCollection;
}) {
  const map = useMap();

  useEffect(() => {
    const feature = paths.features.find((f) => f.id === pathId);
    if (!feature) return;

    // Collect all features sharing the same name (the full road geometry)
    const name = feature.properties.name;
    const siblings = name
      ? paths.features.filter((f) => f.properties.name === name)
      : [feature];

    const group = L.featureGroup(
      siblings.map((f) => L.geoJSON(f.geometry)),
    );
    const bounds = group.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }
  }, [map, pathId, paths]);

  return null;
}

function TooltipRepositioner({
  tooltipData,
  pathFeatureMap,
  tooltipPosRef,
  tooltipElRef,
}: {
  tooltipData: { pathId: number; fromTable?: boolean } | null;
  pathFeatureMap: Map<number, PathFeature>;
  tooltipPosRef: React.MutableRefObject<{ x: number; y: number }>;
  tooltipElRef: React.RefObject<HTMLDivElement | null>;
}) {
  const map = useMap();
  useMapEvents({
    moveend: () => {
      if (!tooltipData?.fromTable || !tooltipElRef.current) return;
      const feature = pathFeatureMap.get(tooltipData.pathId);
      if (!feature) return;
      const center = L.geoJSON(feature.geometry).getBounds().getCenter();
      const pt = map.latLngToContainerPoint(center);
      tooltipPosRef.current = { x: pt.x + 12, y: pt.y - 12 };
      tooltipElRef.current.style.left = `${pt.x + 12}px`;
      tooltipElRef.current.style.top = `${pt.y - 12}px`;
    },
  });
  return null;
}

function TempPointMarkers({
  startTempPoint,
  endTempPoint,
}: {
  startTempPoint?: TempPoint | null;
  endTempPoint?: TempPoint | null;
}) {
  return (
    <>
      {startTempPoint && (
        <CircleMarker
          center={[startTempPoint.coords[1], startTempPoint.coords[0]]}
          radius={8}
          pathOptions={{
            fillColor: "#f59e0b",
            color: "#ffffff",
            weight: 2,
            fillOpacity: 1,
            dashArray: "4 3",
          }}
        >
          <Tooltip>Start (custom)</Tooltip>
        </CircleMarker>
      )}
      {endTempPoint && (
        <CircleMarker
          center={[endTempPoint.coords[1], endTempPoint.coords[0]]}
          radius={8}
          pathOptions={{
            fillColor: "#f59e0b",
            color: "#ffffff",
            weight: 2,
            fillOpacity: 1,
            dashArray: "4 3",
          }}
        >
          <Tooltip>End (custom)</Tooltip>
        </CircleMarker>
      )}
    </>
  );
}

export default function PathMap({
  region,
  paths,
  route,
  hoveredPathId,
  onPathHover,
  walkedPathIds,
  partiallyWalkedPathIds,
  isFavorite,
  places,
  isCreatingPlace,
  focusPlaceLocation,
  focusPlaceKey,
  onPlaceCreate,
  onPlaceDelete,
  composing,
  segments,
  selectedSegmentIds,
  onSegmentClick,
  composerError,
  composedStartPoint,
  composedEndPoint,
  pickingPoint,
  onPickPoint,
  startTempPoint,
  endTempPoint,
  hoveredPlaceId,
  onPlaceHover,
  searchHighlight,
  focusPathId,
  focusPathKey,
  hoveredRouteId,
  previewRoute,
}: PathMapProps) {
  const [measureActive, setMeasureActive] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);

  const toggleMeasure = useCallback(() => {
    setMeasureActive((prev) => {
      if (prev) setMeasurePoints([]);
      return !prev;
    });
  }, []);

  const measureTotal = useMemo(() => {
    let total = 0;
    for (let i = 1; i < measurePoints.length; i++) {
      const a = measurePoints[i - 1];
      const b = measurePoints[i];
      total += haversineDistance(a.lat, a.lng, b.lat, b.lng);
    }
    return total;
  }, [measurePoints]);

  const hasRoute = composing || (route && route.segments.features.length > 0);
  const totalSegments = hasRoute && route ? route.segments.features.length : 0;
  const layerMapRef = useRef<Map<number, L.Path>>(new Map());
  const routePathLayersRef = useRef<Map<string, { layer: L.Path; color: string }[]>>(new Map());
  const mapRef = useRef<L.Map | null>(null);

  function MapRefSetter() {
    const map = useMap();
    mapRef.current = map;
    return null;
  }

  const pathFeatureMap = useMemo(() => {
    const m = new Map<number, PathFeature>();
    for (const f of paths.features) m.set(f.id, f);
    return m;
  }, [paths]);

  // Map from path ID to all sibling IDs (same name = same physical road)
  const siblingIdsMap = useMemo(() => {
    const nameToIds = new Map<string, number[]>();
    for (const f of paths.features) {
      const name = f.properties.name;
      if (!name) continue;
      let ids = nameToIds.get(name);
      if (!ids) {
        ids = [];
        nameToIds.set(name, ids);
      }
      ids.push(f.id);
    }
    const result = new Map<number, number[]>();
    for (const ids of nameToIds.values()) {
      for (const id of ids) result.set(id, ids);
    }
    return result;
  }, [paths]);

  // Map each route segment id to a contiguous-name run group key
  const routeRunGroupMap = useMemo(() => {
    const map = new Map<number, string>();
    if (!route) return map;
    const features = route.segments.features;
    const sorted = [...features].sort(
      (a, b) => (a.properties.sequence_index ?? 0) - (b.properties.sequence_index ?? 0),
    );
    let runIndex = 0;
    let prevName: string | null = null;
    for (const f of sorted) {
      const name = f.properties.name || "";
      if (name !== prevName) {
        runIndex++;
        prevName = name;
      }
      map.set(f.id, `run-${runIndex}`);
    }
    return map;
  }, [route]);

  // Refs to avoid stale closures in onEachFeature callbacks
  const walkedPathIdsRef = useRef(walkedPathIds);
  walkedPathIdsRef.current = walkedPathIds;
  const partiallyWalkedPathIdsRef = useRef(partiallyWalkedPathIds);
  partiallyWalkedPathIdsRef.current = partiallyWalkedPathIds;
  const hasRouteRef = useRef(hasRoute);
  hasRouteRef.current = hasRoute;
  const onPathHoverRef = useRef(onPathHover);
  onPathHoverRef.current = onPathHover;
  const siblingIdsMapRef = useRef(siblingIdsMap);
  siblingIdsMapRef.current = siblingIdsMap;

  // Composition mode state and refs
  const [rejectedSegmentId, setRejectedSegmentId] = useState<number | null>(null);
  const rejectedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onSegmentClickRef = useRef(onSegmentClick);
  onSegmentClickRef.current = onSegmentClick;
  const selectedSegmentIdsRef = useRef(selectedSegmentIds);
  selectedSegmentIdsRef.current = selectedSegmentIds;
  const composingRef = useRef(composing);
  composingRef.current = composing;

  useEffect(() => {
    // When composerError changes and there's an error, we could flash the last clicked segment
    // The parent manages error state; this is handled by the segment click rejection in RegionExplorer
  }, [composerError]);

  // Tooltip state
  const [tooltipData, setTooltipData] = useState<{
    pathId: number;
    props: PathFeature["properties"];
    fromTable?: boolean;
  } | null>(null);
  const tooltipPosRef = useRef({ x: 0, y: 0 });
  const tooltipElRef = useRef<HTMLDivElement>(null);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hoveredPathIdRef = useRef<number | null>(null);

  function getBaseStyle(pathId: number): PathOptions {
    if (hasRouteRef.current) return PATH_DIMMED_STYLE;
    const walked = walkedPathIdsRef.current?.has(pathId) ?? false;
    return walked ? WALKED_HIGHLIGHT_STYLE : UNWALKED_DIMMED_STYLE;
  }

  function getHoverStyle(pathId: number): PathOptions {
    if (hasRouteRef.current) return PATH_DIMMED_STYLE;
    const partiallyWalked = partiallyWalkedPathIdsRef.current?.has(pathId) ?? false;
    if (partiallyWalked) return WALKED_HOVER_STYLE;
    return HOVER_STYLE;
  }

  function setSiblingsHoverStyle(pathId: number) {
    const siblings = siblingIdsMapRef.current.get(pathId);
    if (!siblings) return;
    for (const sid of siblings) {
      if (sid === pathId) continue;
      const layer = layerMapRef.current.get(sid);
      if (layer) layer.setStyle(getHoverStyle(sid));
    }
  }

  function resetSiblingsStyle(pathId: number) {
    const siblings = siblingIdsMapRef.current.get(pathId);
    if (!siblings) return;
    for (const sid of siblings) {
      if (sid === pathId) continue;
      const layer = layerMapRef.current.get(sid);
      if (layer) layer.setStyle(getBaseStyle(sid));
    }
  }

  // Imperative style update when walkedPathIds changes
  useEffect(() => {
    layerMapRef.current.forEach((layer, pathId) => {
      if (pathId !== hoveredPathId) {
        layer.setStyle(getBaseStyle(pathId));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkedPathIds, hasRoute, isFavorite]);

  // External hover drives style (highlight all siblings)
  useEffect(() => {
    if (hoveredPathId == null) return;
    const layer = layerMapRef.current.get(hoveredPathId);
    if (!layer) return;

    const hoverStyle = getHoverStyle(hoveredPathId);
    layer.setStyle(hoverStyle);
    layer.bringToFront();
    setSiblingsHoverStyle(hoveredPathId);

    // Show tooltip at path center (favorite only, from list hover)
    if (isFavorite && hoveredPathIdRef.current !== hoveredPathId && mapRef.current) {
      const feature = pathFeatureMap.get(hoveredPathId);
      if (feature) {
        const center = L.geoJSON(feature.geometry).getBounds().getCenter();
        const pt = mapRef.current.latLngToContainerPoint(center);
        tooltipPosRef.current = { x: pt.x + 12, y: pt.y - 12 };
        setTooltipData({ pathId: hoveredPathId, props: feature.properties, fromTable: true });
      }
    }

    return () => {
      layer.setStyle(getBaseStyle(hoveredPathId));
      resetSiblingsStyle(hoveredPathId);
      if (hoveredPathIdRef.current == null) {
        setTooltipData(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredPathId, isFavorite, pathFeatureMap]);

  // Active route hover: highlight all route segments when hovering in sidebar
  useEffect(() => {
    if (hoveredRouteId == null || previewRoute != null) return;

    // Only highlight if it's the active route (layers exist in routePathLayersRef)
    const entries = Array.from(routePathLayersRef.current.values());
    if (entries.length === 0) return;

    for (const group of entries) {
      for (const entry of group) {
        entry.layer.setStyle(ROUTE_HOVER_STYLE);
        entry.layer.bringToFront();
      }
    }

    return () => {
      for (const group of entries) {
        for (const entry of group) {
          entry.layer.setStyle({
            color: entry.color,
            weight: 4,
            opacity: 0.9,
          });
        }
      }
    };
  }, [hoveredRouteId, previewRoute]);

  const pathStyleFn = useCallback(
    (feature: GeoJSON.Feature | undefined) => {
      if (!feature) return UNWALKED_DIMMED_STYLE;
      const pathId = (feature as PathFeature).id;
      return getBaseStyle(pathId);
    },
    [],
  );

  return (
    <div className={`relative h-full w-full${isCreatingPlace || pickingPoint || measureActive ? " [&_.leaflet-container]:!cursor-crosshair" : ""}`}>
      <MapContainer
        center={[51.4, 21.1]}
        zoom={12}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds region={region} paths={paths} route={route} />
        <MapRefSetter />
        <TooltipRepositioner
          tooltipData={tooltipData}
          pathFeatureMap={pathFeatureMap}
          tooltipPosRef={tooltipPosRef}
          tooltipElRef={tooltipElRef}
        />
        <ResetViewControl region={region} paths={paths} />
        <MeasureControl active={measureActive} onToggle={toggleMeasure} />
        {measureActive && !isCreatingPlace && !pickingPoint && (
          <MeasureClickHandler
            onAdd={(latlng) => setMeasurePoints((prev) => [...prev, latlng])}
          />
        )}
        {measureActive && measurePoints.length > 0 && (
          <MeasureLayer points={measurePoints} />
        )}
        {isCreatingPlace && (
          <PlaceCreationHandler onPlaceCreate={onPlaceCreate!} />
        )}
        {pickingPoint && onPickPoint && (
          <PointPickingHandler onPickPoint={onPickPoint} />
        )}
        {places && places.length > 0 && (
          <PlaceMarkers places={places} hoveredPlaceId={hoveredPlaceId} onPlaceHover={onPlaceHover} />
        )}
        <TempPointMarkers startTempPoint={startTempPoint} endTempPoint={endTempPoint} />
        {searchHighlight && (
          <SearchHighlightMarker location={searchHighlight} />
        )}
        {focusPlaceLocation && (
          <FlyToPlace key={focusPlaceKey} location={focusPlaceLocation} />
        )}
        {focusPathId != null && (
          <FitToPath key={focusPathKey} pathId={focusPathId} paths={paths} />
        )}
        {paths.features.length > 0 && (
          <GeoJSON
            key={`paths-${hasRoute ? "dimmed" : "normal"}`}
            data={paths}
            style={pathStyleFn}
            onEachFeature={(feature, layer: Layer) => {
              const pathFeature = feature as PathFeature;
              const pathId = pathFeature.id;
              const props = pathFeature.properties;

              layerMapRef.current.set(pathId, layer as L.Path);

              layer.on({
                mouseover: (e) => {
                  clearTimeout(hideTimerRef.current);
                  hoveredPathIdRef.current = pathId;
                  (e.target as L.Path).setStyle(getHoverStyle(pathId));
                  setSiblingsHoverStyle(pathId);
                  onPathHoverRef.current?.(pathId);
                  const containerPoint = (
                    e as L.LeafletMouseEvent
                  ).containerPoint;
                  tooltipPosRef.current = {
                    x: containerPoint.x + 12,
                    y: containerPoint.y - 12,
                  };
                  setTooltipData({ pathId, props });
                },
                mousemove: (e) => {
                  if (tooltipElRef.current) {
                    const containerPoint = (
                      e as L.LeafletMouseEvent
                    ).containerPoint;
                    const x = containerPoint.x + 12;
                    const y = containerPoint.y - 12;
                    tooltipPosRef.current = { x, y };
                    tooltipElRef.current.style.left = `${x}px`;
                    tooltipElRef.current.style.top = `${y}px`;
                  }
                },
                mouseout: (e) => {
                  (e.target as L.Path).setStyle(getBaseStyle(pathId));
                  resetSiblingsStyle(pathId);
                  hoveredPathIdRef.current = null;
                  onPathHoverRef.current?.(null);
                  hideTimerRef.current = setTimeout(() => {
                    setTooltipData(null);
                  }, 150);
                },
              });
            }}
          />
        )}
        {hasRoute && route && route.segments.features.length > 0 && (
          <>
            <GeoJSON
              key={`route-${route.total_distance}`}
              data={route.segments}
              style={(feature) => {
                const props = (feature as PathFeature | undefined)?.properties;
                const seqIdx = props?.sequence_index ?? 0;
                const color = getSegmentColor(seqIdx, totalSegments);
                return {
                  color,
                  weight: 4,
                  opacity: 0.9,
                  className: 'route-segment',
                };
              }}
              onEachFeature={(feature, layer: Layer) => {
                const featureId = (feature as PathFeature).id;
                const props = (feature as PathFeature).properties;
                const seqIdx = props.sequence_index ?? 0;
                const segmentColor = getSegmentColor(seqIdx, totalSegments);
                const pathFeature = feature as PathFeature;
                layer.bindTooltip(
                  buildRouteTooltip(props, pathFeature.geometry, totalSegments),
                  { sticky: true },
                );

                const runKey = routeRunGroupMap.get(featureId);
                if (runKey != null) {
                  let group = routePathLayersRef.current.get(runKey);
                  if (!group) {
                    group = [];
                    routePathLayersRef.current.set(runKey, group);
                  }
                  group.push({ layer: layer as L.Path, color: segmentColor });
                }

                layer.on({
                  mouseover: () => {
                    if (runKey != null) {
                      const group = routePathLayersRef.current.get(runKey);
                      if (group) {
                        for (const entry of group) {
                          entry.layer.setStyle(ROUTE_HOVER_STYLE);
                          entry.layer.bringToFront();
                        }
                      }
                    } else {
                      (layer as L.Path).setStyle(ROUTE_HOVER_STYLE);
                    }
                  },
                  mouseout: () => {
                    if (runKey != null) {
                      const group = routePathLayersRef.current.get(runKey);
                      if (group) {
                        for (const entry of group) {
                          entry.layer.setStyle({
                            color: entry.color,
                            weight: 4,
                            opacity: 0.9,
                          });
                        }
                      }
                    } else {
                      (layer as L.Path).setStyle({
                        color: segmentColor,
                        weight: 4,
                        opacity: 0.9,
                      });
                    }
                  },
                });
              }}
            />
            <RouteMarkers route={route} />
          </>
        )}
        {previewRoute && previewRoute.segments.features.length > 0 && (
          <>
            <GeoJSON
              key={`route-preview-${hoveredRouteId}`}
              data={previewRoute.segments}
              style={() => ROUTE_HOVER_STYLE}
            />
            <RouteMarkers route={previewRoute} />
          </>
        )}
        {composing && segments && (
          <GeoJSON
            key={`segments-compose-${segments.features.length}`}
            data={segments}
            style={(feature) => {
              const segId = (feature as SegmentFeature).id;
              if (rejectedSegmentId === segId) return SEGMENT_REJECTED_STYLE;
              if (selectedSegmentIds?.includes(segId)) {
                const idx = selectedSegmentIds.indexOf(segId);
                const total = selectedSegmentIds.length;
                return { color: getSegmentColor(idx, total), weight: 5, opacity: 0.9 };
              }
              return SEGMENT_AVAILABLE_STYLE;
            }}
            onEachFeature={(feature, layer: Layer) => {
              const segId = (feature as SegmentFeature).id;
              layer.on({
                click: () => {
                  onSegmentClickRef.current?.(segId);
                },
                mouseover: (e) => {
                  if (!selectedSegmentIdsRef.current?.includes(segId)) {
                    (e.target as L.Path).setStyle(SEGMENT_HOVER_STYLE);
                  }
                },
                mouseout: (e) => {
                  if (rejectedSegmentId === segId) return;
                  if (selectedSegmentIdsRef.current?.includes(segId)) {
                    const idx = selectedSegmentIdsRef.current.indexOf(segId);
                    const total = selectedSegmentIdsRef.current.length;
                    (e.target as L.Path).setStyle({ color: getSegmentColor(idx, total), weight: 5, opacity: 0.9 });
                  } else {
                    (e.target as L.Path).setStyle(SEGMENT_AVAILABLE_STYLE);
                  }
                },
              });
            }}
          />
        )}
        {composing && composedStartPoint && composedEndPoint && (
          <RouteMarkers route={{
            total_distance: 0,
            is_loop: false,
            start_point: composedStartPoint,
            end_point: composedEndPoint,
            segments: { type: "FeatureCollection", features: [] },
            paths_count: 0,
            path_names: [],
          }} />
        )}
      </MapContainer>
      {tooltipData && (
        <div
          ref={tooltipElRef}
          className="pointer-events-none absolute z-[1001] rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg"
          style={{
            left: tooltipPosRef.current.x,
            top: tooltipPosRef.current.y,
          }}
        >
          <strong className="text-card-foreground">
            {tooltipData.props.name || "Unnamed"}
          </strong>
          <div className="text-muted-foreground">
            Distance: {(() => {
              const ids = siblingIdsMap.get(tooltipData.pathId) ?? [tooltipData.pathId];
              let total = 0;
              for (const id of ids) {
                const f = pathFeatureMap.get(id);
                if (f) total += computePathLength(f.geometry);
              }
              return (total / 1000).toFixed(1);
            })()} km
          </div>
          <div className="text-muted-foreground">
            Category: {tooltipData.props.category}
          </div>
          <div className="text-muted-foreground">
            Surface: {tooltipData.props.surface || "unknown"}
          </div>
          <div className="text-muted-foreground">
            Lit: {tooltipData.props.is_lit ? "Yes" : "No"}
          </div>
        </div>
      )}
      {measureActive && (
        <div
          className="absolute z-[1001] rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg"
          style={{ left: 50, top: 10 }}
        >
          <div className="mb-2 font-semibold text-card-foreground">
            {formatDistance(measureTotal)}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary/80"
              onClick={() =>
                setMeasurePoints((prev) => prev.slice(0, -1))
              }
              disabled={measurePoints.length === 0}
            >
              Undo
            </button>
            <button
              className="rounded bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary/80"
              onClick={() => setMeasurePoints([])}
            >
              Clear
            </button>
            <button
              className="rounded bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary/80"
              onClick={() => {
                setMeasureActive(false);
                setMeasurePoints([]);
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
