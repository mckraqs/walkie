"use client";

import CollapsibleSection from "@/components/collapsible-section";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PathFeature } from "@/types/geo";

interface PathListProps {
  paths: PathFeature[];
  walkedPathIds: Set<number>;
  showWalkedOnly: boolean;
  hoveredPathId: number | null;
  onPathHover: (pathId: number | null) => void;

  collapsed: boolean;
  onToggleCollapsed: () => void;
  height: number | string;
}

export default function PathList({
  paths,
  walkedPathIds,
  showWalkedOnly,
  hoveredPathId,
  onPathHover,
  collapsed,
  onToggleCollapsed,
  height,
}: PathListProps) {
  const visiblePaths = showWalkedOnly
    ? paths.filter((p) => walkedPathIds.has(p.id))
    : paths;

  const deduplicatedPaths = visiblePaths.filter((path, index, arr) => {
    if (!path.properties.name) return true;
    return (
      arr.findIndex((p) => p.properties.name === path.properties.name) === index
    );
  });

  return (
    <CollapsibleSection
      title="Region Paths"
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      height={height}
    >
      <ScrollArea className="h-full p-4">
        {deduplicatedPaths.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No paths to display.
          </p>
        ) : (
          <ul className="space-y-1">
            {deduplicatedPaths.map((path) => {
              const isWalked = walkedPathIds.has(path.id);
              const isHovered = hoveredPathId === path.id;

              return (
                <li
                  key={path.id}
                  className={`flex items-center justify-between rounded px-2 py-1.5 text-sm transition-colors ${
                    isHovered
                      ? "bg-accent"
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
                    <span className="truncate font-medium">
                      {path.properties.name || "Unnamed"}
                    </span>
                    <span className="flex-shrink-0 text-xs text-muted-foreground">
                      {path.properties.category}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </CollapsibleSection>
  );
}
