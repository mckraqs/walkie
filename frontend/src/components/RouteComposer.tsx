"use client";

import { useState } from "react";
import { formatDistance } from "@/lib/geo";
import CollapsibleSection from "@/components/collapsible-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
    <CollapsibleSection
      title="Route Composer"
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      height={height}
    >
      <div className="flex-1 overflow-y-auto p-4">
        {!composing ? (
          <Button
            disabled={!isFavorite}
            onClick={onStartComposing}
            className="w-full"
          >
            Start Composing
          </Button>
        ) : (
          <div className="space-y-3">
            {selectedSegmentCount > 0 && (
              <div className="space-y-1 text-sm">
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
                    <Badge variant="secondary">Loop</Badge>
                  </p>
                )}
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onUndoLast}
                    className="flex-1"
                  >
                    Undo Last
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onClearAll}
                    className="flex-1"
                  >
                    Clear All
                  </Button>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={onStopComposing}
              className="w-full"
            >
              Stop Composing
            </Button>

            {selectedSegmentCount > 0 && !showSaveInput && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRouteName("Custom Route");
                  setShowSaveInput(true);
                  setSaveError(null);
                }}
                className="w-full border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
              >
                Save Route
              </Button>
            )}

            {showSaveInput && (
              <div className="space-y-1">
                <Input
                  type="text"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  disabled={saving}
                  placeholder="Route name"
                />
                <div className="flex gap-1">
                  <Button
                    size="sm"
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
                    className="flex-1"
                  >
                    {saving ? "..." : "Confirm"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowSaveInput(false);
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

            {composerError && (
              <p className="text-xs text-destructive">{composerError}</p>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
