"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  generateRoute,
  toggleRouteWalked,
  saveRoute,
  fetchSavedRoutes,
  loadRoute,
  deleteRoute,
  renameRoute,
  fetchRegionSegments,
} from "@/lib/api";
import SidePanel from "@/components/SidePanel";
import PlaceNameDialog from "@/components/PlaceNameDialog";
import type {
  RegionFeature,
  PathFeatureCollection,
  RouteResponse,
  RouteType,
  RouteListItem,
  SaveRouteRequest,
  Place,
  SegmentFeatureCollection,
  SegmentFeature,
} from "@/types/geo";

const PathMap = dynamic(() => import("@/components/PathMap"), { ssr: false });

function getRouteEndpoints(
  segIds: number[],
  segMap: Map<number, SegmentFeature>,
): { startNode: number | null; endNode: number | null } {
  if (segIds.length === 0) return { startNode: null, endNode: null };
  if (segIds.length === 1) {
    const seg = segMap.get(segIds[0]);
    if (!seg) return { startNode: null, endNode: null };
    return { startNode: seg.properties.source, endNode: seg.properties.target };
  }
  // Walk from first segment to find the start node (the node not shared with the second segment)
  const first = segMap.get(segIds[0]);
  const second = segMap.get(segIds[1]);
  if (!first || !second) return { startNode: null, endNode: null };
  const secondNodes = new Set([second.properties.source, second.properties.target]);
  const startNode = secondNodes.has(first.properties.source)
    ? first.properties.target
    : first.properties.source;

  const last = segMap.get(segIds[segIds.length - 1]);
  const secondToLast = segMap.get(segIds[segIds.length - 2]);
  if (!last || !secondToLast) return { startNode, endNode: null };
  const stlNodes = new Set([secondToLast.properties.source, secondToLast.properties.target]);
  const endNode = stlNodes.has(last.properties.source)
    ? last.properties.target
    : last.properties.source;

  return { startNode, endNode };
}

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
  const [savedRoutes, setSavedRoutes] = useState<RouteListItem[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [segments, setSegments] = useState<SegmentFeatureCollection | null>(null);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);

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
        setActiveRouteId(routeId);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load route",
        );
        setRoute(null);
        setActiveRouteId(null);
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
      if (activeRouteId === routeId) {
        setRoute(null);
        setActiveRouteId(null);
      }
    },
    [regionId, activeRouteId],
  );

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
        setActiveRouteId(null);
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
    setActiveRouteId(null);
    setError(null);
  }, []);

  const handleRenameRoute = useCallback(
    async (routeId: number, name: string) => {
      const updated = await renameRoute(regionId, routeId, { name });
      setSavedRoutes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    },
    [regionId],
  );

  const handleToggleRouteWalked = useCallback(
    async (routeId: number) => {
      try {
        const result = await toggleRouteWalked(regionId, routeId);
        setSavedRoutes((prev) =>
          prev.map((r) => (r.id === result.id ? { ...r, walked: result.walked } : r)),
        );
        onWalkedChange(result.walked_path_ids, result.total_paths);
      } catch {
        // Silently handle
      }
    },
    [regionId, onWalkedChange],
  );

  const handleClearLoadedRoute = useCallback(() => {
    setRoute(null);
    setActiveRouteId(null);
    setError(null);
  }, []);

  // --- Composition: segment lookup map ---
  const segmentMap = useMemo(() => {
    if (!segments) return new Map<number, SegmentFeature>();
    const m = new Map<number, SegmentFeature>();
    for (const f of segments.features) m.set(f.id, f);
    return m;
  }, [segments]);

  // --- Composition: derived values ---
  const composedTotalDistance = useMemo(() => {
    return selectedSegmentIds.reduce((sum, id) => {
      const seg = segmentMap.get(id);
      return sum + (seg?.properties.length ?? 0);
    }, 0);
  }, [selectedSegmentIds, segmentMap]);

  const { startNode: composedStartNode, endNode: composedEndNode } = useMemo(
    () => getRouteEndpoints(selectedSegmentIds, segmentMap),
    [selectedSegmentIds, segmentMap],
  );

  const composedIsLoop = useMemo(() => {
    return selectedSegmentIds.length >= 2 && composedStartNode !== null && composedStartNode === composedEndNode;
  }, [selectedSegmentIds, composedStartNode, composedEndNode]);

  const composedStartPoint = useMemo<[number, number] | null>(() => {
    if (selectedSegmentIds.length === 0) return null;
    const first = segmentMap.get(selectedSegmentIds[0]);
    if (!first) return null;
    const coords = first.geometry.coordinates;
    if (composedStartNode === first.properties.target) {
      return coords[coords.length - 1] as [number, number];
    }
    return coords[0] as [number, number];
  }, [selectedSegmentIds, segmentMap, composedStartNode]);

  const composedEndPoint = useMemo<[number, number] | null>(() => {
    if (selectedSegmentIds.length === 0) return null;
    const last = segmentMap.get(selectedSegmentIds[selectedSegmentIds.length - 1]);
    if (!last) return null;
    const coords = last.geometry.coordinates;
    if (composedEndNode === last.properties.source) {
      return coords[0] as [number, number];
    }
    return coords[coords.length - 1] as [number, number];
  }, [selectedSegmentIds, segmentMap, composedEndNode]);

  // --- Composition handlers ---
  const handleStartComposing = useCallback(async () => {
    setComposing(true);
    setRoute(null);
    setError(null);
    setSelectedSegmentIds([]);
    setComposerError(null);
    try {
      const segs = await fetchRegionSegments(regionId);
      setSegments(segs);
    } catch {
      setComposerError("Failed to load segments.");
    }
  }, [regionId]);

  const handleStopComposing = useCallback(() => {
    setComposing(false);
    setSegments(null);
    setSelectedSegmentIds([]);
    setComposerError(null);
  }, []);

  const handleSegmentClick = useCallback((segmentId: number) => {
    setComposerError(null);
    setSelectedSegmentIds((prev) => {
      // If empty route, accept any segment
      if (prev.length === 0) return [segmentId];

      // If already selected at start, remove from start
      if (prev[0] === segmentId) return prev.slice(1);
      // If already selected at end, remove from end
      if (prev[prev.length - 1] === segmentId) return prev.slice(0, -1);
      // If selected in the middle, ignore
      if (prev.includes(segmentId)) return prev;

      const newSeg = segmentMap.get(segmentId);
      if (!newSeg) return prev;

      const { startNode, endNode } = getRouteEndpoints(prev, segmentMap);
      const newNodes = [newSeg.properties.source, newSeg.properties.target];

      // Check if new segment connects to end
      if (endNode !== null && newNodes.includes(endNode)) {
        return [...prev, segmentId];
      }
      // Check if new segment connects to start
      if (startNode !== null && newNodes.includes(startNode)) {
        return [segmentId, ...prev];
      }

      // Not connected - reject
      setComposerError("Segment is not adjacent to the current route.");
      setTimeout(() => setComposerError(null), 2000);
      return prev;
    });
  }, [segmentMap]);

  const handleUndoLastSegment = useCallback(() => {
    setSelectedSegmentIds((prev) => prev.slice(0, -1));
    setComposerError(null);
  }, []);

  const handleClearAllSegments = useCallback(() => {
    setSelectedSegmentIds([]);
    setComposerError(null);
  }, []);

  const handleSaveComposedRoute = useCallback(
    async (request: SaveRouteRequest) => {
      const fullRequest: SaveRouteRequest = {
        ...request,
        segment_ids: selectedSegmentIds,
        total_distance: composedTotalDistance,
        is_loop: composedIsLoop,
        is_custom: true,
        start_point: composedStartPoint,
        end_point: composedEndPoint,
      };
      const saved = await saveRoute(regionId, fullRequest);
      setSavedRoutes((prev) => [saved, ...prev]);
    },
    [regionId, selectedSegmentIds, composedTotalDistance, composedIsLoop, composedStartPoint, composedEndPoint],
  );

  // When generating/loading a route, exit compose mode
  useEffect(() => {
    if (route) {
      setComposing(false);
      setSegments(null);
      setSelectedSegmentIds([]);
      setComposerError(null);
    }
  }, [route]);

  const displayedPaths = useMemo<PathFeatureCollection>(() => {
    if (!showWalkedOnly) return paths;
    return {
      type: "FeatureCollection",
      features: paths.features.filter((f) => walkedPathIds.has(f.id)),
    };
  }, [paths, showWalkedOnly, walkedPathIds]);

  return (
    <div className="relative h-full">
      <SidePanel
        isFavorite={isFavorite}
        route={route}
        loading={loading}
        error={error}
        onGenerate={handleGenerate}
        onClear={handleClear}
        places={places}
        savedRoutes={savedRoutes}
        onSaveRoute={handleSaveRoute}
        onLoadRoute={handleLoadRoute}
        onDeleteRoute={handleDeleteRoute}
        activeRouteId={activeRouteId}
        onRenameRoute={handleRenameRoute}
        onToggleRouteWalked={handleToggleRouteWalked}
        onClearLoadedRoute={handleClearLoadedRoute}
        composing={composing}
        onStartComposing={handleStartComposing}
        onStopComposing={handleStopComposing}
        selectedSegmentCount={selectedSegmentIds.length}
        composedTotalDistance={composedTotalDistance}
        composedIsLoop={composedIsLoop}
        onUndoLastSegment={handleUndoLastSegment}
        onClearAllSegments={handleClearAllSegments}
        onSaveComposedRoute={handleSaveComposedRoute}
        composerError={composerError}
        paths={displayedPaths.features}
        walkedPathIds={walkedPathIds}
        showWalkedOnly={showWalkedOnly}
        hoveredPathId={hoveredPathId}
        onPathHover={setHoveredPathId}

      />
      <PathMap
        region={region}
        paths={paths}
        route={route}
        showWalkedOnly={showWalkedOnly}
        hoveredPathId={hoveredPathId}
        onPathHover={setHoveredPathId}
        walkedPathIds={walkedPathIds}
        isFavorite={isFavorite}
        places={places}
        showPlaces={showPlaces}
        isCreatingPlace={isCreatingPlace}
        onPlaceCreate={onPlaceCreate}
        onPlaceDelete={onPlaceDeleted}
        composing={composing}
        segments={segments}
        selectedSegmentIds={selectedSegmentIds}
        onSegmentClick={handleSegmentClick}
        composerError={composerError}
        composedStartPoint={composedStartPoint}
        composedEndPoint={composedEndPoint}
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
