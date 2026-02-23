"use client";

import { useEffect } from "react";
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

function buildTooltip(props: PathFeature["properties"]): string {
  return [
    `<strong>${props.name || "Unnamed"}</strong>`,
    `Category: ${props.category}`,
    `Surface: ${props.surface || "unknown"}`,
    `Accessible: ${props.accessible ? "Yes" : "No"}`,
    `Lit: ${props.is_lit ? "Yes" : "No"}`,
  ].join("<br>");
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

  // Points from backend are [lon, lat]; Leaflet needs [lat, lon]
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

export default function PathMap({ region, paths, route }: PathMapProps) {
  const hasRoute = route && route.segments.features.length > 0;
  const baseStyle = hasRoute ? PATH_DIMMED_STYLE : PATH_STYLE;
  const baseHoverStyle = hasRoute ? PATH_DIMMED_STYLE : HOVER_STYLE;
  const totalSegments = hasRoute ? route.segments.features.length : 0;

  return (
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
      {paths.features.length > 0 && (
        <GeoJSON
          key={`paths-${hasRoute ? "dimmed" : "normal"}`}
          data={paths}
          style={() => baseStyle}
          onEachFeature={(feature, layer: Layer) => {
            const props = (feature as PathFeature).properties;
            layer.bindTooltip(buildTooltip(props), { sticky: true });
            layer.on({
              mouseover: (e) => {
                (e.target as L.Path).setStyle(baseHoverStyle);
              },
              mouseout: (e) => {
                (e.target as L.Path).setStyle(baseStyle);
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
  );
}
