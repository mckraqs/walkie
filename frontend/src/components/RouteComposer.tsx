"use client";

import { useState } from "react";
import type { SaveRouteRequest } from "@/types/geo";

interface RouteComposerProps {
  isFavorite: boolean;
  composing: boolean;
  onStartComposing: () => void;
  onStopComposing: () => void;
  selectedSegmentCount: number;
  composedTotalDistance: number;
  composedIsLoop: boolean;
  onUndoLast: () => void;
  onClearAll: () => void;
  onSaveRoute: (request: SaveRouteRequest) => Promise<void>;
  composerError: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  height: string;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export default function RouteComposer({
  isFavorite,
  composing,
  onStartComposing,
  onStopComposing,
  selectedSegmentCount,
  composedTotalDistance,
  composedIsLoop,
  onUndoLast,
  onClearAll,
  onSaveRoute,
  composerError,
  collapsed,
  onToggleCollapsed,
  height,
}: RouteComposerProps) {
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
          Route Composer
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
        {!composing ? (
          <button
            type="button"
            disabled={!isFavorite}
            onClick={onStartComposing}
            className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Start Composing
          </button>
        ) : (
          <div className="space-y-3">
            {selectedSegmentCount > 0 && (
              <div className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                <p>
                  <span className="font-medium">Segments:</span>{" "}
                  {selectedSegmentCount}
                </p>
                <p>
                  <span className="font-medium">Distance:</span>{" "}
                  {formatDistance(composedTotalDistance)}
                </p>
                {composedIsLoop && (
                  <p>
                    <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      Loop
                    </span>
                  </p>
                )}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={onUndoLast}
                    className="flex-1 rounded border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Undo Last
                  </button>
                  <button
                    type="button"
                    onClick={onClearAll}
                    className="flex-1 rounded border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onStopComposing}
              className="w-full rounded border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Stop Composing
            </button>

            {selectedSegmentCount > 0 && !showSaveInput && (
              <button
                type="button"
                onClick={() => {
                  setRouteName("Custom Route");
                  setShowSaveInput(true);
                  setSaveError(null);
                }}
                className="w-full rounded border border-blue-300 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
              >
                Save Route
              </button>
            )}

            {showSaveInput && (
              <div className="space-y-1">
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
                          segment_ids: [],
                          total_distance: composedTotalDistance,
                          is_loop: composedIsLoop,
                          is_custom: true,
                          start_point: null,
                          end_point: null,
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

            {composerError && (
              <p className="text-xs text-red-600 dark:text-red-400">{composerError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
