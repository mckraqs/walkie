"use client";

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { downloadRouteFile } from "@/lib/gpx";
import { formatDistance } from "@/lib/geo";
import CollapsibleSection from "@/components/collapsible-section";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  onRouteHover: (routeId: number | null) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  height: string;
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
  onRouteHover,
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
    <CollapsibleSection
      title="My Routes"
      badge={
        savedRoutes.length > 0
          ? `(${savedRoutes.length})`
          : undefined
      }
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      height={height}
    >
      <div className="flex-1 overflow-y-auto p-3">
        {savedRoutes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
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
                onMouseEnter={() => onRouteHover(route.id)}
                onMouseLeave={() => onRouteHover(null)}
                className={`cursor-pointer rounded-md border px-2.5 py-2 text-sm transition-colors ${
                  activeRouteId === route.id
                    ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30"
                    : "border-transparent hover:bg-accent"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  {renamingId === route.id ? (
                    <div className="flex flex-1 items-center gap-1">
                      <Input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        disabled={renaming}
                        autoFocus
                        className="min-w-0 flex-1 h-6 px-1.5 py-0.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={confirmRename}
                        disabled={renaming || !renameValue.trim()}
                        className="text-green-600 hover:text-green-700 disabled:opacity-50 dark:text-green-400"
                        title="Confirm"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        disabled={renaming}
                        className="text-muted-foreground hover:text-foreground"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-left text-xs font-medium">
                        {route.name}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                            title="Actions"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => startRename(route)}>
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(route.id)}
                            disabled={deletingId === route.id}
                            className="text-destructive"
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{formatDistance(route.total_distance)}</span>
                  {route.is_loop && (
                    <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                      Loop
                    </Badge>
                  )}
                </div>

                {activeRouteId === route.id && loadedRouteDetails && (
                  <div className="mt-2 border-t border-border pt-2">
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>
                        <span className="font-medium">Distance:</span>{" "}
                        {formatDistance(loadedRouteDetails.total_distance)}
                      </p>
                      <p>
                        <span className="font-medium">Paths:</span>{" "}
                        {loadedRouteDetails.paths_count}
                      </p>
                      {loadedRouteDetails.path_names.length > 0 && (
                        <ul className="ml-3 list-disc text-[11px]">
                          {loadedRouteDetails.path_names.map((name) => (
                            <li key={name}>{name}</li>
                          ))}
                        </ul>
                      )}
                      {loadedRouteDetails.is_loop && (
                        <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                          Loop
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadRouteFile(loadedRouteDetails, route.name, "gpx");
                        }}
                        className="mt-1"
                      >
                        Download GPX
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
