"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseAndSimplifyGpx } from "@/lib/gpx";

interface UploadGpxDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    walked_at: string;
    geometry: { type: "LineString"; coordinates: [number, number][] };
  }) => void;
}

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function UploadGpxDialog({
  open,
  onClose,
  onSubmit,
}: UploadGpxDialogProps) {
  const [name, setName] = useState("");
  const [walkedAt, setWalkedAt] = useState(todayString);
  const [submitting, setSubmitting] = useState(false);
  const [coordinates, setCoordinates] = useState<[number, number][] | null>(null);
  const [rawCount, setRawCount] = useState(0);
  const [simplifiedCount, setSimplifiedCount] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setWalkedAt(todayString());
      setSubmitting(false);
      setCoordinates(null);
      setRawCount(0);
      setSimplifiedCount(0);
      setParseError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setCoordinates(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = parseAndSimplifyGpx(reader.result as string);
        setCoordinates(result.coordinates);
        setRawCount(result.raw);
        setSimplifiedCount(result.simplified);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Failed to parse GPX file.");
        setCoordinates(null);
      }
    };
    reader.onerror = () => {
      setParseError("Failed to read file.");
    };
    reader.readAsText(file);
  }

  function handleSubmit() {
    if (!coordinates || !name.trim() || !walkedAt) return;
    setSubmitting(true);
    onSubmit({
      name: name.trim(),
      walked_at: walkedAt,
      geometry: { type: "LineString", coordinates },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload GPX Walk</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="gpx-file">GPX File</Label>
            <Input
              id="gpx-file"
              type="file"
              accept=".gpx"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            {coordinates && (
              <p className="text-xs text-muted-foreground">
                {rawCount.toLocaleString()} points loaded (simplified to {simplifiedCount.toLocaleString()})
              </p>
            )}
            {parseError && (
              <p className="text-xs text-destructive">{parseError}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gpx-walk-name">Name</Label>
            <Input
              id="gpx-walk-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Walk name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gpx-walk-date">Date</Label>
            <Input
              id="gpx-walk-date"
              type="date"
              value={walkedAt}
              onChange={(e) => setWalkedAt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !coordinates || !name.trim() || !walkedAt}
          >
            {submitting ? "Creating..." : "Create Walk"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
