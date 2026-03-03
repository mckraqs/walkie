"use client";

import { useEffect, useState } from "react";
import { Pencil, Check, X, MapPin, Search } from "lucide-react";
import CollapsibleSection from "@/components/collapsible-section";
import PlaceSearch from "@/components/PlaceSearch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Place, GeocodingResult } from "@/types/geo";

interface PlacesProps {
  places: Place[];
  placeCreationMode: "pin" | "search" | null;
  onSetPlaceCreationMode: (mode: "pin" | "search" | null) => void;
  onDeletePlace: (placeId: number) => Promise<void>;
  onRenamePlace: (placeId: number, newName: string) => Promise<void>;
  onPlaceClick: (location: [number, number]) => void;
  hoveredPlaceId: number | null;
  onPlaceHover: (placeId: number | null) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  height: string;
  regionBbox: [number, number, number, number] | null;
  regionCenter: [number, number] | null;
  onSearchResultHover: (location: [number, number] | null) => void;
  onSearchResultSelect: (result: GeocodingResult) => void;
  onSaveSearchResult: (name: string, location: [number, number]) => void;
}

export default function Places({
  places,
  placeCreationMode,
  onSetPlaceCreationMode,
  onDeletePlace,
  onRenamePlace,
  onPlaceClick,
  hoveredPlaceId,
  onPlaceHover,
  collapsed,
  onToggleCollapsed,
  height,
  regionBbox,
  regionCenter,
  onSearchResultHover,
  onSearchResultSelect,
  onSaveSearchResult,
}: PlacesProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showCreationOptions, setShowCreationOptions] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (placeCreationMode !== null) {
      setShowCreationOptions(false);
    }
  }, [placeCreationMode]);

  async function handleDelete(placeId: number) {
    setDeletingId(placeId);
    try {
      await onDeletePlace(placeId);
    } finally {
      setDeletingId(null);
    }
  }

  function startRename(place: Place) {
    setRenamingId(place.id);
    setRenameValue(place.name);
  }

  async function confirmRename() {
    if (renamingId === null || !renameValue.trim()) return;
    setRenaming(true);
    try {
      await onRenamePlace(renamingId, renameValue.trim());
    } finally {
      setRenaming(false);
      setRenamingId(null);
      setRenameValue("");
    }
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  return (
    <CollapsibleSection
      title="My Places"
      badge={places.length > 0 ? `(${places.length})` : undefined}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      height={height}
    >
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-end">
          {placeCreationMode === null && !showCreationOptions && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreationOptions(true)}
            >
              + Place
            </Button>
          )}
          {placeCreationMode === null && showCreationOptions && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreationOptions(false);
                  onSetPlaceCreationMode("pin");
                }}
              >
                <MapPin className="mr-1 h-3 w-3" />
                Pin on Map
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreationOptions(false);
                  onSetPlaceCreationMode("search");
                }}
              >
                <Search className="mr-1 h-3 w-3" />
                Search
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreationOptions(false)}
              >
                Cancel
              </Button>
            </div>
          )}
          {placeCreationMode === "pin" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Click on the map to place a pin
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSetPlaceCreationMode(null)}
              >
                Cancel
              </Button>
            </div>
          )}
          {placeCreationMode === "search" && (
            <div className="flex w-full items-center gap-1">
              <div className="flex-1">
                <PlaceSearch
                  regionBbox={regionBbox}
                  regionCenter={regionCenter}
                  onResultHover={onSearchResultHover}
                  onResultSelect={onSearchResultSelect}
                  onSaveResult={onSaveSearchResult}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => onSetPlaceCreationMode(null)}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>

        {places.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No places yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {places.map((place) => (
              <li
                key={place.id}
                className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent${hoveredPlaceId === place.id ? " bg-accent" : ""}`}
                onMouseEnter={() => onPlaceHover(place.id)}
                onMouseLeave={() => onPlaceHover(null)}
                onClick={() => onPlaceClick(place.location)}
              >
                {renamingId === place.id ? (
                  <div
                    className="flex flex-1 items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="h-6 flex-1 text-xs"
                      disabled={renaming}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => confirmRename()}
                      disabled={renaming || !renameValue.trim()}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      title="Confirm"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelRename()}
                      disabled={renaming}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      title="Cancel"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {place.name}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                          title="Actions"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => startRename(place)}>
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(place.id)}
                          disabled={deletingId === place.id}
                          className="text-destructive"
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}
