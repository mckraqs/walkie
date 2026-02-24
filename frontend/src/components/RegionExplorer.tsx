"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { generateRoute, togglePathWalk } from "@/lib/api";
import RoutePlanner from "@/components/RoutePlanner";
import PathList from "@/components/PathList";
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
  walkedPathIds: Set<number>;
  showWalkedOnly: boolean;
  onWalkedChange: (walkedPathIds: number[], totalPaths: number) => void;
}

export default function RegionExplorer({
  regionId,
  region,
  paths,
  isFavorite,
  walkedPathIds,
  showWalkedOnly,
  onWalkedChange,
}: RegionExplorerProps) {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPathId, setHoveredPathId] = useState<number | null>(null);

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

  const handleToggleWalk = useCallback(
    async (pathId: number) => {
      try {
        const response = await togglePathWalk(regionId, pathId);
        onWalkedChange(response.walked_path_ids, response.total_paths);
      } catch {
        // Silently handle
      }
    },
    [regionId, onWalkedChange],
  );

  const displayedPaths = useMemo<PathFeatureCollection>(() => {
    if (!showWalkedOnly) return paths;
    return {
      type: "FeatureCollection",
      features: paths.features.filter((f) => walkedPathIds.has(f.id)),
    };
  }, [paths, showWalkedOnly, walkedPathIds]);

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
      <PathList
        paths={displayedPaths}
        walkedPathIds={walkedPathIds}
        isFavorite={isFavorite}
        showWalkedOnly={showWalkedOnly}
        hoveredPathId={hoveredPathId}
        onPathHover={setHoveredPathId}
        onToggleWalk={handleToggleWalk}
      />
      <PathMap
        region={region}
        paths={displayedPaths}
        route={route}
        hoveredPathId={hoveredPathId}
        onPathHover={setHoveredPathId}
        walkedPathIds={walkedPathIds}
        onToggleWalk={handleToggleWalk}
        isFavorite={isFavorite}
      />
    </div>
  );
}
