"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type {
  RegionFeature,
  PathFeature,
  PathFeatureCollection,
  RouteResponse,
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
}

const PATH_STYLE: PathOptions = {
  color: "#3b82f6",
  weight: 3,
  opacity: 0.8,
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

const WALKED_STYLE: PathOptions = {
  color: "#22c55e",
  weight: 3,
  opacity: 0.8,
};

const ROUTE_HOVER_STYLE: PathOptions = {
  color: "#d97706",
  weight: 6,
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

export default function PathMap({
  region,
  paths,
  route,
  hoveredPathId,
  onPathHover,
  walkedPathIds,
  onToggleWalk,
  isFavorite,
}: PathMapProps) {
  const hasRoute = route && route.segments.features.length > 0;
  const totalSegments = hasRoute ? route.segments.features.length : 0;
  const layerMapRef = useRef<Map<number, L.Path>>(new Map());
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

  // Refs to avoid stale closures in onEachFeature callbacks
  const walkedPathIdsRef = useRef(walkedPathIds);
  walkedPathIdsRef.current = walkedPathIds;
  const hasRouteRef = useRef(hasRoute);
  hasRouteRef.current = hasRoute;
  const onPathHoverRef = useRef(onPathHover);
  onPathHoverRef.current = onPathHover;

  // Tooltip state
  const [tooltipData, setTooltipData] = useState<{
    pathId: number;
    props: PathFeature["properties"];
    fromTable?: boolean;
  } | null>(null);
  const tooltipPosRef = useRef({ x: 0, y: 0 });
  const tooltipElRef = useRef<HTMLDivElement>(null);
  const tooltipPinnedRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hoveredPathIdRef = useRef<number | null>(null);

  function getBaseStyle(pathId: number): PathOptions {
    if (hasRouteRef.current) return PATH_DIMMED_STYLE;
    if (walkedPathIdsRef.current?.has(pathId)) return WALKED_STYLE;
    return PATH_STYLE;
  }

  function getHoverStyle(): PathOptions {
    if (hasRouteRef.current) return PATH_DIMMED_STYLE;
    return HOVER_STYLE;
  }

  // Imperative style update when walkedPathIds changes
  useEffect(() => {
    layerMapRef.current.forEach((layer, pathId) => {
      if (pathId !== hoveredPathId) {
        layer.setStyle(getBaseStyle(pathId));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkedPathIds, hasRoute]);

  // External hover (from PathList) drives style
  useEffect(() => {
    if (hoveredPathId == null) return;
    const layer = layerMapRef.current.get(hoveredPathId);
    if (!layer) return;

    layer.setStyle(HOVER_STYLE);
    layer.bringToFront();

    // Show tooltip at path center for hover originating from PathList (favorite only)
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
      // Clear tooltip only if no active map hover and tooltip is not pinned
      if (hoveredPathIdRef.current == null && !tooltipPinnedRef.current) {
        setTooltipData(null);
      }
    };
  }, [hoveredPathId, isFavorite, pathFeatureMap]);

  return (
    <div className="relative h-full w-full">
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
                mouseover: (e) => {
                  clearTimeout(hideTimerRef.current);
                  const containerPoint = (
                    e as L.LeafletMouseEvent
                  ).containerPoint;
                  tooltipPosRef.current = {
                    x: containerPoint.x + 12,
                    y: containerPoint.y - 12,
                  };
                  hoveredPathIdRef.current = pathId;
                  setTooltipData({ pathId, props });
                  (e.target as L.Path).setStyle(getHoverStyle());
                  onPathHoverRef.current?.(pathId);
                },
                mousemove: (e) => {
                  if (!tooltipPinnedRef.current && tooltipElRef.current) {
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
                  hoveredPathIdRef.current = null;
                  onPathHoverRef.current?.(null);
                  hideTimerRef.current = setTimeout(() => {
                    if (!tooltipPinnedRef.current) {
                      setTooltipData(null);
                    }
                  }, 150);
                },
              });
            }}
          />
        )}
        {hasRoute && (
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
                  weight: 5,
                  opacity: 0.9,
                };
              }}
              onEachFeature={(feature, layer: Layer) => {
                const props = (feature as PathFeature).properties;
                const seqIdx = props.sequence_index ?? 0;
                const segmentColor = getSegmentColor(seqIdx, totalSegments);
                layer.bindTooltip(
                  buildRouteTooltip(props, totalSegments),
                  { sticky: true },
                );
                layer.on({
                  mouseover: (e) => {
                    (e.target as L.Path).setStyle(ROUTE_HOVER_STYLE);
                  },
                  mouseout: (e) => {
                    (e.target as L.Path).setStyle({
                      color: segmentColor,
                      weight: 5,
                      opacity: 0.9,
                    });
                  },
                });
              }}
            />
            <RouteMarkers route={route} />
          </>
        )}
      </MapContainer>
      {tooltipData && (
        <div
          ref={tooltipElRef}
          className="pointer-events-auto absolute z-[1001] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
          style={{
            left: tooltipPosRef.current.x,
            top: tooltipPosRef.current.y,
          }}
          onMouseEnter={() => {
            tooltipPinnedRef.current = true;
            clearTimeout(hideTimerRef.current);
          }}
          onMouseLeave={() => {
            tooltipPinnedRef.current = false;
            if (hoveredPathIdRef.current == null) {
              hideTimerRef.current = setTimeout(
                () => setTooltipData(null),
                150,
              );
            }
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
            <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                className="accent-green-500"
                checked={walkedPathIds?.has(tooltipData.pathId) ?? false}
                onChange={() => onToggleWalk?.(tooltipData.pathId)}
              />
              Walked
            </label>
          )}
        </div>
      )}
    </div>
  );
}
