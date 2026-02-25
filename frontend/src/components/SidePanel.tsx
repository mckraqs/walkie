"use client";

import { useState } from "react";
import RoutePlanner from "@/components/RoutePlanner";
import PathList from "@/components/PathList";
import type {
  RouteResponse,
  RouteType,
  RouteListItem,
  SaveRouteRequest,
  Place,
  PathFeatureCollection,
} from "@/types/geo";

const FULL = "calc(100vh - 8rem)";
const HALF = "calc((100vh - 8rem) / 2)";
const HEADER = "2.75rem";
const FULL_MINUS_HEADER = "calc(100vh - 8rem - 2.75rem)";

interface SidePanelProps {
  isFavorite: boolean;
  // RoutePlanner props
  route: RouteResponse | null;
  loading: boolean;
  error: string | null;
  onGenerate: (distanceKm: number, routeType: RouteType, startPlaceId: number | null, endPlaceId: number | null) => void;
  onClear: () => void;
  places?: Place[];
  savedRoutes: RouteListItem[];
  onSaveRoute: (request: SaveRouteRequest) => Promise<void>;
  onLoadRoute: (routeId: number) => void;
  onDeleteRoute: (routeId: number) => Promise<void>;
  // PathList props
  paths: PathFeatureCollection;
  walkedPathIds: Set<number>;
  showWalkedOnly: boolean;
  hoveredPathId: number | null;
  selectedPathId: number | null;
  onPathHover: (pathId: number | null) => void;
  onPathClick: (pathId: number) => void;
  onToggleWalk: (pathId: number) => void;
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
  paths,
  walkedPathIds,
  showWalkedOnly,
  hoveredPathId,
  selectedPathId,
  onPathHover,
  onPathClick,
  onToggleWalk,
}: SidePanelProps) {
  const [routePlannerCollapsed, setRoutePlannerCollapsed] = useState(false);
  const [pathListCollapsed, setPathListCollapsed] = useState(true);

  let rpMaxHeight: string;
  let plMaxHeight: string;

  if (!isFavorite) {
    rpMaxHeight = "0";
    plMaxHeight = FULL;
  } else if (routePlannerCollapsed && pathListCollapsed) {
    rpMaxHeight = HEADER;
    plMaxHeight = HEADER;
  } else if (routePlannerCollapsed && !pathListCollapsed) {
    rpMaxHeight = HEADER;
    plMaxHeight = FULL_MINUS_HEADER;
  } else if (!routePlannerCollapsed && pathListCollapsed) {
    rpMaxHeight = FULL_MINUS_HEADER;
    plMaxHeight = HEADER;
  } else {
    rpMaxHeight = HALF;
    plMaxHeight = HALF;
  }

  return (
    <div className="absolute right-4 top-4 z-[1000] flex w-72 flex-col">
      {isFavorite && (
        <RoutePlanner
          route={route}
          loading={loading}
          error={error}
          onGenerate={onGenerate}
          onClear={onClear}
          isFavorite={isFavorite}
          places={places}
          savedRoutes={savedRoutes}
          onSaveRoute={onSaveRoute}
          onLoadRoute={onLoadRoute}
          onDeleteRoute={onDeleteRoute}
          collapsed={routePlannerCollapsed}
          onToggleCollapsed={() => setRoutePlannerCollapsed((c) => !c)}
          height={rpMaxHeight}
        />
      )}
      <PathList
        paths={paths}
        walkedPathIds={walkedPathIds}
        isFavorite={isFavorite}
        showWalkedOnly={showWalkedOnly}
        hoveredPathId={hoveredPathId}
        selectedPathId={selectedPathId}
        onPathHover={onPathHover}
        onPathClick={onPathClick}
        onToggleWalk={onToggleWalk}
        collapsed={pathListCollapsed}
        onToggleCollapsed={() => setPathListCollapsed((c) => !c)}
        maxHeight={plMaxHeight}
      />
    </div>
  );
}
