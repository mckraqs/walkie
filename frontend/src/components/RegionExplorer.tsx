"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  generateRoute,
  saveRoute,
  fetchSavedRoutes,
  loadRoute,
  deleteRoute,
  renameRoute,
  fetchRegionSegments,
  matchGeometry,
  fetchWalks,
  createWalk,
  fetchWalk,
  deleteWalk as apiDeleteWalk,
  renameWalk as apiRenameWalk,
} from "@/lib/api";
import { getRouteEndpoints } from "@/lib/geo";
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
  MatchGeometryResponse,
  WalkListItem,
} from "@/types/geo";

export interface TempPoint {
  coords: [number, number];
}

const PathMap = dynamic(() => import("@/components/PathMap"), { ssr: false });

interface RegionExplorerProps {
  regionId: string;
  region: RegionFeature;
  paths: PathFeatureCollection;
  isFavorite: boolean;
  walkedPathIds: Set<number>;
  partiallyWalkedPathIds: Set<number>;
  onWalkedChange: (walkedPathIds: number[], partiallyWalkedPathIds: number[], totalPaths: number, walkedCount: number) => void;
  places: Place[];
  placeCreationMode: "pin" | "search" | null;
  pendingPlaceLocation: [number, number] | null;
  onPlaceCreate: (location: [number, number]) => void;
  onPlaceCreated: (place: Place) => void;
  onPlaceDeleted: () => void;
  onCancelPlaceCreation: () => void;
  onSetPlaceCreationMode: (mode: "pin" | "search" | null) => void;
  onDeletePlace: (placeId: number) => Promise<void>;
  onRenamePlace: (placeId: number, newName: string) => Promise<void>;
}

export default function RegionExplorer({
  regionId,
  region,
  paths,
  isFavorite,
  walkedPathIds,
  partiallyWalkedPathIds,
  onWalkedChange,
  places,
  placeCreationMode,
  pendingPlaceLocation,
  onPlaceCreate,
  onPlaceCreated,
  onPlaceDeleted,
  onCancelPlaceCreation,
  onSetPlaceCreationMode,
  onDeletePlace,
  onRenamePlace,
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
  const [pendingDisconnectedSegment, setPendingDisconnectedSegment] = useState<number | null>(null);

  // Draw walk state
  const [drawingWalk, setDrawingWalk] = useState(false);
  const [drawnVertices, setDrawnVertices] = useState<[number, number][]>([]);
  const [drawMatchResult, setDrawMatchResult] = useState<MatchGeometryResponse | null>(null);
  const [drawMatchLoading, setDrawMatchLoading] = useState(false);
  const drawMatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawAbortRef = useRef<AbortController | null>(null);

  // Walk history state
  const [walks, setWalks] = useState<WalkListItem[]>([]);
  const [activeWalkId, setActiveWalkId] = useState<number | null>(null);
  const [activeWalkGeometry, setActiveWalkGeometry] = useState<{ type: "LineString"; coordinates: [number, number][] } | null>(null);
  const [drawingForWalk, setDrawingForWalk] = useState(false);

  // Route hover preview state
  const [hoveredRouteId, setHoveredRouteId] = useState<number | null>(null);
  const [previewRoute, setPreviewRoute] = useState<RouteResponse | null>(null);
  const routePreviewCacheRef = useRef<Map<number, RouteResponse>>(new Map());
  const hoverAbortRef = useRef<AbortController | null>(null);

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

  // Place focus state
  const [focusPlaceLocation, setFocusPlaceLocation] = useState<[number, number] | null>(null);
  const [focusPlaceKey, setFocusPlaceKey] = useState(0);
  const handlePlaceClick = useCallback((location: [number, number]) => {
    setFocusPlaceLocation(location);
    setFocusPlaceKey((k) => k + 1);
  }, []);

  // Path focus state
  const [focusPathId, setFocusPathId] = useState<number | null>(null);
  const [focusPathKey, setFocusPathKey] = useState(0);
  const handlePathClick = useCallback((pathId: number) => {
    setFocusPathId(pathId);
    setFocusPathKey((k) => k + 1);
  }, []);

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
      .catch(() => showToast("Failed to load saved routes"));
    fetchWalks(regionId)
      .then(setWalks)
      .catch(() => showToast("Failed to load walks"));
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
        routePreviewCacheRef.current.set(routeId, result);
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

  const handleClearLoadedRoute = useCallback(() => {
    setRoute(null);
    setActiveRouteId(null);
    setError(null);
    setPreviewRoute(null);
    setHoveredRouteId(null);
  }, []);

  const handleRouteHover = useCallback(
    (routeId: number | null) => {
      setHoveredRouteId(routeId);

      // Cancel any in-flight preview fetch
      hoverAbortRef.current?.abort();
      hoverAbortRef.current = null;

      if (routeId === null || routeId === activeRouteId) {
        setPreviewRoute(null);
        return;
      }

      // Check cache first
      const cached = routePreviewCacheRef.current.get(routeId);
      if (cached) {
        setPreviewRoute(cached);
        return;
      }

      // Fetch route data for preview
      const controller = new AbortController();
      hoverAbortRef.current = controller;
      loadRoute(regionId, routeId)
        .then((result) => {
          if (!controller.signal.aborted) {
            routePreviewCacheRef.current.set(routeId, result);
            setPreviewRoute(result);
          }
        })
        .catch(() => {
          // Silently ignore fetch errors on hover
        });
    },
    [regionId, activeRouteId],
  );

  // --- Point picking handlers ---
  const handlePickPointOnMap = useCallback((which: "start" | "end") => {
    setPickingPoint(which);
    // Mutual exclusion: exit compose mode and place creation mode
    setComposing(false);
    setSegments(null);
    setSelectedSegmentIds([]);
    setComposerError(null);
    onSetPlaceCreationMode(null);
  }, [onSetPlaceCreationMode]);

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

  // When entering compose mode, clear picking mode
  // When entering place creation mode, clear picking mode
  useEffect(() => {
    if (placeCreationMode === "pin") {
      setPickingPoint(null);
    }
  }, [placeCreationMode]);

  // --- Draw walk handlers ---
  const handleStartDrawing = useCallback(() => {
    setDrawingWalk(true);
    setDrawnVertices([]);
    setDrawMatchResult(null);
    setRoute(null);
    setActiveRouteId(null);
    setError(null);
    setComposing(false);
    setSegments(null);
    setSelectedSegmentIds([]);
    setPickingPoint(null);
  }, []);

  const handleStopDrawing = useCallback(() => {
    setDrawingWalk(false);
    setDrawingForWalk(false);
    setDrawnVertices([]);
    setDrawMatchResult(null);
    setDrawMatchLoading(false);
    if (drawMatchTimerRef.current) clearTimeout(drawMatchTimerRef.current);
    drawAbortRef.current?.abort();
  }, []);

  const triggerMatch = useCallback(
    (vertices: [number, number][]) => {
      if (vertices.length < 2) {
        setDrawMatchResult(null);
        return;
      }
      if (drawMatchTimerRef.current) clearTimeout(drawMatchTimerRef.current);
      drawAbortRef.current?.abort();

      drawMatchTimerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        drawAbortRef.current = controller;
        setDrawMatchLoading(true);
        try {
          const result = await matchGeometry(regionId, {
            geometry: {
              type: "LineString",
              coordinates: vertices,
            },
          });
          if (!controller.signal.aborted) {
            setDrawMatchResult(result);
          }
        } catch {
          // Silently ignore match errors during drawing
        } finally {
          if (!controller.signal.aborted) {
            setDrawMatchLoading(false);
          }
        }
      }, 300);
    },
    [regionId],
  );

  const handleDrawVertex = useCallback(
    (coords: [number, number]) => {
      setDrawnVertices((prev) => {
        const next = [...prev, coords];
        triggerMatch(next);
        return next;
      });
    },
    [triggerMatch],
  );

  const handleDrawUndo = useCallback(() => {
    setDrawnVertices((prev) => {
      const next = prev.slice(0, -1);
      triggerMatch(next);
      return next;
    });
  }, [triggerMatch]);

  const handleSaveDrawnWalk = useCallback(
    async (name: string, walkedAt?: string) => {
      if (drawingForWalk) {
        // Create a Walk record with drawn geometry
        const dateStr = walkedAt ?? new Date().toISOString().slice(0, 10);
        const result = await createWalk(regionId, {
          name,
          walked_at: dateStr,
          geometry: {
            type: "LineString",
            coordinates: drawnVertices,
          },
        });
        setWalks((prev) => [result, ...prev]);
        onWalkedChange(result.walked_path_ids, result.partially_walked_path_ids, result.total_paths, result.walked_count);
        setDrawingForWalk(false);
      } else {
        // Create a Route record (original behavior)
        const request: SaveRouteRequest = {
          name,
          segment_ids: drawMatchResult?.matched_segment_ids ?? [],
          total_distance: drawMatchResult?.total_distance ?? 0,
          is_loop: false,
          is_custom: true,
          start_point: null,
          end_point: null,
          custom_geometry: {
            type: "LineString",
            coordinates: drawnVertices,
          },
        };
        const saved = await saveRoute(regionId, request);
        setSavedRoutes((prev) => [saved, ...prev]);
      }
      handleStopDrawing();
    },
    [regionId, drawMatchResult, drawnVertices, onWalkedChange, handleStopDrawing, drawingForWalk],
  );

  // When entering draw mode, exit other modes
  useEffect(() => {
    if (drawingWalk) {
      setComposing(false);
      setSegments(null);
      setSelectedSegmentIds([]);
      setComposerError(null);
      setPickingPoint(null);
    }
  }, [drawingWalk]);

  // --- Walk handlers ---
  const handleLoadWalk = useCallback(
    async (walkId: number) => {
      if (activeWalkId === walkId) {
        setActiveWalkId(null);
        setActiveWalkGeometry(null);
        return;
      }
      try {
        const detail = await fetchWalk(regionId, walkId);
        setActiveWalkId(detail.id);
        setActiveWalkGeometry(detail.geometry);
      } catch {
        showToast("Failed to load walk");
      }
    },
    [regionId, activeWalkId, showToast],
  );

  const handleDeleteWalk = useCallback(
    async (walkId: number) => {
      await apiDeleteWalk(regionId, walkId);
      setWalks((prev) => prev.filter((w) => w.id !== walkId));
      if (activeWalkId === walkId) {
        setActiveWalkId(null);
        setActiveWalkGeometry(null);
      }
      // Refresh walked paths after deletion
      fetchWalks(regionId).catch(() => {});
      // Re-fetch walked path status
      const { fetchWalkedPaths } = await import("@/lib/api");
      try {
        const data = await fetchWalkedPaths(regionId);
        onWalkedChange(data.walked_path_ids, data.partially_walked_path_ids, data.total_paths, data.walked_count);
      } catch {
        // Silently handle
      }
    },
    [regionId, activeWalkId, onWalkedChange],
  );

  const handleRenameWalk = useCallback(
    async (walkId: number, name: string) => {
      const updated = await apiRenameWalk(regionId, walkId, name);
      setWalks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    },
    [regionId],
  );

  const handleAddWalkFromRoute = useCallback(
    async (data: { route_id: number; name: string; walked_at: string }) => {
      try {
        const result = await createWalk(regionId, {
          name: data.name,
          walked_at: data.walked_at,
          route_id: data.route_id,
        });
        setWalks((prev) => [result, ...prev]);
        onWalkedChange(result.walked_path_ids, result.partially_walked_path_ids, result.total_paths, result.walked_count);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to create walk");
      }
    },
    [regionId, onWalkedChange, showToast],
  );

  const handleClearActiveWalk = useCallback(() => {
    setActiveWalkId(null);
    setActiveWalkGeometry(null);
  }, []);

  const handleAddWalkByDrawing = useCallback(() => {
    setDrawingForWalk(true);
    handleStartDrawing();
  }, [handleStartDrawing]);

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

      // Handle gaps at route boundaries: when the boundary segment is
      // disconnected from its neighbor, allow connecting to either of its nodes.
      if (prev.length >= 2) {
        const lastSeg = segmentMap.get(prev[prev.length - 1]);
        const prevToLast = segmentMap.get(prev[prev.length - 2]);
        if (lastSeg && prevToLast) {
          const lastNodes = [lastSeg.properties.source, lastSeg.properties.target];
          const prevToLastNodes = [prevToLast.properties.source, prevToLast.properties.target];
          const hasEndGap = !lastNodes.some((n) => prevToLastNodes.includes(n));
          if (hasEndGap && lastNodes.some((n) => newNodes.includes(n))) {
            return [...prev, segmentId];
          }
        }

        const firstSeg = segmentMap.get(prev[0]);
        const secondSeg = segmentMap.get(prev[1]);
        if (firstSeg && secondSeg) {
          const firstNodes = [firstSeg.properties.source, firstSeg.properties.target];
          const secondNodes = [secondSeg.properties.source, secondSeg.properties.target];
          const hasStartGap = !firstNodes.some((n) => secondNodes.includes(n));
          if (hasStartGap && firstNodes.some((n) => newNodes.includes(n))) {
            return [segmentId, ...prev];
          }
        }
      }

      // Topology check failed - ask user for confirmation
      setPendingDisconnectedSegment(segmentId);
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

  const handleConfirmDisconnected = useCallback(() => {
    if (pendingDisconnectedSegment === null) return;
    setSelectedSegmentIds((prev) => [...prev, pendingDisconnectedSegment]);
    setPendingDisconnectedSegment(null);
  }, [pendingDisconnectedSegment]);

  const handleCancelDisconnected = useCallback(() => {
    setPendingDisconnectedSegment(null);
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
        onClearLoadedRoute={handleClearLoadedRoute}
        onRouteHover={handleRouteHover}
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
        drawingWalk={drawingWalk}
        onStartDrawing={handleStartDrawing}
        onStopDrawing={handleStopDrawing}
        drawnVertexCount={drawnVertices.length}
        drawMatchResult={drawMatchResult}
        drawMatchLoading={drawMatchLoading}
        onSaveDrawnWalk={handleSaveDrawnWalk}
        onDrawUndo={handleDrawUndo}
        paths={paths.features}
        walkedPathIds={walkedPathIds}
        hoveredPathId={hoveredPathId}
        onPathHover={setHoveredPathId}
        onPathClick={handlePathClick}
        startTempPoint={startTempPoint}
        endTempPoint={endTempPoint}
        onPickPointOnMap={handlePickPointOnMap}
        onClearTempPoint={handleClearTempPoint}
        autoSelectPlace={autoSelectPlace}
        placeCreationMode={placeCreationMode}
        onSetPlaceCreationMode={onSetPlaceCreationMode}
        onDeletePlace={onDeletePlace}
        onRenamePlace={onRenamePlace}
        hoveredPlaceId={hoveredPlaceId}
        onPlaceHover={setHoveredPlaceId}
        onPlaceClick={handlePlaceClick}
        regionBbox={regionBbox}
        regionCenter={regionCenter}
        onSearchResultHover={handleSearchResultHover}
        onSearchResultSelect={handleSearchResultSelect}
        onSaveSearchResult={handleSaveSearchResult}
        walks={walks}
        activeWalkId={activeWalkId}
        onLoadWalk={handleLoadWalk}
        onDeleteWalk={handleDeleteWalk}
        onRenameWalk={handleRenameWalk}
        onAddWalkFromRoute={handleAddWalkFromRoute}
        onAddWalkByDrawing={handleAddWalkByDrawing}
        drawingForWalk={drawingForWalk}
        onClearActiveWalk={handleClearActiveWalk}
      />
      <PathMap
        region={region}
        paths={paths}
        route={route}
        hoveredPathId={hoveredPathId}
        onPathHover={setHoveredPathId}
        walkedPathIds={walkedPathIds}
        partiallyWalkedPathIds={partiallyWalkedPathIds}
        isFavorite={isFavorite}
        places={places}
        isCreatingPlace={placeCreationMode === "pin"}
        onPlaceCreate={onPlaceCreate}
        focusPlaceLocation={focusPlaceLocation}
        focusPlaceKey={focusPlaceKey}
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
        focusPathId={focusPathId}
        focusPathKey={focusPathKey}
        hoveredRouteId={hoveredRouteId}
        previewRoute={previewRoute}
        drawingWalk={drawingWalk}
        drawnVertices={drawnVertices}
        onDrawVertex={handleDrawVertex}
        drawMatchedSegments={drawMatchResult?.segments ?? null}
        activeWalkGeometry={activeWalkGeometry}
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
      {pendingDisconnectedSegment !== null && (
        <ConfirmDialog
          title="Segments not connected"
          message="The selected segment does not connect to the current route. Add it anyway?"
          confirmLabel="Add Segment"
          cancelLabel="Cancel"
          variant="default"
          onConfirm={handleConfirmDisconnected}
          onCancel={handleCancelDisconnected}
        />
      )}
    </div>
  );
}
