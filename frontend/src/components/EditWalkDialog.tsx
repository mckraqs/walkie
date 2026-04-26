"use client";

import { useState, useEffect } from "react";
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
import type { WalkListItem } from "@/types/geo";

interface EditWalkDialogProps {
  open: boolean;
  walk: WalkListItem | null;
  onClose: () => void;
  onSubmit: (data: { name: string; walked_at: string }) => void;
  onDelete: () => void;
}

export default function EditWalkDialog({
  open,
  walk,
  onClose,
  onSubmit,
  onDelete,
}: EditWalkDialogProps) {
  const [name, setName] = useState("");
  const [walkedAt, setWalkedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open && walk) {
      setName(walk.name);
      setWalkedAt(walk.walked_at);
      setSubmitting(false);
      setDeleting(false);
    }
  }, [open, walk]);

  function handleSubmit() {
    if (!name.trim() || !walkedAt) return;
    setSubmitting(true);
    onSubmit({ name: name.trim(), walked_at: walkedAt });
  }

  function handleDelete() {
    setDeleting(true);
    onDelete();
  }

  const busy = submitting || deleting;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Walk</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-walk-name">Name</Label>
            <Input
              id="edit-walk-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Walk name"
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-walk-date">Date</Label>
            <Input
              id="edit-walk-date"
              type="date"
              value={walkedAt}
              onChange={(e) => setWalkedAt(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={busy}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={busy || !name.trim() || !walkedAt}
            >
              {submitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
