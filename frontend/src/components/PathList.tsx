"use client";

import { useState } from "react";
import CollapsibleSection from "@/components/collapsible-section";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PathFeature } from "@/types/geo";

interface PathListProps {
  paths: PathFeature[];
  walkedPathIds: Set<number>;
  hoveredPathId: number | null;
  onPathHover: (pathId: number | null) => void;
  onPathClick: (pathId: number) => void;

  collapsed: boolean;
  onToggleCollapsed: () => void;
  height: number | string;
}

export default function PathList({
  paths,
  walkedPathIds,
  hoveredPathId,
  onPathHover,
  onPathClick,
  collapsed,
  onToggleCollapsed,
  height,
}: PathListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const deduplicatedPaths = paths
    .filter((path, index, arr) => {
      if (!path.properties.name) return true;
      return (
        arr.findIndex((p) => p.properties.name === path.properties.name) ===
        index
      );
    })
    .sort((a, b) => {
      const nameA = a.properties.name;
      const nameB = b.properties.name;
      if (!nameA && !nameB) return 0;
      if (!nameA) return 1;
      if (!nameB) return -1;
      return nameA.localeCompare(nameB);
    });

  const filteredPaths = searchQuery
    ? deduplicatedPaths.filter((path) =>
        (path.properties.name ?? "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
      )
    : deduplicatedPaths;

  return (
    <CollapsibleSection
      title="Region Paths"
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      height={height}
    >
      <div className="px-4 pt-4">
        <Input
          placeholder="Search paths..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <ScrollArea className="h-full p-4">
        {filteredPaths.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No paths to display.
          </p>
        ) : (
          <ul className="space-y-1">
            {filteredPaths.map((path) => {
              const isWalked = walkedPathIds.has(path.id);
              const isHovered = hoveredPathId === path.id;

              return (
                <li
                  key={path.id}
                  className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm transition-colors ${
                    isHovered
                      ? "bg-accent"
                      : ""
                  }`}
                  onMouseEnter={() => onPathHover(path.id)}
                  onMouseLeave={() => onPathHover(null)}
                  onClick={() => onPathClick(path.id)}
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
