"use client";

import type { PathFeature } from "@/types/geo";

interface PathListProps {
  paths: PathFeature[];
  walkedPathIds: Set<number>;
  showWalkedOnly: boolean;
  hoveredPathId: number | null;
  onPathHover: (pathId: number | null) => void;
  onToggleWalk: (pathId: number) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  maxHeight: number | string;
}

export default function PathList({
  paths,
  walkedPathIds,
  showWalkedOnly,
  hoveredPathId,
  onPathHover,
  onToggleWalk,
  collapsed,
  onToggleCollapsed,
  maxHeight,
}: PathListProps) {
  const visiblePaths = showWalkedOnly
    ? paths.filter((p) => walkedPathIds.has(p.id))
    : paths;

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg transition-all duration-300 ease-in-out dark:border-zinc-700 dark:bg-zinc-900"
      style={{ height: maxHeight }}
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        className={`flex w-full cursor-pointer items-center justify-between px-4 py-3 ${collapsed ? "" : "border-b border-zinc-200 dark:border-zinc-700"}`}
      >
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Path List
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
        {visiblePaths.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            No paths to display.
          </p>
        ) : (
          <ul className="space-y-1">
            {visiblePaths.map((path) => {
              const isWalked = walkedPathIds.has(path.id);
              const isHovered = hoveredPathId === path.id;

              return (
                <li
                  key={path.id}
                  className={`flex items-center justify-between rounded px-2 py-1.5 text-sm transition-colors ${
                    isHovered
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : ""
                  }`}
                  onMouseEnter={() => onPathHover(path.id)}
                  onMouseLeave={() => onPathHover(null)}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {isWalked && (
                      <span
                        className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-green-500"
                        title="Walked"
                      />
                    )}
                    <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                      {path.properties.name || "Unnamed"}
                    </span>
                    <span className="flex-shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                      {path.properties.category}
                    </span>
                  </div>
                  {isFavorite && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleWalk(path.id);
                      }}
                      className={`ml-2 flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                        isWalked
                          ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      }`}
                      title={isWalked ? "Mark as not walked" : "Mark as walked"}
                    >
                      {isWalked ? "Walked" : "Walk"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
