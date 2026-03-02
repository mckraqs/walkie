"use client";

import { useState } from "react";
import type { Place } from "@/types/geo";

interface PlacesProps {
  places: Place[];
  showPlaces: boolean;
  onToggleShowPlaces: () => void;
  isCreatingPlace: boolean;
  onToggleCreatingPlace: () => void;
  onDeletePlace: (placeId: number) => Promise<void>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  height: string;
}

export default function Places({
  places,
  showPlaces,
  onToggleShowPlaces,
  isCreatingPlace,
  onToggleCreatingPlace,
  onDeletePlace,
  collapsed,
  onToggleCollapsed,
  height,
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
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg transition-all duration-300 ease-in-out dark:border-zinc-700 dark:bg-zinc-900"
      style={{ height }}
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        className={`flex w-full cursor-pointer items-center justify-between px-4 py-3 ${collapsed ? "" : "border-b border-zinc-200 dark:border-zinc-700"}`}
      >
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Places
          {places.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-zinc-400 dark:text-zinc-500">
              ({places.length})
            </span>
          )}
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

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={showPlaces}
              onChange={onToggleShowPlaces}
              className="h-3.5 w-3.5 cursor-pointer accent-purple-600"
            />
            Show on map
          </label>
          <button
            type="button"
            onClick={onToggleCreatingPlace}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
              isCreatingPlace
                ? "border-purple-600 bg-purple-50 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-400"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {isCreatingPlace ? "Cancel Pin" : "+ Place"}
          </button>
        </div>

        {places.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            No places yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {places.map((place) => (
              <li
                key={place.id}
                className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {place.name}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(place.id)}
                  disabled={deletingId === place.id}
                  className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
                  title="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
