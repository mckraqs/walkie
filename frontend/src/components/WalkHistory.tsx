"use client";

import { useState } from "react";
import { Pencil, Check, X, Plus } from "lucide-react";
import { formatDistance } from "@/lib/geo";
import CollapsibleSection from "@/components/collapsible-section";
import AddWalkDialog from "@/components/AddWalkDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { WalkListItem, RouteListItem, MatchGeometryResponse } from "@/types/geo";

interface WalkHistoryProps {
  walks: WalkListItem[];
  savedRoutes: RouteListItem[];
  activeWalkId: number | null;
  onLoadWalk: (walkId: number) => void;
  onDeleteWalk: (walkId: number) => Promise<void>;
  onRenameWalk: (walkId: number, name: string) => Promise<void>;
  onAddWalkFromRoute: (data: { route_id: number; name: string; walked_at: string }) => void;
  onAddWalkByDrawing: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  height: string;
  drawingForWalk: boolean;
  drawnVertexCount: number;
  drawMatchResult: MatchGeometryResponse | null;
  drawMatchLoading: boolean;
  onDrawUndo: () => void;
  onStopDrawing: () => void;
  onSaveDrawnWalk: (name: string, walkedAt: string) => Promise<void>;
}

function formatWalkDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function todayString(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function WalkHistory({
  walks,
  savedRoutes,
  activeWalkId,
  onLoadWalk,
  onDeleteWalk,
  onRenameWalk,
  onAddWalkFromRoute,
  onAddWalkByDrawing,
  collapsed,
  onToggleCollapsed,
  height,
  drawingForWalk,
  drawnVertexCount,
  drawMatchResult,
  drawMatchLoading,
  onDrawUndo,
  onStopDrawing,
  onSaveDrawnWalk,
}: WalkHistoryProps) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [walkName, setWalkName] = useState("");
  const [walkDate, setWalkDate] = useState(todayString());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startRename(walk: WalkListItem) {
    setRenamingId(walk.id);
    setRenameValue(walk.name);
  }

  async function confirmRename() {
    if (renamingId === null || !renameValue.trim()) return;
    setRenaming(true);
    try {
      await onRenameWalk(renamingId, renameValue.trim());
      setRenamingId(null);
    } finally {
      setRenaming(false);
    }
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  async function handleDelete(walkId: number) {
    setDeletingId(walkId);
    try {
      await onDeleteWalk(walkId);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <CollapsibleSection
        title="My Walks"
        badge={drawingForWalk ? "(drawing)" : walks.length > 0 ? `(${walks.length})` : undefined}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        height={height}
      >
        <div className="flex-1 overflow-y-auto p-3">
          {drawingForWalk ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Click on the map to place vertices. Matched segments update as you draw.
              </p>

              {drawnVertexCount > 0 && (
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">Vertices:</span>{" "}
                    {drawnVertexCount}
                  </p>
                  {drawMatchResult && (
                    <>
                      <p>
                        <span className="font-medium">Matched segments:</span>{" "}
                        {drawMatchResult.matched_count}
                      </p>
                      <p>
                        <span className="font-medium">Distance:</span>{" "}
                        {formatDistance(drawMatchResult.total_distance)}
                      </p>
                      {drawMatchResult.street_names.length > 0 && (
                        <ul className="ml-4 list-disc text-xs text-muted-foreground">
                          {drawMatchResult.street_names.map((name) => (
                            <li key={name}>{name}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {drawMatchLoading && (
                    <p className="text-xs text-muted-foreground">Matching...</p>
                  )}
                </div>
              )}

              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDrawUndo}
                  disabled={drawnVertexCount === 0}
                  className="flex-1"
                >
                  Undo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onStopDrawing}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>

              {drawnVertexCount >= 2 && !drawMatchLoading && !showSaveForm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const names = drawMatchResult?.street_names ?? [];
                    const defaultName =
                      names.length > 1
                        ? `${names[0]} -> ${names[names.length - 1]}`
                        : names.length === 1
                          ? names[0]
                          : "Drawn Walk";
                    setWalkName(defaultName);
                    setWalkDate(todayString());
                    setShowSaveForm(true);
                    setSaveError(null);
                  }}
                  className="w-full border-green-300 text-green-600 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/30"
                >
                  Save Walk
                </Button>
              )}

              {showSaveForm && (
                <div className="space-y-2">
                  <Input
                    type="text"
                    value={walkName}
                    onChange={(e) => setWalkName(e.target.value)}
                    disabled={saving}
                    placeholder="Walk name"
                  />
                  <Input
                    type="date"
                    value={walkDate}
                    onChange={(e) => setWalkDate(e.target.value)}
                    disabled={saving}
                  />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      disabled={saving || !walkName.trim() || !walkDate}
                      onClick={async () => {
                        setSaving(true);
                        setSaveError(null);
                        try {
                          await onSaveDrawnWalk(walkName.trim(), walkDate);
                          setShowSaveForm(false);
                        } catch (err) {
                          setSaveError(
                            err instanceof Error ? err.message : "Failed to save",
                          );
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="flex-1"
                    >
                      {saving ? "..." : "Confirm"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowSaveForm(false);
                        setSaveError(null);
                      }}
                      disabled={saving}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                  {saveError && (
                    <p className="text-xs text-destructive">{saveError}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                      Add Walk
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setAddDialogOpen(true)}>
                      From Saved Route
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onAddWalkByDrawing}>
                      Draw on Map
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {walks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No walks recorded yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {walks.map((walk) => (
                    <div
                      key={walk.id}
                      onClick={() => {
                        if (renamingId === walk.id) return;
                        onLoadWalk(walk.id);
                      }}
                      className={`cursor-pointer rounded-md border px-2.5 py-2 text-sm transition-colors ${
                        activeWalkId === walk.id
                          ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/30"
                          : "border-transparent hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        {renamingId === walk.id ? (
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
                              {walk.name}
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
                                <DropdownMenuItem onClick={() => startRename(walk)}>
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDelete(walk.id)}
                                  disabled={deletingId === walk.id}
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
                        <span>{formatWalkDate(walk.walked_at)}</span>
                        <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                          {formatDistance(walk.distance)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleSection>
      <AddWalkDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        savedRoutes={savedRoutes}
        onSubmit={(data) => {
          setAddDialogOpen(false);
          onAddWalkFromRoute(data);
        }}
      />
    </>
  );
}
