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
} from "@/types/geo";

interface PathMapProps {
  region: RegionFeature;
  paths: PathFeatureCollection;
}

const PATH_STYLE: PathOptions = {
  color: "#3b82f6",
  weight: 3,
  opacity: 0.8,
};

const HOVER_STYLE: PathOptions = {
  color: "#1d4ed8",
  weight: 5,
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

function FitBounds({ region, paths }: PathMapProps) {
  const map = useMap();

  useEffect(() => {
    const source = paths.features.length > 0 ? paths : region.geometry;
    const bounds = L.geoJSON(source).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, region, paths]);

  return null;
}

export default function PathMap({ region, paths }: PathMapProps) {
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
      <FitBounds region={region} paths={paths} />
      {paths.features.length > 0 && (
        <GeoJSON
          data={paths}
          style={() => PATH_STYLE}
          onEachFeature={(feature, layer: Layer) => {
            const props = (feature as PathFeature).properties;
            layer.bindTooltip(buildTooltip(props), { sticky: true });
            layer.on({
              mouseover: (e) => {
                (e.target as L.Path).setStyle(HOVER_STYLE);
              },
              mouseout: (e) => {
                (e.target as L.Path).setStyle(PATH_STYLE);
              },
            });
          }}
        />
      )}
    </MapContainer>
  );
}
