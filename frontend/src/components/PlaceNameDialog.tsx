"use client";

import { useState } from "react";
import { createPlace } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Place } from "@/types/geo";

interface PlaceNameDialogProps {
  regionId: string;
  location: [number, number];
  onCreated: (place: Place) => void;
  onCancel: () => void;
}

export default function PlaceNameDialog({
  regionId,
  location,
  onCreated,
  onCancel,
}: PlaceNameDialogProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const place = await createPlace(regionId, { name: name.trim(), location });
      onCreated(place);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create place");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute bottom-4 left-1/2 z-[1001] -translate-x-1/2">
      <Card className="p-0">
        <form
          onSubmit={handleSave}
          className="flex items-center gap-2 px-4 py-3"
        >
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Place name..."
            autoFocus
            disabled={saving}
            className="w-48"
          />
          <Button
            type="submit"
            disabled={saving || !name.trim()}
            size="sm"
          >
            {saving ? "..." : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          {error && (
            <span className="text-xs text-destructive">{error}</span>
          )}
        </form>
      </Card>
    </div>
  );
}
