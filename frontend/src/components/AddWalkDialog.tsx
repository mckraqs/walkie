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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RouteListItem } from "@/types/geo";

interface AddWalkDialogProps {
  open: boolean;
  onClose: () => void;
  savedRoutes: RouteListItem[];
  onSubmit: (data: { route_id: number; name: string; walked_at: string }) => void;
}

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AddWalkDialog({
  open,
  onClose,
  savedRoutes,
  onSubmit,
}: AddWalkDialogProps) {
  const [routeId, setRouteId] = useState<string>("");
  const [name, setName] = useState("");
  const [walkedAt, setWalkedAt] = useState(todayString);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setRouteId("");
      setName("");
      setWalkedAt(todayString());
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (routeId) {
      const route = savedRoutes.find((r) => r.id === Number(routeId));
      if (route) setName(route.name);
    }
  }, [routeId, savedRoutes]);

  function handleSubmit() {
    if (!routeId || !name.trim() || !walkedAt) return;
    setSubmitting(true);
    onSubmit({ route_id: Number(routeId), name: name.trim(), walked_at: walkedAt });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Walk from Saved Route</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="walk-route">Route</Label>
            <Select value={routeId} onValueChange={setRouteId}>
              <SelectTrigger id="walk-route">
                <SelectValue placeholder="Select a route..." />
              </SelectTrigger>
              <SelectContent>
                {savedRoutes.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walk-name">Name</Label>
            <Input
              id="walk-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Walk name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walk-date">Date</Label>
            <Input
              id="walk-date"
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
            disabled={submitting || !routeId || !name.trim() || !walkedAt}
          >
            {submitting ? "Creating..." : "Create Walk"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
