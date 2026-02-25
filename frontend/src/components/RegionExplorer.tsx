"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  generateRoute,
  togglePathWalk,
  saveRoute,
  fetchSavedRoutes,
  loadRoute,
  deleteRoute,
} from "@/lib/api";
import RoutePlanner from "@/components/RoutePlanner";
import PlaceNameDialog from "@/components/PlaceNameDialog";
import PathList from "@/components/PathList";
import type {
  RegionFeature,
  PathFeatureCollection,
  RouteResponse,
  RouteType,
  RouteListItem,
  SaveRouteRequest,
  Place,
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
  places: Place[];
  showPlaces: boolean;
  isCreatingPlace: boolean;
  pendingPlaceLocation: [number, number] | null;
  onPlaceCreate: (location: [number, number]) => void;
  onPlaceCreated: () => void;
  onPlaceDeleted: () => void;
  onCancelPlaceCreation: () => void;
}

export default function RegionExplorer({
  regionId,
  region,
  paths,
  isFavorite,
  walkedPathIds,
  showWalkedOnly,
  onWalkedChange,
  places,
  showPlaces,
  isCreatingPlace,
  pendingPlaceLocation,
  onPlaceCreate,
  onPlaceCreated,
  onPlaceDeleted,
  onCancelPlaceCreation,
}: RegionExplorerProps) {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPathId, setHoveredPathId] = useState<number | null>(null);
  const [focusedPathId, setFocusedPathId] = useState<number | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<number | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<RouteListItem[]>([]);

  useEffect(() => {
    if (!isFavorite) return;
    fetchSavedRoutes(regionId)
      .then(setSavedRoutes)
      .catch(() => {});
  }, [regionId, isFavorite]);

  const handleSaveRoute = useCallback(
    async (request: SaveRouteRequest) => {
      const saved = await saveRoute(regionId, request);
      setSavedRoutes((prev) => [saved, ...prev]);
    },
    [regionId],
  );

  const handleLoadRoute = useCallback(
    async (routeId: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await loadRoute(regionId, routeId);
        setRoute(result);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load route",
        );
        setRoute(null);
      } finally {
        setLoading(false);
      }
    },
    [regionId],
  );

  const handleDeleteRoute = useCallback(
    async (routeId: number) => {
      await deleteRoute(regionId, routeId);
      setSavedRoutes((prev) => prev.filter((r) => r.id !== routeId));
    },
    [regionId],
  );

  const handleFocusHandled = useCallback(() => setFocusedPathId(null), []);

  const handlePathClickFromList = useCallback((pathId: number) => {
    setSelectedPathId(pathId);
    setFocusedPathId(pathId);
  }, []);

  const handleDeselectPath = useCallback(() => setSelectedPathId(null), []);

  const handleGenerate = useCallback(
    async (distanceKm: number, routeType: RouteType, startPlaceId: number | null, endPlaceId: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const result = await generateRoute(regionId, {
          target_distance_km: distanceKm,
          route_type: routeType,
          start_place_id: startPlaceId,
          end_place_id: endPlaceId,
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
        places={places}
        savedRoutes={savedRoutes}
        onSaveRoute={handleSaveRoute}
        onLoadRoute={handleLoadRoute}
        onDeleteRoute={handleDeleteRoute}
      />
      <PathList
        paths={displayedPaths}
        walkedPathIds={walkedPathIds}
        isFavorite={isFavorite}
        showWalkedOnly={showWalkedOnly}
        hoveredPathId={hoveredPathId}
        selectedPathId={selectedPathId}
        onPathHover={setHoveredPathId}
        onPathClick={handlePathClickFromList}
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
        focusedPathId={focusedPathId}
        onFocusHandled={handleFocusHandled}
        selectedPathId={selectedPathId}
        onPathSelect={setSelectedPathId}
        onDeselectPath={handleDeselectPath}
        places={places}
        showPlaces={showPlaces}
        isCreatingPlace={isCreatingPlace}
        onPlaceCreate={onPlaceCreate}
        onPlaceDelete={onPlaceDeleted}
      />
      {pendingPlaceLocation && (
        <PlaceNameDialog
          regionId={regionId}
          location={pendingPlaceLocation}
          onCreated={onPlaceCreated}
          onCancel={onCancelPlaceCreation}
        />
      )}
    </div>
  );
}
