"use client";

import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { downloadRouteFile } from "@/lib/gpx";
import { formatDistance } from "@/lib/geo";
import CollapsibleSection from "@/components/collapsible-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TempPoint } from "@/components/RegionExplorer";
import type {
  RouteResponse,
  RouteType,
  SaveRouteRequest,
  Place,
} from "@/types/geo";

interface RoutePlannerProps {
  route: RouteResponse | null;
  loading: boolean;
  error: string | null;
  onGenerate: (distanceKm: number, routeType: RouteType, startPlaceId: number | null, endPlaceId: number | null, startCoords?: [number, number] | null, endCoords?: [number, number] | null) => void;
  onClear: () => void;
  isFavorite: boolean;
  places?: Place[];
  onSaveRoute: (request: SaveRouteRequest) => Promise<void>;
  activeRouteId: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  height: string;
  startTempPoint: TempPoint | null;
  endTempPoint: TempPoint | null;
  onPickPointOnMap: (which: "start" | "end") => void;
  onClearTempPoint: (which: "start" | "end") => void;
  autoSelectPlace: { which: "start" | "end"; placeId: number } | null;
}

export default function RoutePlanner({
  route,
  loading,
  error,
  onGenerate,
  onClear,
  isFavorite,
  places,
  onSaveRoute,
  activeRouteId,
  collapsed,
  onToggleCollapsed,
  height,
  startTempPoint,
  endTempPoint,
  onPickPointOnMap,
  onClearTempPoint,
  autoSelectPlace,
}: RoutePlannerProps) {
  const [distance, setDistance] = useState("3");
  const [routeType, setRouteType] = useState<RouteType>("one_way");
  const [startPlaceId, setStartPlaceId] = useState<number | null>(null);
  const [endPlaceId, setEndPlaceId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [routeName, setRouteName] = useState("");

  useEffect(() => {
    setShowSaveInput(false);
    setSaveError(null);
  }, [route]);

  useEffect(() => {
    if (!autoSelectPlace) return;
    if (autoSelectPlace.which === "start") {
      setStartPlaceId(autoSelectPlace.placeId);
    } else {
      setEndPlaceId(autoSelectPlace.placeId);
    }
  }, [autoSelectPlace]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const km = parseFloat(distance);
    if (!isNaN(km) && km >= 0.1 && km <= 50) {
      onGenerate(
        km,
        routeType,
        startTempPoint ? null : startPlaceId,
        endTempPoint ? null : endPlaceId,
        startTempPoint?.coords ?? null,
        endTempPoint?.coords ?? null,
      );
    }
  }

  // Sentinel values for Radix Select (doesn't handle empty string well)
  const RANDOM_VALUE = "__random__";
  const CUSTOM_VALUE = "__custom__";

  const startSelectValue = startTempPoint
    ? CUSTOM_VALUE
    : startPlaceId !== null
      ? String(startPlaceId)
      : RANDOM_VALUE;

  const endSelectValue = endTempPoint
    ? CUSTOM_VALUE
    : endPlaceId !== null
      ? String(endPlaceId)
      : RANDOM_VALUE;

  function handleStartSelectChange(val: string) {
    if (val === CUSTOM_VALUE) return;
    onClearTempPoint("start");
    setStartPlaceId(val === RANDOM_VALUE ? null : Number(val));
  }

  function handleEndSelectChange(val: string) {
    if (val === CUSTOM_VALUE) return;
    onClearTempPoint("end");
    setEndPlaceId(val === RANDOM_VALUE ? null : Number(val));
  }

  return (
    <CollapsibleSection
      title="Route Planner"
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      height={height}
    >
      <div className="flex-1 overflow-y-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="distance">Distance (km)</Label>
              <Input
                id="distance"
                type="number"
                min="0.1"
                max="50"
                step="0.1"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button
              type="submit"
              disabled={loading || !isFavorite}
              className="mt-5"
            >
              {loading ? "..." : "Plan"}
            </Button>
          </div>

          {!isFavorite && (
            <p className="text-xs text-muted-foreground">
              Add this region to your favorites to generate routes.
            </p>
          )}

          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={routeType === "loop"}
              onCheckedChange={(checked) => {
                const isLoop = !!checked;
                setRouteType(isLoop ? "loop" : "one_way");
                if (isLoop) setEndPlaceId(null);
              }}
              disabled={loading}
            />
            <span className="text-xs text-muted-foreground">
              Loop route
            </span>
          </label>
          <div className="space-y-2">
            <div>
              <Label htmlFor="start-place">
                {routeType === "loop" ? "Start / Finish place" : "Start place"}
              </Label>
              <div className="flex items-center gap-1">
                <Select
                  value={startSelectValue}
                  onValueChange={handleStartSelectChange}
                  disabled={loading}
                >
                  <SelectTrigger id="start-place" className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RANDOM_VALUE}>Random (default)</SelectItem>
                    {startTempPoint && (
                      <SelectItem value={CUSTOM_VALUE}>Custom point</SelectItem>
                    )}
                    {places?.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {startTempPoint ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => onClearTempPoint("start")}
                    disabled={loading}
                    className="h-9 w-9 shrink-0"
                    title="Clear custom point"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => onPickPointOnMap("start")}
                    disabled={loading}
                    className="h-9 w-9 shrink-0"
                    title="Pick on map"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {routeType === "one_way" && (
              <div>
                <Label htmlFor="end-place">Finish place</Label>
                <div className="flex items-center gap-1">
                  <Select
                    value={endSelectValue}
                    onValueChange={handleEndSelectChange}
                    disabled={loading}
                  >
                    <SelectTrigger id="end-place" className="min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={RANDOM_VALUE}>Random (default)</SelectItem>
                      {endTempPoint && (
                        <SelectItem value={CUSTOM_VALUE}>Custom point</SelectItem>
                      )}
                      {places?.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {endTempPoint ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => onClearTempPoint("end")}
                      disabled={loading}
                      className="h-9 w-9 shrink-0"
                      title="Clear custom point"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => onPickPointOnMap("end")}
                      disabled={loading}
                      className="h-9 w-9 shrink-0"
                      title="Pick on map"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </form>

        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}

        {route && activeRouteId === null && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="space-y-1 text-sm">
              <p>
                <span className="font-medium">Distance:</span>{" "}
                {formatDistance(route.total_distance)}
              </p>
              <p>
                <span className="font-medium">Paths:</span>{" "}
                {route.paths_count}
              </p>
              {route.path_names.length > 0 && (
                <ul className="ml-4 list-disc text-xs text-muted-foreground">
                  {route.path_names.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              )}
              {route.is_loop && (
                <p>
                  <Badge variant="secondary">Loop</Badge>
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              className="mt-2 w-full"
            >
              Clear Route
            </Button>
            {isFavorite && !showSaveInput && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const names = route.path_names;
                  const defaultName =
                    names.length > 1
                      ? `${names[0]} -> ${names[names.length - 1]}`
                      : names.length === 1
                        ? names[0]
                        : "My Route";
                  setRouteName(defaultName);
                  setShowSaveInput(true);
                  setSaveError(null);
                }}
                className="mt-1 w-full border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
              >
                Save Route
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const names = route.path_names;
                const defaultName =
                  names.length > 1
                    ? `${names[0]} -> ${names[names.length - 1]}`
                    : names.length === 1
                      ? names[0]
                      : "My Route";
                downloadRouteFile(route, defaultName, "gpx");
              }}
              className="mt-1 w-full"
            >
              Download GPX
            </Button>
            {showSaveInput && (
              <div className="mt-2 space-y-1">
                <Input
                  type="text"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  disabled={saving}
                  placeholder="Route name"
                />
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    disabled={saving || !routeName.trim()}
                    onClick={async () => {
                      setSaving(true);
                      setSaveError(null);
                      try {
                        await onSaveRoute({
                          name: routeName.trim(),
                          segment_ids: route.segments.features.map((f) => f.id),
                          total_distance: route.total_distance,
                          is_loop: route.is_loop,
                          start_point: route.start_point,
                          end_point: route.end_point,
                        });
                        setShowSaveInput(false);
                        onClear();
                      } catch (err) {
                        setSaveError(
                          err instanceof Error ? err.message : "Failed to save route",
                        );
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="flex-1"
                  >
                    {saving ? "..." : "Confirm"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowSaveInput(false);
                      setSaveError(null);
                    }}
                    disabled={saving}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
                {saveError && (
                  <p className="text-xs text-destructive">{saveError}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
