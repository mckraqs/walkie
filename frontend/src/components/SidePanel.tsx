"use client";

import { useEffect, useState } from "react";
import SavedRoutes from "@/components/SavedRoutes";
import RoutePlanner from "@/components/RoutePlanner";
import RouteComposer from "@/components/RouteComposer";
import PathList from "@/components/PathList";
import type { TempPoint } from "@/components/RegionExplorer";
import type {
  RouteResponse,
  RouteType,
  RouteListItem,
  SaveRouteRequest,
  Place,
  PathFeature,
} from "@/types/geo";

const HEADER = "2.75rem";

interface SidePanelProps {
  isFavorite: boolean;
  route: RouteResponse | null;
  loading: boolean;
  error: string | null;
  onGenerate: (distanceKm: number, routeType: RouteType, startPlaceId: number | null, endPlaceId: number | null, startCoords?: [number, number] | null, endCoords?: [number, number] | null) => void;
  onClear: () => void;
  places?: Place[];
  savedRoutes: RouteListItem[];
  onSaveRoute: (request: SaveRouteRequest) => Promise<void>;
  onLoadRoute: (routeId: number) => void;
  onDeleteRoute: (routeId: number) => Promise<void>;
  activeRouteId: number | null;
  onRenameRoute: (routeId: number, name: string) => Promise<void>;
  onToggleRouteWalked: (routeId: number) => void;
  onClearLoadedRoute: () => void;
  composing: boolean;
  onStartComposing: () => void;
  onStopComposing: () => void;
  selectedSegmentCount: number;
  composedTotalDistance: number;
  composedIsLoop: boolean;
  onUndoLastSegment: () => void;
  onClearAllSegments: () => void;
  onSaveComposedRoute: (request: SaveRouteRequest) => Promise<void>;
  composerError: string | null;
  paths: PathFeature[];
  walkedPathIds: Set<number>;
  showWalkedOnly: boolean;
  hoveredPathId: number | null;
  onPathHover: (pathId: number | null) => void;
  startTempPoint: TempPoint | null;
  endTempPoint: TempPoint | null;
  onPickPointOnMap: (which: "start" | "end") => void;
  onClearTempPoint: (which: "start" | "end") => void;
  autoSelectPlace: { which: "start" | "end"; placeId: number } | null;
}

export function computeSectionHeight(
  savedRoutesCollapsed: boolean,
  routePlannerCollapsed: boolean,
  composerCollapsed: boolean,
  pathListCollapsed: boolean,
  isCollapsed: boolean,
): string {
  const sections = [savedRoutesCollapsed, routePlannerCollapsed, composerCollapsed, pathListCollapsed];
  const collapsedCount = sections.filter(Boolean).length;
  const expandedCount = 4 - collapsedCount;

  if (isCollapsed) {
    return HEADER;
  }

  if (expandedCount === 0) {
    return HEADER;
  }

  return `calc((100vh - 8rem - ${collapsedCount} * 2.75rem) / ${expandedCount})`;
}

export default function SidePanel({
  isFavorite,
  route,
  loading,
  error,
  onGenerate,
  onClear,
  places,
  savedRoutes,
  onSaveRoute,
  onLoadRoute,
  onDeleteRoute,
  activeRouteId,
  onRenameRoute,
  onToggleRouteWalked,
  onClearLoadedRoute,
  composing,
  onStartComposing,
  onStopComposing,
  selectedSegmentCount,
  composedTotalDistance,
  composedIsLoop,
  onUndoLastSegment,
  onClearAllSegments,
  onSaveComposedRoute,
  composerError,
  paths,
  walkedPathIds,
  showWalkedOnly,
  hoveredPathId,
  onPathHover,
  startTempPoint,
  endTempPoint,
  onPickPointOnMap,
  onClearTempPoint,
  autoSelectPlace,
}: SidePanelProps) {
  const [savedRoutesCollapsed, setSavedRoutesCollapsed] = useState(false);
  const [routePlannerCollapsed, setRoutePlannerCollapsed] = useState(false);
  const [composerCollapsed, setComposerCollapsed] = useState(true);
  const [pathListCollapsed, setPathListCollapsed] = useState(true);

  useEffect(() => {
    if (composing) {
      setRoutePlannerCollapsed(true);
      setSavedRoutesCollapsed(true);
    }
  }, [composing]);

  useEffect(() => {
    if (route !== null) {
      setComposerCollapsed(true);
    }
  }, [route]);

  const savedRoutesHeight = isFavorite
    ? computeSectionHeight(savedRoutesCollapsed, routePlannerCollapsed, composerCollapsed, pathListCollapsed, savedRoutesCollapsed)
    : "0";
  const rpHeight = isFavorite
    ? computeSectionHeight(savedRoutesCollapsed, routePlannerCollapsed, composerCollapsed, pathListCollapsed, routePlannerCollapsed)
    : "0";
  const composerHeight = isFavorite
    ? computeSectionHeight(savedRoutesCollapsed, routePlannerCollapsed, composerCollapsed, pathListCollapsed, composerCollapsed)
    : "0";
  const pathListHeight = isFavorite
    ? computeSectionHeight(savedRoutesCollapsed, routePlannerCollapsed, composerCollapsed, pathListCollapsed, pathListCollapsed)
    : "0";

  return (
    <div className="absolute right-4 top-4 z-[1000] flex w-72 flex-col gap-2">
      {isFavorite && (
        <>
          <SavedRoutes
            savedRoutes={savedRoutes}
            activeRouteId={activeRouteId}
            loadedRouteDetails={activeRouteId !== null ? route : null}
            loading={loading}
            onLoadRoute={onLoadRoute}
            onDeleteRoute={onDeleteRoute}
            onRenameRoute={onRenameRoute}
            onToggleWalked={onToggleRouteWalked}
            onClearLoadedRoute={onClearLoadedRoute}
            collapsed={savedRoutesCollapsed}
            onToggleCollapsed={() => setSavedRoutesCollapsed((c) => !c)}
            height={savedRoutesHeight}
          />
          <RoutePlanner
            route={route}
            loading={loading}
            error={error}
            onGenerate={onGenerate}
            onClear={onClear}
            isFavorite={isFavorite}
            places={places}
            onSaveRoute={onSaveRoute}
            activeRouteId={activeRouteId}
            collapsed={routePlannerCollapsed}
            onToggleCollapsed={() => setRoutePlannerCollapsed((c) => !c)}
            height={rpHeight}
            startTempPoint={startTempPoint}
            endTempPoint={endTempPoint}
            onPickPointOnMap={onPickPointOnMap}
            onClearTempPoint={onClearTempPoint}
            autoSelectPlace={autoSelectPlace}
          />
          <RouteComposer
            isFavorite={isFavorite}
            composing={composing}
            onStartComposing={onStartComposing}
            onStopComposing={onStopComposing}
            selectedSegmentCount={selectedSegmentCount}
            composedTotalDistance={composedTotalDistance}
            composedIsLoop={composedIsLoop}
            onUndoLast={onUndoLastSegment}
            onClearAll={onClearAllSegments}
            onSaveRoute={onSaveComposedRoute}
            composerError={composerError}
            collapsed={composerCollapsed}
            onToggleCollapsed={() => setComposerCollapsed((c) => !c)}
            height={composerHeight}
          />
          <PathList
            paths={paths}
            walkedPathIds={walkedPathIds}
            showWalkedOnly={showWalkedOnly}
            hoveredPathId={hoveredPathId}
            onPathHover={onPathHover}

            collapsed={pathListCollapsed}
            onToggleCollapsed={() => setPathListCollapsed((c) => !c)}
            maxHeight={pathListHeight}
          />
        </>
      )}
    </div>
  );
}
