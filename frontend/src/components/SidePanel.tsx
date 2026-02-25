"use client";

import { useState } from "react";
import RoutePlanner from "@/components/RoutePlanner";
import type {
  RouteResponse,
  RouteType,
  RouteListItem,
  SaveRouteRequest,
  Place,
} from "@/types/geo";

const FULL = "calc(100vh - 8rem)";
const HEADER = "2.75rem";

interface SidePanelProps {
  isFavorite: boolean;
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
}: SidePanelProps) {
  const [routePlannerCollapsed, setRoutePlannerCollapsed] = useState(false);

  const rpMaxHeight = isFavorite
    ? routePlannerCollapsed
      ? HEADER
      : FULL
    : "0";

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
    </div>
  );
}
