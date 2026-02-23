"use client";

import { useState } from "react";
import type { RouteResponse, RouteType } from "@/types/geo";

interface RoutePlannerProps {
  route: RouteResponse | null;
  loading: boolean;
  error: string | null;
  onGenerate: (distanceKm: number, routeType: RouteType) => void;
  onClear: () => void;
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
}: RoutePlannerProps) {
  const [distance, setDistance] = useState("3");
  const [routeType, setRouteType] = useState<RouteType>("one_way");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const km = parseFloat(distance);
    if (!isNaN(km) && km >= 0.1 && km <= 50) {
      onGenerate(km, routeType);
    }
  }

  return (
    <div className="absolute left-4 top-4 z-[1000] w-72 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Route Planner
      </h3>

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
            disabled={loading}
            className="mt-5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "..." : "Generate"}
          </button>
        </div>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={routeType === "loop"}
            onChange={(e) =>
              setRouteType(e.target.checked ? "loop" : "one_way")
            }
            disabled={loading}
            className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
          />
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Loop route
          </span>
        </label>
      </form>

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
        </div>
      )}
    </div>
  );
}
