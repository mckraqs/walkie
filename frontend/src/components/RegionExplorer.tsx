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
import {
  haversineDistance,
  getEndpointCoords,
  getRouteEndpoints,
} from "@/lib/geo";
import SidePanel from "@/components/SidePanel";
import PlaceNameDialog from "@/components/PlaceNameDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/contexts/ToastContext";
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
  GeocodingResult,
} from "@/types/geo";

export interface TempPoint {
  coords: [number, number];
}

const PathMap = dynamic(() => import("@/components/PathMap"), { ssr: false });

const PROXIMITY_TOLERANCE_M = 100;

interface RegionExplorerProps {
  regionId: string;
  region: RegionFeature;
  paths: PathFeatureCollection;
  isFavorite: boolean;
  walkedPathIds: Set<number>;
  showWalkedOnly: boolean;
  onWalkedChange: (walkedPathIds: number[], totalPaths: number, walkedCount: number) => void;
  places: Place[];
  showPlaces: boolean;
  isCreatingPlace: boolean;
  pendingPlaceLocation: [number, number] | null;
  onPlaceCreate: (location: [number, number]) => void;
  onPlaceCreated: (place: Place) => void;
  onPlaceDeleted: () => void;
  onCancelPlaceCreation: () => void;
  onExitPlaceCreation: () => void;
  onToggleShowPlaces: () => void;
  onToggleCreatingPlace: () => void;
  onDeletePlace: (placeId: number) => Promise<void>;
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
  onExitPlaceCreation,
  onToggleShowPlaces,
  onToggleCreatingPlace,
  onDeletePlace,
}: RegionExplorerProps) {
  const { showToast } = useToast();
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPathId, setHoveredPathId] = useState<number | null>(null);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<number | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<RouteListItem[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [segments, setSegments] = useState<SegmentFeatureCollection | null>(null);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);

  // Point picking state
  const [pickingPoint, setPickingPoint] = useState<"start" | "end" | null>(null);
  const [startTempPoint, setStartTempPoint] = useState<TempPoint | null>(null);
  const [endTempPoint, setEndTempPoint] = useState<TempPoint | null>(null);
  const [pendingSavePointLocation, setPendingSavePointLocation] = useState<[number, number] | null>(null);
  const [pendingSavePointTarget, setPendingSavePointTarget] = useState<"start" | "end" | null>(null);
  const [autoSelectPlace, setAutoSelectPlace] = useState<{ which: "start" | "end"; placeId: number } | null>(null);

  // Search state
  const [searchHighlight, setSearchHighlight] = useState<[number, number] | null>(null);
  const [pendingPlaceName, setPendingPlaceName] = useState<string | null>(null);

  const regionBbox = useMemo<[number, number, number, number] | null>(() => {
    if (!region?.geometry) return null;
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const polygon of region.geometry.coordinates) {
      for (const ring of polygon) {
        for (const coord of ring) {
          const [lon, lat] = coord as [number, number];
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
    return [minLon, minLat, maxLon, maxLat];
  }, [region]);

  const regionCenter = useMemo<[number, number] | null>(() => {
    if (!regionBbox) return null;
    return [(regionBbox[0] + regionBbox[2]) / 2, (regionBbox[1] + regionBbox[3]) / 2];
  }, [regionBbox]);

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
    async (
      distanceKm: number,
      routeType: RouteType,
      startPlaceId: number | null,
      endPlaceId: number | null,
      startCoords?: [number, number] | null,
      endCoords?: [number, number] | null,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const result = await generateRoute(regionId, {
          target_distance_km: distanceKm,
          route_type: routeType,
          start_place_id: startPlaceId,
          end_place_id: endPlaceId,
          start_coords: startCoords ?? null,
          end_coords: endCoords ?? null,
        });
        setRoute(result);
        setActiveRouteId(null);
        if (result.used_shortest_path) {
          showToast(
            "The shortest path was used because the requested distance is shorter than the minimum route between selected points.",
          );
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to generate route",
        );
        setRoute(null);
      } finally {
        setLoading(false);
      }
    },
    [regionId, showToast],
  );

  const handleClear = useCallback(() => {
    setRoute(null);
    setActiveRouteId(null);
    setError(null);
    setStartTempPoint(null);
    setEndTempPoint(null);
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
        onWalkedChange(result.walked_path_ids, result.total_paths, result.walked_count);
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

  // --- Point picking handlers ---
  const handlePickPointOnMap = useCallback((which: "start" | "end") => {
    setPickingPoint(which);
    // Mutual exclusion: exit compose mode and place creation mode
    setComposing(false);
    setSegments(null);
    setSelectedSegmentIds([]);
    setComposerError(null);
    onExitPlaceCreation();
  }, [onExitPlaceCreation]);

  const handleMapPickPoint = useCallback((coords: [number, number]) => {
    setPendingSavePointLocation(coords);
    setPendingSavePointTarget(pickingPoint);
    setPickingPoint(null);
  }, [pickingPoint]);

  const handleUseOnce = useCallback(() => {
    if (!pendingSavePointLocation || !pendingSavePointTarget) return;
    const tp: TempPoint = { coords: pendingSavePointLocation };
    if (pendingSavePointTarget === "start") {
      setStartTempPoint(tp);
    } else {
      setEndTempPoint(tp);
    }
    setPendingSavePointLocation(null);
    setPendingSavePointTarget(null);
  }, [pendingSavePointLocation, pendingSavePointTarget]);

  const handleSaveAsPlace = useCallback(() => {
    // Trigger the PlaceNameDialog flow by calling onPlaceCreate with the pending coords
    if (!pendingSavePointLocation) return;
    onPlaceCreate(pendingSavePointLocation);
    // Keep pendingSavePointTarget so we know which field to auto-select after save
    setPendingSavePointLocation(null);
  }, [pendingSavePointLocation, onPlaceCreate]);

  const handleClearTempPoint = useCallback((which: "start" | "end") => {
    if (which === "start") {
      setStartTempPoint(null);
    } else {
      setEndTempPoint(null);
    }
  }, []);

  // --- Search result handlers ---
  const handleSearchResultHover = useCallback((location: [number, number] | null) => {
    setSearchHighlight(location);
  }, []);

  const handleSearchResultSelect = useCallback((result: GeocodingResult) => {
    setSearchHighlight(result.location);
  }, []);

  const handleSaveSearchResult = useCallback((name: string, location: [number, number]) => {
    setPendingPlaceName(name);
    onPlaceCreate(location);
  }, [onPlaceCreate]);

  const handleSearchUseAsRoutePoint = useCallback((which: "start" | "end", coords: [number, number]) => {
    const tp: TempPoint = { coords };
    if (which === "start") {
      setStartTempPoint(tp);
    } else {
      setEndTempPoint(tp);
    }
  }, []);

  // When entering compose mode, clear picking mode
  // When entering place creation mode, clear picking mode
  useEffect(() => {
    if (isCreatingPlace) {
      setPickingPoint(null);
    }
  }, [isCreatingPlace]);

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
    setPickingPoint(null);
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

      const newSeg = segmentMap.get(segmentId);
      if (!newSeg) return prev;

      const { startNode, endNode } = getRouteEndpoints(prev, segmentMap);
      const newNodes = [newSeg.properties.source, newSeg.properties.target];

      // Check if new segment connects to end (topology)
      if (endNode !== null && newNodes.includes(endNode)) {
        return [...prev, segmentId];
      }
      // Check if new segment connects to start (topology)
      if (startNode !== null && newNodes.includes(startNode)) {
        return [segmentId, ...prev];
      }

      // Topology check failed -- fall back to proximity check
      const { start: routeStart, end: routeEnd } = getEndpointCoords(prev, segmentMap);
      const newCoords = newSeg.geometry.coordinates;
      const newSource = newCoords[0] as [number, number];
      const newTarget = newCoords[newCoords.length - 1] as [number, number];

      // Check if new segment is within proximity of route end (append)
      if (routeEnd) {
        const dEndSrc = haversineDistance(routeEnd, newSource);
        const dEndTgt = haversineDistance(routeEnd, newTarget);
        if (dEndSrc <= PROXIMITY_TOLERANCE_M || dEndTgt <= PROXIMITY_TOLERANCE_M) {
          return [...prev, segmentId];
        }
      }

      // Check if new segment is within proximity of route start (prepend)
      if (routeStart) {
        const dStartSrc = haversineDistance(routeStart, newSource);
        const dStartTgt = haversineDistance(routeStart, newTarget);
        if (dStartSrc <= PROXIMITY_TOLERANCE_M || dStartTgt <= PROXIMITY_TOLERANCE_M) {
          return [segmentId, ...prev];
        }
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
        startTempPoint={startTempPoint}
        endTempPoint={endTempPoint}
        onPickPointOnMap={handlePickPointOnMap}
        onClearTempPoint={handleClearTempPoint}
        autoSelectPlace={autoSelectPlace}
        showPlaces={showPlaces}
        onToggleShowPlaces={onToggleShowPlaces}
        isCreatingPlace={isCreatingPlace}
        onToggleCreatingPlace={onToggleCreatingPlace}
        onDeletePlace={onDeletePlace}
        hoveredPlaceId={hoveredPlaceId}
        onPlaceHover={setHoveredPlaceId}
        regionBbox={regionBbox}
        regionCenter={regionCenter}
        onSearchResultHover={handleSearchResultHover}
        onSearchResultSelect={handleSearchResultSelect}
        onSaveSearchResult={handleSaveSearchResult}
        onUseAsRoutePoint={handleSearchUseAsRoutePoint}
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
        pickingPoint={pickingPoint}
        onPickPoint={handleMapPickPoint}
        hoveredPlaceId={hoveredPlaceId}
        onPlaceHover={setHoveredPlaceId}
        startTempPoint={startTempPoint}
        endTempPoint={endTempPoint}
        searchHighlight={searchHighlight}
      />
      {pendingPlaceLocation && (
        <PlaceNameDialog
          regionId={regionId}
          location={pendingPlaceLocation}
          initialName={pendingPlaceName ?? undefined}
          onCreated={(place: Place) => {
            // If this was triggered from a "Save as Place" flow, auto-select the place
            if (pendingSavePointTarget) {
              setAutoSelectPlace({ which: pendingSavePointTarget, placeId: place.id });
              if (pendingSavePointTarget === "start") {
                setStartTempPoint(null);
              } else {
                setEndTempPoint(null);
              }
              setPendingSavePointTarget(null);
            }
            setPendingPlaceName(null);
            onPlaceCreated(place);
          }}
          onCancel={() => {
            setPendingSavePointTarget(null);
            setPendingPlaceName(null);
            onCancelPlaceCreation();
          }}
        />
      )}
      {pendingSavePointLocation && (
        <ConfirmDialog
          title="Save as place?"
          message="Would you like to save this point as a named place, or use it once for route generation?"
          confirmLabel="Save as Place"
          cancelLabel="Use Once"
          variant="default"
          onConfirm={handleSaveAsPlace}
          onCancel={handleUseOnce}
        />
      )}
    </div>
  );
}
