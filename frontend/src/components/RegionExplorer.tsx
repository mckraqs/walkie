"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { generateRoute } from "@/lib/api";
import RoutePlanner from "@/components/RoutePlanner";
import type {
  RegionFeature,
  PathFeatureCollection,
  RouteResponse,
  RouteType,
} from "@/types/geo";

const PathMap = dynamic(() => import("@/components/PathMap"), { ssr: false });

interface RegionExplorerProps {
  regionId: string;
  region: RegionFeature;
  paths: PathFeatureCollection;
  isFavorite: boolean;
}

export default function RegionExplorer({
  regionId,
  region,
  paths,
  isFavorite,
}: RegionExplorerProps) {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(
    async (distanceKm: number, routeType: RouteType) => {
      setLoading(true);
      setError(null);
      try {
        const result = await generateRoute(regionId, {
          target_distance_km: distanceKm,
          route_type: routeType,
        });
        setRoute(result);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to generate route",
        );
        setRoute(null);
      } finally {
        setLoading(false);
      }
    },
    [regionId],
  );

  const handleClear = useCallback(() => {
    setRoute(null);
    setError(null);
  }, []);

  return (
    <div className="relative h-full">
      <RoutePlanner
        route={route}
        loading={loading}
        error={error}
        onGenerate={handleGenerate}
        onClear={handleClear}
        isFavorite={isFavorite}
      />
      <PathMap region={region} paths={paths} route={route} />
    </div>
  );
}
