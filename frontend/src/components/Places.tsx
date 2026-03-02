"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import CollapsibleSection from "@/components/collapsible-section";
import PlaceSearch from "@/components/PlaceSearch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { Place, GeocodingResult } from "@/types/geo";

interface PlacesProps {
  places: Place[];
  showPlaces: boolean;
  onToggleShowPlaces: () => void;
  isCreatingPlace: boolean;
  onToggleCreatingPlace: () => void;
  onDeletePlace: (placeId: number) => Promise<void>;
  hoveredPlaceId: number | null;
  onPlaceHover: (placeId: number | null) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  height: string;
  regionBbox: [number, number, number, number] | null;
  regionCenter: [number, number] | null;
  routePlannerActive: boolean;
  onSearchResultHover: (location: [number, number] | null) => void;
  onSearchResultSelect: (result: GeocodingResult) => void;
  onSaveSearchResult: (name: string, location: [number, number]) => void;
  onUseAsRoutePoint: (which: "start" | "end", coords: [number, number]) => void;
}

export default function Places({
  places,
  showPlaces,
  onToggleShowPlaces,
  isCreatingPlace,
  onToggleCreatingPlace,
  onDeletePlace,
  hoveredPlaceId,
  onPlaceHover,
  collapsed,
  onToggleCollapsed,
  height,
  regionBbox,
  regionCenter,
  routePlannerActive,
  onSearchResultHover,
  onSearchResultSelect,
  onSaveSearchResult,
  onUseAsRoutePoint,
}: PlacesProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleDelete(placeId: number) {
    setDeletingId(placeId);
    try {
      await onDeletePlace(placeId);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <CollapsibleSection
      title="Places"
      badge={places.length > 0 ? `(${places.length})` : undefined}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      height={height}
    >
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={showPlaces}
              onCheckedChange={() => onToggleShowPlaces()}
              className="h-3.5 w-3.5"
            />
            Show on map
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleCreatingPlace}
            className={
              isCreatingPlace
                ? "border-purple-600 bg-purple-50 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-400"
                : ""
            }
          >
            {isCreatingPlace ? "Cancel Pin" : "+ Place"}
          </Button>
        </div>

        <PlaceSearch
          regionBbox={regionBbox}
          regionCenter={regionCenter}
          routePlannerActive={routePlannerActive}
          onResultHover={onSearchResultHover}
          onResultSelect={onSearchResultSelect}
          onSaveResult={onSaveSearchResult}
          onUseAsRoutePoint={onUseAsRoutePoint}
        />

        {places.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No places yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {places.map((place) => (
              <li
                key={place.id}
                className={`flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent${hoveredPlaceId === place.id ? " bg-accent" : ""}`}
                onMouseEnter={() => onPlaceHover(place.id)}
                onMouseLeave={() => onPlaceHover(null)}
              >
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {place.name}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(place.id)}
                  disabled={deletingId === place.id}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}
