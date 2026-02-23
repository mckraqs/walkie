"use client";

import { useState } from "react";
import type { RouteResponse } from "@/types/geo";

interface RoutePlannerProps {
  route: RouteResponse | null;
  loading: boolean;
  error: string | null;
  onGenerate: (distanceKm: number) => void;
  onClear: () => void;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return `${hours}h ${remaining}min`;
  }
  return `${minutes} min`;
}

export default function RoutePlanner({
  route,
  loading,
  error,
  onGenerate,
  onClear,
}: RoutePlannerProps) {
  const [distance, setDistance] = useState("3");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const km = parseFloat(distance);
    if (!isNaN(km) && km >= 0.1 && km <= 50) {
      onGenerate(km);
    }
  }

  return (
    <div className="absolute left-4 top-4 z-[1000] w-72 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Route Planner
      </h3>

      <form onSubmit={handleSubmit} className="flex gap-2">
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
              <span className="font-medium">Duration:</span>{" "}
              {formatDuration(route.estimated_duration)}
            </p>
            <p>
              <span className="font-medium">Segments:</span>{" "}
              {route.paths.features.length}
            </p>
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
