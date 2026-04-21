"use client";

import { useEffect, useState } from "react";
import SavedRoutes from "@/components/SavedRoutes";
import WalkHistory from "@/components/WalkHistory";
import RoutePlanner from "@/components/RoutePlanner";
import Places from "@/components/Places";
import PathList from "@/components/PathList";
import { Button } from "@/components/ui/button";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { TempPoint } from "@/components/RegionExplorer";
import type {
  RouteResponse,
  RouteType,
  RouteListItem,
  SaveRouteRequest,
  Place,
  PathFeature,
  GeocodingResult,
  MatchGeometryResponse,
  WalkListItem,
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
  onClearLoadedRoute: () => void;
  onRouteHover: (routeId: number | null) => void;
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
  drawingWalk: boolean;
  onStartDrawing: () => void;
  onStopDrawing: () => void;
  drawnVertexCount: number;
  drawMatchResult: MatchGeometryResponse | null;
  drawMatchLoading: boolean;
  onSaveDrawnWalk: (name: string, walkedAt?: string) => Promise<void>;
  onDrawUndo: () => void;
  paths: PathFeature[];
  walkedPathIds: Set<number>;
  hoveredPathId: number | null;
  onPathHover: (pathId: number | null) => void;
  onPathClick: (pathId: number) => void;
  startTempPoint: TempPoint | null;
  endTempPoint: TempPoint | null;
  onPickPointOnMap: (which: "start" | "end") => void;
  onClearTempPoint: (which: "start" | "end") => void;
  autoSelectPlace: { which: "start" | "end"; placeId: number } | null;
  placeCreationMode: "pin" | "search" | null;
  onSetPlaceCreationMode: (mode: "pin" | "search" | null) => void;
  onDeletePlace: (placeId: number) => Promise<void>;
  onRenamePlace: (placeId: number, newName: string) => Promise<void>;
  hoveredPlaceId: number | null;
  onPlaceHover: (placeId: number | null) => void;
  onPlaceClick: (location: [number, number]) => void;
  regionBbox: [number, number, number, number] | null;
  regionCenter: [number, number] | null;
  onSearchResultHover: (location: [number, number] | null) => void;
  onSearchResultSelect: (result: GeocodingResult) => void;
  onSaveSearchResult: (name: string, location: [number, number]) => void;
  walks: WalkListItem[];
  activeWalkId: number | null;
  onLoadWalk: (walkId: number) => void;
  onDeleteWalk: (walkId: number) => Promise<void>;
  onRenameWalk: (walkId: number, name: string) => Promise<void>;
  onAddWalkFromRoute: (data: { route_id: number; name: string; walked_at: string }) => void;
  onAddWalkByDrawing: () => void;
  drawingForWalk: boolean;
  onClearActiveWalk: () => void;
}

export function computeSectionHeight(
  savedRoutesCollapsed: boolean,
  routePlannerCollapsed: boolean,
  placesCollapsed: boolean,
  pathListCollapsed: boolean,
  walkHistoryCollapsed: boolean,
  isCollapsed: boolean,
): string {
  const sections = [savedRoutesCollapsed, routePlannerCollapsed, placesCollapsed, pathListCollapsed, walkHistoryCollapsed];
  const collapsedCount = sections.filter(Boolean).length;
  const expandedCount = 5 - collapsedCount;

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
  onClearLoadedRoute,
  onRouteHover,
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
  drawingWalk,
  onStartDrawing,
  onStopDrawing,
  drawnVertexCount,
  drawMatchResult,
  drawMatchLoading,
  onSaveDrawnWalk,
  onDrawUndo,
  paths,
  walkedPathIds,
  hoveredPathId,
  onPathHover,
  onPathClick,
  startTempPoint,
  endTempPoint,
  onPickPointOnMap,
  onClearTempPoint,
  autoSelectPlace,
  placeCreationMode,
  onSetPlaceCreationMode,
  onDeletePlace,
  onRenamePlace,
  hoveredPlaceId,
  onPlaceHover,
  onPlaceClick,
  regionBbox,
  regionCenter,
  onSearchResultHover,
  onSearchResultSelect,
  onSaveSearchResult,
  walks,
  activeWalkId,
  onLoadWalk,
  onDeleteWalk,
  onRenameWalk,
  onAddWalkFromRoute,
  onAddWalkByDrawing,
  drawingForWalk,
  onClearActiveWalk,
}: SidePanelProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [savedRoutesCollapsed, setSavedRoutesCollapsed] = useState(true);
  const [routePlannerCollapsed, setRoutePlannerCollapsed] = useState(true);
  const [placesCollapsed, setPlacesCollapsed] = useState(true);
  const [pathListCollapsed, setPathListCollapsed] = useState(true);
  const [walkHistoryCollapsed, setWalkHistoryCollapsed] = useState(true);

  useEffect(() => {
    if (composing) {
      setSavedRoutesCollapsed(true);
    }
  }, [composing]);

  useEffect(() => {
    if (drawingForWalk) {
      setWalkHistoryCollapsed(false);
    }
  }, [drawingForWalk]);

  const savedRoutesHeight = isFavorite
    ? computeSectionHeight(savedRoutesCollapsed, routePlannerCollapsed, placesCollapsed, pathListCollapsed, walkHistoryCollapsed, savedRoutesCollapsed)
    : "0";
  const rpHeight = isFavorite
    ? computeSectionHeight(savedRoutesCollapsed, routePlannerCollapsed, placesCollapsed, pathListCollapsed, walkHistoryCollapsed, routePlannerCollapsed)
    : "0";
  const placesHeight = isFavorite
    ? computeSectionHeight(savedRoutesCollapsed, routePlannerCollapsed, placesCollapsed, pathListCollapsed, walkHistoryCollapsed, placesCollapsed)
    : "0";
  const pathListHeight = isFavorite
    ? computeSectionHeight(savedRoutesCollapsed, routePlannerCollapsed, placesCollapsed, pathListCollapsed, walkHistoryCollapsed, pathListCollapsed)
    : "0";
  const walkHistoryHeight = isFavorite
    ? computeSectionHeight(savedRoutesCollapsed, routePlannerCollapsed, placesCollapsed, pathListCollapsed, walkHistoryCollapsed, walkHistoryCollapsed)
    : "0";

  return (
    <div className="absolute right-4 top-4 z-[1000] flex items-start">
      {isFavorite && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarCollapsed((c) => !c)}
          className="mt-1 shrink-0 dark:!bg-card dark:hover:!bg-accent"
        >
          {sidebarCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </Button>
      )}

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          width: sidebarCollapsed ? 0 : "20rem",
          marginLeft: sidebarCollapsed ? 0 : "0.5rem",
          opacity: sidebarCollapsed ? 0 : 1,
        }}
      >
        <div className="flex w-80 flex-col gap-2">
          {isFavorite && (
            <>
              <Places
                places={places ?? []}
                placeCreationMode={placeCreationMode}
                onSetPlaceCreationMode={onSetPlaceCreationMode}
                onDeletePlace={onDeletePlace}
                onRenamePlace={onRenamePlace}
                onPlaceClick={onPlaceClick}
                hoveredPlaceId={hoveredPlaceId}
                onPlaceHover={onPlaceHover}
                collapsed={placesCollapsed}
                onToggleCollapsed={() => setPlacesCollapsed((c) => !c)}
                height={placesHeight}
                regionBbox={regionBbox}
                regionCenter={regionCenter}
                onSearchResultHover={onSearchResultHover}
                onSearchResultSelect={onSearchResultSelect}
                onSaveSearchResult={onSaveSearchResult}
              />
              <WalkHistory
                walks={walks}
                savedRoutes={savedRoutes}
                activeWalkId={activeWalkId}
                onLoadWalk={onLoadWalk}
                onDeleteWalk={onDeleteWalk}
                onRenameWalk={onRenameWalk}
                onAddWalkFromRoute={onAddWalkFromRoute}
                onAddWalkByDrawing={onAddWalkByDrawing}
                collapsed={walkHistoryCollapsed}
                onToggleCollapsed={() => {
                  const willCollapse = !walkHistoryCollapsed;
                  setWalkHistoryCollapsed((c) => !c);
                  if (willCollapse) {
                    onClearActiveWalk();
                  }
                }}
                height={walkHistoryHeight}
                drawingForWalk={drawingForWalk}
                drawnVertexCount={drawnVertexCount}
                drawMatchResult={drawMatchResult}
                drawMatchLoading={drawMatchLoading}
                onDrawUndo={onDrawUndo}
                onStopDrawing={onStopDrawing}
                onSaveDrawnWalk={onSaveDrawnWalk}
              />
              <SavedRoutes
                savedRoutes={savedRoutes}
                activeRouteId={activeRouteId}
                loadedRouteDetails={activeRouteId !== null ? route : null}
                loading={loading}
                onLoadRoute={onLoadRoute}
                onDeleteRoute={onDeleteRoute}
                onRenameRoute={onRenameRoute}
                onClearLoadedRoute={onClearLoadedRoute}
                onRouteHover={onRouteHover}
                collapsed={savedRoutesCollapsed}
                onToggleCollapsed={() => {
                  const willCollapse = !savedRoutesCollapsed;
                  setSavedRoutesCollapsed((c) => !c);
                  if (willCollapse) {
                    onClearLoadedRoute();
                  }
                }}
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
                composing={composing}
                onStartComposing={onStartComposing}
                onStopComposing={onStopComposing}
                selectedSegmentCount={selectedSegmentCount}
                composedTotalDistance={composedTotalDistance}
                composedIsLoop={composedIsLoop}
                onUndoLastSegment={onUndoLastSegment}
                onClearAllSegments={onClearAllSegments}
                onSaveComposedRoute={onSaveComposedRoute}
                composerError={composerError}
                drawingWalk={drawingWalk}
                onStartDrawing={onStartDrawing}
                onStopDrawing={onStopDrawing}
                drawnVertexCount={drawnVertexCount}
                drawMatchResult={drawMatchResult}
                drawMatchLoading={drawMatchLoading}
                onSaveDrawnWalk={onSaveDrawnWalk}
                onDrawUndo={onDrawUndo}
                drawingForWalk={drawingForWalk}
              />
              <PathList
                paths={paths}
                walkedPathIds={walkedPathIds}
                hoveredPathId={hoveredPathId}
                onPathHover={onPathHover}
                onPathClick={onPathClick}
                collapsed={pathListCollapsed}
                onToggleCollapsed={() => setPathListCollapsed((c) => !c)}
                height={pathListHeight}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
