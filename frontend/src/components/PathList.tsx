"use client";

import { useRef, useEffect } from "react";
import type { PathFeatureCollection } from "@/types/geo";

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

  useEffect(() => {
    if (hoveredPathId == null) return;
    const el = rowRefs.current.get(hoveredPathId);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [hoveredPathId]);

  const displayedPaths = showWalkedOnly
    ? paths.features.filter((f) => walkedPathIds.has(f.id))
    : paths.features;

  return (
    <div className="absolute right-4 top-4 z-[1000] flex w-72 max-h-[calc(100vh-8rem)] flex-col rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Paths ({displayedPaths.length})
        </h2>
      </div>
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
