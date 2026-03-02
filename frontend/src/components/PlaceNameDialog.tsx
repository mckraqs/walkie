"use client";

import { useState } from "react";
import { createPlace } from "@/lib/api";
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
      <form
        onSubmit={handleSave}
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Place name..."
          autoFocus
          disabled={saving}
          className="w-48 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? "..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        {error && (
          <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
        )}
      </form>
    </div>
  );
}
