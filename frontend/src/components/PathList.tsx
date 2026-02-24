"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import type { PathFeatureCollection } from "@/types/geo";

function fuzzyMatch(query: string, target: string): boolean {
  if (query === "") return true;
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < lowerTarget.length && qi < lowerQuery.length; ti++) {
    if (lowerTarget[ti] === lowerQuery[qi]) {
      qi++;
    }
  }
  return qi === lowerQuery.length;
}

interface PathListProps {
  paths: PathFeatureCollection;
  walkedPathIds: Set<number>;
  isFavorite: boolean;
  showWalkedOnly: boolean;
  hoveredPathId: number | null;
  onPathHover: (pathId: number | null) => void;
  onToggleWalk: (pathId: number) => void;
}

export default function PathList({
  paths,
  walkedPathIds,
  isFavorite,
  showWalkedOnly,
  hoveredPathId,
  onPathHover,
  onToggleWalk,
}: PathListProps) {
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (hoveredPathId == null) return;
    const el = rowRefs.current.get(hoveredPathId);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [hoveredPathId]);

  const displayedPaths = useMemo(() => {
    let filtered = showWalkedOnly
      ? paths.features.filter((f) => walkedPathIds.has(f.id))
      : paths.features;
    if (searchQuery) {
      filtered = filtered.filter((f) =>
        fuzzyMatch(searchQuery, f.properties.name ?? ""),
      );
    }
    return filtered;
  }, [paths.features, walkedPathIds, showWalkedOnly, searchQuery]);

  return (
    <div className={`absolute right-4 top-4 z-[1000] flex w-72 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg transition-all duration-300 ease-in-out dark:border-zinc-700 dark:bg-zinc-900 ${collapsed ? "max-h-[2.75rem]" : "max-h-[calc(100vh-8rem)]"}`}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={`flex w-full cursor-pointer items-center justify-between px-4 py-3 ${collapsed ? "" : "border-b border-zinc-200 dark:border-zinc-700"}`}
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Paths ({displayedPaths.length})
        </h2>
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
      {isFavorite && (
        <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-700">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search paths..."
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {displayedPaths.map((feature) => {
          const isWalked = walkedPathIds.has(feature.id);
          const isHovered = hoveredPathId === feature.id;
          return (
            <div
              key={feature.id}
              ref={(el) => {
                if (el) {
                  rowRefs.current.set(feature.id, el);
                } else {
                  rowRefs.current.delete(feature.id);
                }
              }}
              className={`flex items-center gap-3 px-4 py-2 cursor-pointer ${
                isHovered
                  ? "bg-blue-50 dark:bg-blue-900/30"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
              onMouseEnter={() => onPathHover(feature.id)}
              onMouseLeave={() => onPathHover(null)}
            >
              <input
                type="checkbox"
                checked={isWalked}
                disabled={!isFavorite}
                onChange={() => onToggleWalk(feature.id)}
                className="h-4 w-4 shrink-0 accent-green-600"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {feature.properties.name || "Unnamed path"}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {feature.properties.category}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
