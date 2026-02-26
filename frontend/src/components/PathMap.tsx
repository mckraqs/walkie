"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  onToggleWalk?: (pathId: number) => void;
  isFavorite?: boolean;
  focusedPathId?: number | null;
  onFocusHandled?: () => void;
  selectedPathId?: number | null;
  onPathSelect?: (pathId: number) => void;
  onDeselectPath?: () => void;
  places?: Place[];
  showPlaces?: boolean;
  isCreatingPlace?: boolean;
  onPlaceCreate?: (location: [number, number]) => void;
  onPlaceDelete?: () => void;
  composing?: boolean;
  segments?: SegmentFeatureCollection | null;
  selectedSegmentIds?: number[];
  onSegmentClick?: (segmentId: number) => void;
  composerError?: string | null;
  composedStartPoint?: [number, number] | null;
  composedEndPoint?: [number, number] | null;
  showWalkedOnly?: boolean;
}

const PATH_STYLE: PathOptions = {
  color: "#3b82f6",
  weight: 4,
  opacity: 1,
};

const PATH_DIMMED_STYLE: PathOptions = {
  color: "#3b82f6",
  weight: 2,
  opacity: 0.3,
};

const HOVER_STYLE: PathOptions = {
  color: "#1d4ed8",
  weight: 5,
  opacity: 1,
};

const SELECTED_STYLE: PathOptions = {
  color: "#f97316",
  weight: 6,
  opacity: 1,
};

const WALKED_STYLE: PathOptions = {
  color: "#059669",
  weight: 4,
  opacity: 0.9,
};

const WALKED_HIGHLIGHT_STYLE: PathOptions = {
  color: "#059669",
  weight: 5,
  opacity: 1.0,
};

const UNWALKED_DIMMED_STYLE: PathOptions = {
  color: "#9ca3af",
  weight: 2,
  opacity: 0.3,
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
  total: number,
): string {
  const lines = [
    `<strong>${props.name || "Unnamed"}</strong>`,
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

function FitToPath({
  focusedPathId,
  paths,
  onFocusHandled,
}: {
  focusedPathId: number | null | undefined;
  paths: PathFeatureCollection;
  onFocusHandled?: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (focusedPathId == null) return;

    const feature = paths.features.find((f) => f.id === focusedPathId);
    if (!feature) return;

    const bounds = L.geoJSON(feature.geometry).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }

    onFocusHandled?.();
  }, [map, focusedPathId, paths, onFocusHandled]);

  return null;
}

function FitBounds({ region, paths, route }: PathMapProps) {
  const map = useMap();

  useEffect(() => {
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

function MapClickHandler({ onDeselect, skipRef }: { onDeselect?: () => void; skipRef: React.RefObject<boolean> }) {
  const ref = useRef(onDeselect);
  ref.current = onDeselect;
  useMapEvents({
    click: () => {
      if (skipRef.current) {
        skipRef.current = false;
        return;
      }
      ref.current?.();
    },
  });
  return null;
}

function PlaceMarkers({
  places,
}: {
  places: Place[];
}) {
  return (
    <>
      {places.map((place) => (
        <CircleMarker
          key={place.id}
          center={[place.location[1], place.location[0]]}
          radius={7}
          pathOptions={{
            fillColor: "#8b5cf6",
            color: "#ffffff",
            weight: 2,
            fillOpacity: 1,
          }}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
            },
          }}
        >
          <Tooltip>{place.name}</Tooltip>
        </CircleMarker>
      ))}
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

export default function PathMap({
  region,
  paths,
  route,
  hoveredPathId,
  onPathHover,
  walkedPathIds,
  isFavorite,
  focusedPathId,
  onFocusHandled,
  selectedPathId,
  onPathSelect,
  onDeselectPath,
  places,
  showPlaces,
  isCreatingPlace,
  onPlaceCreate,
  onPlaceDelete,
  composing,
  segments,
  selectedSegmentIds,
  onSegmentClick,
  composerError,
  composedStartPoint,
  composedEndPoint,
  showWalkedOnly,
}: PathMapProps) {
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
  const hasRouteRef = useRef(hasRoute);
  hasRouteRef.current = hasRoute;
  const onPathHoverRef = useRef(onPathHover);
  onPathHoverRef.current = onPathHover;
  const selectedPathIdRef = useRef(selectedPathId);
  selectedPathIdRef.current = selectedPathId;
  const onPathSelectRef = useRef(onPathSelect);
  onPathSelectRef.current = onPathSelect;
  const siblingIdsMapRef = useRef(siblingIdsMap);
  siblingIdsMapRef.current = siblingIdsMap;
  const selectionFromMapRef = useRef(false);
  const pathClickedRef = useRef(false);

  // Composition mode state and refs
  const [rejectedSegmentId, setRejectedSegmentId] = useState<number | null>(null);
  const rejectedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onSegmentClickRef = useRef(onSegmentClick);
  onSegmentClickRef.current = onSegmentClick;
  const selectedSegmentIdsRef = useRef(selectedSegmentIds);
  selectedSegmentIdsRef.current = selectedSegmentIds;
  const showWalkedOnlyRef = useRef(showWalkedOnly);
  showWalkedOnlyRef.current = showWalkedOnly;
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
    pinned?: boolean;
  } | null>(null);
  const tooltipPosRef = useRef({ x: 0, y: 0 });
  const tooltipElRef = useRef<HTMLDivElement>(null);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hoveredPathIdRef = useRef<number | null>(null);

  function getBaseStyle(pathId: number): PathOptions {
    if (hasRouteRef.current) return PATH_DIMMED_STYLE;
    const walked = walkedPathIdsRef.current?.has(pathId) ?? false;
    if (showWalkedOnlyRef.current && walked) return WALKED_HIGHLIGHT_STYLE;
    if (showWalkedOnlyRef.current && !walked) return UNWALKED_DIMMED_STYLE;
    if (walked) return WALKED_STYLE;
    return PATH_STYLE;
  }

  function getHoverStyle(): PathOptions {
    if (hasRouteRef.current) return PATH_DIMMED_STYLE;
    return HOVER_STYLE;
  }

  function setSiblingsStyle(pathId: number, style: PathOptions) {
    const siblings = siblingIdsMapRef.current.get(pathId);
    if (!siblings) return;
    for (const sid of siblings) {
      if (sid === pathId) continue;
      const layer = layerMapRef.current.get(sid);
      if (layer) layer.setStyle(style);
    }
  }

  function resetSiblingsStyle(pathId: number) {
    const siblings = siblingIdsMapRef.current.get(pathId);
    if (!siblings) return;
    for (const sid of siblings) {
      if (sid === pathId) continue;
      if (selectedPathIdRef.current === sid) continue;
      const layer = layerMapRef.current.get(sid);
      if (layer) layer.setStyle(getBaseStyle(sid));
    }
  }

  // Imperative style update when walkedPathIds changes
  useEffect(() => {
    layerMapRef.current.forEach((layer, pathId) => {
      if (pathId !== hoveredPathId && pathId !== selectedPathId) {
        layer.setStyle(getBaseStyle(pathId));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkedPathIds, hasRoute, showWalkedOnly]);

  // External hover drives style (highlight all siblings)
  useEffect(() => {
    if (hoveredPathId == null) return;
    const layer = layerMapRef.current.get(hoveredPathId);
    if (!layer) return;

    layer.setStyle(HOVER_STYLE);
    layer.bringToFront();
    setSiblingsStyle(hoveredPathId, HOVER_STYLE);

    // Show tooltip at path center (favorite only, no selection active)
    if (selectedPathId == null && isFavorite && hoveredPathIdRef.current !== hoveredPathId && mapRef.current) {
      const feature = pathFeatureMap.get(hoveredPathId);
      if (feature) {
        const center = L.geoJSON(feature.geometry).getBounds().getCenter();
        const pt = mapRef.current.latLngToContainerPoint(center);
        tooltipPosRef.current = { x: pt.x + 12, y: pt.y - 12 };
        setTooltipData({ pathId: hoveredPathId, props: feature.properties, fromTable: true });
      }
    }

    return () => {
      if (selectedPathId != null && hoveredPathId === selectedPathId) {
        layer.setStyle(SELECTED_STYLE);
      } else {
        layer.setStyle(getBaseStyle(hoveredPathId));
      }
      resetSiblingsStyle(hoveredPathId);
      // Clear tooltip only if no selection and no active map hover
      if (selectedPathId == null && hoveredPathIdRef.current == null) {
        setTooltipData(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredPathId, selectedPathId, isFavorite, pathFeatureMap]);

  // Selected path styling and pinned tooltip
  useEffect(() => {
    // Clear previous selection styles (skip hovered path)
    layerMapRef.current.forEach((layer, pathId) => {
      if (pathId !== hoveredPathId) {
        layer.setStyle(getBaseStyle(pathId));
      }
    });

    if (selectedPathId == null) {
      setTooltipData((prev) => (prev?.pinned ? null : prev));
      return;
    }

    const layer = layerMapRef.current.get(selectedPathId);
    if (layer) {
      layer.setStyle(SELECTED_STYLE);
      layer.bringToFront();
    }
    setSiblingsStyle(selectedPathId, SELECTED_STYLE);

    const feature = pathFeatureMap.get(selectedPathId);
    if (selectionFromMapRef.current) {
      selectionFromMapRef.current = false;
      if (feature) {
        setTooltipData({ pathId: selectedPathId, props: feature.properties, pinned: true });
      }
    } else if (feature && mapRef.current) {
      const center = L.geoJSON(feature.geometry).getBounds().getCenter();
      const pt = mapRef.current.latLngToContainerPoint(center);
      tooltipPosRef.current = { x: pt.x + 12, y: pt.y - 12 };
      setTooltipData({ pathId: selectedPathId, props: feature.properties, pinned: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPathId]);

  return (
    <div className={`relative h-full w-full${isCreatingPlace ? " [&_.leaflet-container]:!cursor-crosshair" : ""}`}>
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
        <FitToPath focusedPathId={focusedPathId} paths={paths} onFocusHandled={onFocusHandled} />
        <MapRefSetter />
        <MapClickHandler onDeselect={onDeselectPath} skipRef={pathClickedRef} />
        {isCreatingPlace && (
          <PlaceCreationHandler onPlaceCreate={onPlaceCreate!} />
        )}
        {showPlaces && places && places.length > 0 && (
          <PlaceMarkers places={places} />
        )}
        {paths.features.length > 0 && (
          <GeoJSON
            key={`paths-${hasRoute ? "dimmed" : "normal"}`}
            data={paths}
            style={(feature) => {
              const pathId = (feature as PathFeature).id;
              return getBaseStyle(pathId);
            }}
            onEachFeature={(feature, layer: Layer) => {
              const pathFeature = feature as PathFeature;
              const pathId = pathFeature.id;
              const props = pathFeature.properties;

              layerMapRef.current.set(pathId, layer as L.Path);

              layer.on({
                click: (e) => {
                  if (composingRef.current) return;
                  if (hasRouteRef.current) return;
                  pathClickedRef.current = true;
                  const containerPoint = (
                    e as L.LeafletMouseEvent
                  ).containerPoint;
                  tooltipPosRef.current = {
                    x: containerPoint.x + 12,
                    y: containerPoint.y - 12,
                  };
                  setTooltipData({ pathId, props, pinned: true });
                  if (selectedPathIdRef.current !== pathId) {
                    selectionFromMapRef.current = true;
                    onPathSelectRef.current?.(pathId);
                  }
                },
                mouseover: (e) => {
                  clearTimeout(hideTimerRef.current);
                  hoveredPathIdRef.current = pathId;
                  (e.target as L.Path).setStyle(getHoverStyle());
                  setSiblingsStyle(pathId, getHoverStyle());
                  onPathHoverRef.current?.(pathId);
                  if (selectedPathIdRef.current == null) {
                    const containerPoint = (
                      e as L.LeafletMouseEvent
                    ).containerPoint;
                    tooltipPosRef.current = {
                      x: containerPoint.x + 12,
                      y: containerPoint.y - 12,
                    };
                    setTooltipData({ pathId, props });
                  }
                },
                mousemove: (e) => {
                  if (selectedPathIdRef.current != null) return;
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
                  if (selectedPathIdRef.current === pathId) {
                    (e.target as L.Path).setStyle(SELECTED_STYLE);
                  } else {
                    (e.target as L.Path).setStyle(getBaseStyle(pathId));
                  }
                  resetSiblingsStyle(pathId);
                  hoveredPathIdRef.current = null;
                  onPathHoverRef.current?.(null);
                  if (selectedPathIdRef.current == null) {
                    hideTimerRef.current = setTimeout(() => {
                      setTooltipData(null);
                    }, 150);
                  }
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
                layer.bindTooltip(
                  buildRouteTooltip(props, totalSegments),
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
          className="pointer-events-none absolute z-[1001] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
          style={{
            left: tooltipPosRef.current.x,
            top: tooltipPosRef.current.y,
          }}
        >
          <strong className="text-zinc-900 dark:text-zinc-100">
            {tooltipData.props.name || "Unnamed"}
          </strong>
          <div className="text-zinc-600 dark:text-zinc-400">
            Category: {tooltipData.props.category}
          </div>
          <div className="text-zinc-600 dark:text-zinc-400">
            Surface: {tooltipData.props.surface || "unknown"}
          </div>
          <div className="text-zinc-600 dark:text-zinc-400">
            Accessible: {tooltipData.props.accessible ? "Yes" : "No"}
          </div>
          <div className="text-zinc-600 dark:text-zinc-400">
            Lit: {tooltipData.props.is_lit ? "Yes" : "No"}
          </div>
          {isFavorite && !tooltipData.fromTable && (
            <div className="text-zinc-600 dark:text-zinc-400">
              Walked: {walkedPathIds?.has(tooltipData.pathId) ? "Yes" : "No"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
