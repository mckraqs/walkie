"use client";

import { useState } from "react";
import type { RouteListItem, RouteResponse } from "@/types/geo";

interface SavedRoutesProps {
  savedRoutes: RouteListItem[];
  activeRouteId: number | null;
  loadedRouteDetails: RouteResponse | null;
  loading: boolean;
  onLoadRoute: (routeId: number) => void;
  onDeleteRoute: (routeId: number) => Promise<void>;
  onRenameRoute: (routeId: number, name: string) => Promise<void>;
  onClearLoadedRoute: () => void;
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

export default function SavedRoutes({
  savedRoutes,
  activeRouteId,
  loadedRouteDetails,
  loading,
  onLoadRoute,
  onDeleteRoute,
  onRenameRoute,
  onClearLoadedRoute,
  collapsed,
  onToggleCollapsed,
  height,
}: SavedRoutesProps) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function startRename(route: RouteListItem) {
    setRenamingId(route.id);
    setRenameValue(route.name);
  }

  async function confirmRename() {
    if (renamingId === null || !renameValue.trim()) return;
    setRenaming(true);
    try {
      await onRenameRoute(renamingId, renameValue.trim());
      setRenamingId(null);
    } finally {
      setRenaming(false);
    }
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  async function handleDelete(routeId: number) {
    setDeletingId(routeId);
    try {
      await onDeleteRoute(routeId);
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
          Saved Routes
          {savedRoutes.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-zinc-400 dark:text-zinc-500">
              ({savedRoutes.length})
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
        {savedRoutes.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            No saved routes yet.
          </p>
        ) : (
          <div className="space-y-1">
            {savedRoutes.map((route) => (
              <div
                key={route.id}
                onClick={() => {
                  if (loading || renamingId === route.id) return;
                  if (activeRouteId === route.id) {
                    onClearLoadedRoute();
                  } else {
                    onLoadRoute(route.id);
                  }
                }}
                className={`cursor-pointer rounded-md border px-2.5 py-2 text-sm transition-colors ${
                  activeRouteId === route.id
                    ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30"
                    : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  {renamingId === route.id ? (
                    <div className="flex flex-1 items-center gap-1">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        disabled={renaming}
                        autoFocus
                        className="min-w-0 flex-1 rounded border border-zinc-300 px-1.5 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                      />
                      <button
                        type="button"
                        onClick={confirmRename}
                        disabled={renaming || !renameValue.trim()}
                        className="text-green-600 hover:text-green-700 disabled:opacity-50 dark:text-green-400"
                        title="Confirm"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        disabled={renaming}
                        className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                        title="Cancel"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        {route.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); startRename(route); }}
                          className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                          title="Rename"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474Z" />
                            <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(route.id); }}
                          disabled={deletingId === route.id}
                          className="rounded p-0.5 text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
                          title="Delete"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                            <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{formatDistance(route.total_distance)}</span>
                  {route.is_loop && (
                    <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      Loop
                    </span>
                  )}
                  {route.is_custom && (
                    <span className="rounded bg-purple-100 px-1 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                      Custom
                    </span>
                  )}
                </div>

                {activeRouteId === route.id && loadedRouteDetails && (
                  <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                    <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                      <p>
                        <span className="font-medium">Distance:</span>{" "}
                        {formatDistance(loadedRouteDetails.total_distance)}
                      </p>
                      <p>
                        <span className="font-medium">Paths:</span>{" "}
                        {loadedRouteDetails.paths_count}
                      </p>
                      {loadedRouteDetails.path_names.length > 0 && (
                        <ul className="ml-3 list-disc text-[11px] text-zinc-500 dark:text-zinc-500">
                          {loadedRouteDetails.path_names.map((name) => (
                            <li key={name}>{name}</li>
                          ))}
                        </ul>
                      )}
                      {loadedRouteDetails.is_loop && (
                        <span className="inline-block rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          Loop
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
