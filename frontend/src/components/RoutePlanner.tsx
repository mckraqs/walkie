"use client";

import { useEffect, useState } from "react";
import type {
  RouteResponse,
  RouteType,
  RouteListItem,
  SaveRouteRequest,
  Place,
} from "@/types/geo";

interface RoutePlannerProps {
  route: RouteResponse | null;
  loading: boolean;
  error: string | null;
  onGenerate: (distanceKm: number, routeType: RouteType, startPlaceId: number | null, endPlaceId: number | null) => void;
  onClear: () => void;
  isFavorite: boolean;
  places?: Place[];
  savedRoutes: RouteListItem[];
  onSaveRoute: (request: SaveRouteRequest) => Promise<void>;
  onLoadRoute: (routeId: number) => void;
  onDeleteRoute: (routeId: number) => Promise<void>;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export default function RoutePlanner({
  route,
  loading,
  error,
  onGenerate,
  onClear,
  isFavorite,
  places,
  savedRoutes,
  onSaveRoute,
  onLoadRoute,
  onDeleteRoute,
}: RoutePlannerProps) {
  const [collapsed, setCollapsed] = useState(true);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const km = parseFloat(distance);
    if (!isNaN(km) && km >= 0.1 && km <= 50) {
      onGenerate(km, routeType, startPlaceId, endPlaceId);
    }
  }

  return (
    <div className={`absolute left-4 bottom-4 z-[1000] flex w-72 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg transition-all duration-300 ease-in-out dark:border-zinc-700 dark:bg-zinc-900 ${collapsed ? "max-h-[2.75rem]" : "max-h-[50vh]"}`}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={`flex w-full cursor-pointer items-center justify-between px-4 py-3 ${collapsed ? "" : "border-b border-zinc-200 dark:border-zinc-700"}`}
      >
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Route Planner
        </h3>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 text-zinc-500 transition-transform duration-300 dark:text-zinc-400 ${collapsed ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <div className="flex-1 overflow-y-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label
                htmlFor="distance"
                className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400"
              >
                Distance (km)
              </label>
              <input
                id="distance"
                type="number"
                min="0.1"
                max="50"
                step="0.1"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                disabled={loading}
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !isFavorite}
              className="mt-5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "..." : "Generate"}
            </button>
          </div>

          {!isFavorite && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Add this region to your favorites to generate routes.
            </p>
          )}

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={routeType === "loop"}
              onChange={(e) => {
                const isLoop = e.target.checked;
                setRouteType(isLoop ? "loop" : "one_way");
                if (isLoop) setEndPlaceId(null);
              }}
              disabled={loading}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              Loop route
            </span>
          </label>
          {places && places.length > 0 && (
            <div className="space-y-2">
              <div>
                <label
                  htmlFor="start-place"
                  className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400"
                >
                  {routeType === "loop" ? "Start / Finish place" : "Start place"}
                </label>
                <select
                  id="start-place"
                  value={startPlaceId ?? ""}
                  onChange={(e) => setStartPlaceId(e.target.value ? Number(e.target.value) : null)}
                  disabled={loading}
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                >
                  <option value="">Random (default)</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {routeType === "one_way" && (
                <div>
                  <label
                    htmlFor="end-place"
                    className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400"
                  >
                    Finish place
                  </label>
                  <select
                    id="end-place"
                    value={endPlaceId ?? ""}
                    onChange={(e) => setEndPlaceId(e.target.value ? Number(e.target.value) : null)}
                    disabled={loading}
                    className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                  >
                    <option value="">Random (default)</option>
                    {places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </form>

        {isFavorite && savedRoutes.length > 0 && (
          <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <label
              htmlFor="saved-routes"
              className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400"
            >
              Saved Routes
            </label>
            <div className="flex gap-1">
              <select
                id="saved-routes"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    onLoadRoute(Number(e.target.value));
                    e.target.value = "";
                  }
                }}
                disabled={loading}
                className="flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
              >
                <option value="" disabled>
                  Load a saved route...
                </option>
                {savedRoutes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({formatDistance(r.total_distance)}
                    {r.is_loop ? ", loop" : ""})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const select = document.getElementById("saved-routes") as HTMLSelectElement | null;
                  const routeId = select?.value ? Number(select.value) : null;
                  if (routeId) {
                    onDeleteRoute(routeId);
                    select!.value = "";
                  }
                }}
                className="rounded border border-red-300 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                title="Delete selected route"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        {route && (
          <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <div className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              <p>
                <span className="font-medium">Distance:</span>{" "}
                {formatDistance(route.total_distance)}
              </p>
              <p>
                <span className="font-medium">Paths:</span>{" "}
                {route.paths_count}
              </p>
              {route.path_names.length > 0 && (
                <ul className="ml-4 list-disc text-xs text-zinc-600 dark:text-zinc-400">
                  {route.path_names.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              )}
              {route.is_loop && (
                <p>
                  <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    Loop
                  </span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClear}
              className="mt-2 w-full rounded border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Clear Route
            </button>
            {isFavorite && !showSaveInput && (
              <button
                type="button"
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
                className="mt-1 w-full rounded border border-blue-300 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
              >
                Save Route
              </button>
            )}
            {showSaveInput && (
              <div className="mt-2 space-y-1">
                <input
                  type="text"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  disabled={saving}
                  placeholder="Route name"
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
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
                      } catch (err) {
                        setSaveError(
                          err instanceof Error ? err.message : "Failed to save route",
                        );
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="flex-1 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "..." : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSaveInput(false);
                      setSaveError(null);
                    }}
                    disabled={saving}
                    className="flex-1 rounded border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
                {saveError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
