"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
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

const ROUTE_STYLE: PathOptions = {
  color: "#f59e0b",
  weight: 5,
  opacity: 0.9,
};

const ROUTE_HOVER_STYLE: PathOptions = {
  color: "#d97706",
  weight: 6,
  opacity: 1,
};

function buildTooltip(props: PathFeature["properties"]): string {
  return [
    `<strong>${props.name || "Unnamed"}</strong>`,
    `Category: ${props.category}`,
    `Surface: ${props.surface || "unknown"}`,
    `Accessible: ${props.accessible ? "Yes" : "No"}`,
    `Lit: ${props.is_lit ? "Yes" : "No"}`,
  ].join("<br>");
}

function FitBounds({ region, paths, route }: PathMapProps) {
  const map = useMap();

  useEffect(() => {
    const fitTarget =
      route && route.paths.features.length > 0
        ? route.paths
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
  const hasRoute = route && route.paths.features.length > 0;
  const baseStyle = hasRoute ? PATH_DIMMED_STYLE : PATH_STYLE;
  const baseHoverStyle = hasRoute ? PATH_DIMMED_STYLE : HOVER_STYLE;

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
        <GeoJSON
          key={`route-${route.total_distance}`}
          data={route.paths}
          style={() => ROUTE_STYLE}
          onEachFeature={(feature, layer: Layer) => {
            const props = (feature as PathFeature).properties;
            layer.bindTooltip(buildTooltip(props), { sticky: true });
            layer.on({
              mouseover: (e) => {
                (e.target as L.Path).setStyle(ROUTE_HOVER_STYLE);
              },
              mouseout: (e) => {
                (e.target as L.Path).setStyle(ROUTE_STYLE);
              },
            });
          }}
        />
      )}
    </MapContainer>
  );
}
