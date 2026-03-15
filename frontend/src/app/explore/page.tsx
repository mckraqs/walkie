"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Star } from "lucide-react";

import {
  fetchRegions,
  fetchRegion,
  fetchRegionPaths,
  addFavoriteRegion,
  removeFavoriteRegion,
  fetchWalkedPaths,
  fetchPlaces,
  fetchSavedRoutes,
  deletePlace,
  updatePlace,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import LoginForm from "@/components/LoginForm";
import RegionExplorer from "@/components/RegionExplorer";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  RegionListItem,
  RegionFeature,
  PathFeatureCollection,
  Place,
} from "@/types/geo";

const NO_DISTRICT = "__all__";

export default function ExplorePage() {
  const { user, loading: authLoading, logout } = useAuth();

  const [regions, setRegions] = useState<RegionListItem[]>([]);
  const [selectedLvl1, setSelectedLvl1] = useState("");
  const [selectedRegionId, setSelectedRegionId] = useState("");

  const [region, setRegion] = useState<RegionFeature | null>(null);
  const [paths, setPaths] = useState<PathFeatureCollection | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [walkedPathIds, setWalkedPathIds] = useState<number[]>([]);
  const [totalPaths, setTotalPaths] = useState(0);
  const [walkedCount, setWalkedCount] = useState(0);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeCreationMode, setPlaceCreationMode] = useState<"pin" | "search" | null>(null);
  const [pendingPlaceLocation, setPendingPlaceLocation] = useState<[number, number] | null>(null);
  const [unfavoriteConfirm, setUnfavoriteConfirm] = useState<{ routeCount: number; placeCount: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    setRegionsLoading(true);
    fetchRegions()
      .then(setRegions)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load regions");
      })
      .finally(() => setRegionsLoading(false));
  }, [user]);

  useEffect(() => {
    if (!selectedRegionId || !user) {
      setRegion(null);
      setPaths(null);
      return;
    }
    setRegionLoading(true);
    setError(null);
    Promise.all([fetchRegion(selectedRegionId), fetchRegionPaths(selectedRegionId)])
      .then(([regionData, pathsData]) => {
        setRegion(regionData);
        setPaths(pathsData);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load region");
        setRegion(null);
        setPaths(null);
      })
      .finally(() => setRegionLoading(false));
  }, [selectedRegionId, user]);

  const isFavorite = regions.find((r) => r.id === Number(selectedRegionId))?.is_favorite ?? false;

  useEffect(() => {
    if (!selectedRegionId || !user || !isFavorite) {
      Promise.resolve().then(() => {
        setWalkedPathIds([]);
        setTotalPaths(0);
        setWalkedCount(0);
      });
      return;
    }
    fetchWalkedPaths(selectedRegionId)
      .then((data) => {
        setWalkedPathIds(data.walked_path_ids);
        setTotalPaths(data.total_paths);
        setWalkedCount(data.walked_count);
      })
      .catch(() => {
        setWalkedPathIds([]);
        setTotalPaths(0);
        setWalkedCount(0);
      });
  }, [selectedRegionId, user, isFavorite]);

  useEffect(() => {
    if (!selectedRegionId || !user || !isFavorite) {
      setPlaces([]);
      setPlaceCreationMode(null);
      setPendingPlaceLocation(null);
      return;
    }
    fetchPlaces(selectedRegionId)
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, [selectedRegionId, user, isFavorite]);

  const handleWalkedChange = useCallback((newWalkedPathIds: number[], newTotalPaths: number, newWalkedCount: number) => {
    setWalkedPathIds(newWalkedPathIds);
    setTotalPaths(newTotalPaths);
    setWalkedCount(newWalkedCount);
  }, []);

  const handlePlaceCreate = useCallback((location: [number, number]) => {
    setPendingPlaceLocation(location);
  }, []);

  const handlePlaceCreated = useCallback((place: Place) => {
    setPendingPlaceLocation(null);
    setPlaceCreationMode(null);
    setPlaces((prev) => [...prev, place]);
  }, []);

  const handlePlaceDeleted = useCallback(() => {
    if (selectedRegionId) {
      fetchPlaces(selectedRegionId)
        .then(setPlaces)
        .catch(() => setPlaces([]));
    }
  }, [selectedRegionId]);

  const handleCancelPlaceCreation = useCallback(() => {
    setPendingPlaceLocation(null);
  }, []);

  const handleSetPlaceCreationMode = useCallback((mode: "pin" | "search" | null) => {
    if (mode === null) setPendingPlaceLocation(null);
    setPlaceCreationMode(mode);
  }, []);

  const handleRenamePlace = useCallback(async (placeId: number, newName: string) => {
    if (!selectedRegionId) return;
    const updated = await updatePlace(selectedRegionId, placeId, { name: newName });
    setPlaces((prev) => prev.map((p) => (p.id === placeId ? updated : p)));
  }, [selectedRegionId]);

  const handleDeletePlace = useCallback(
    async (placeId: number) => {
      if (!selectedRegionId) return;
      await deletePlace(selectedRegionId, placeId);
      setPlaces((prev) => prev.filter((p) => p.id !== placeId));
    },
    [selectedRegionId],
  );


  const districts = useMemo(
    () =>
      [...new Set(regions.map((r) => r.administrative_district_lvl_1))]
        .filter(Boolean)
        .sort(),
    [regions],
  );

  const filteredRegions = useMemo(() => {
    const selectedId = Number(selectedRegionId);
    let result = regions;
    if (selectedLvl1) {
      result = result.filter((r) => r.administrative_district_lvl_1 === selectedLvl1);
    }
    const selectedItem = selectedId
      ? regions.find((r) => r.id === selectedId)
      : undefined;
    const isSelectedOutsideFilter =
      selectedItem && !result.some((r) => r.id === selectedId);
    const currentlySelected = isSelectedOutsideFilter ? [selectedItem] : [];
    const favorites = result.filter((r) => r.is_favorite).sort((a, b) => a.name.localeCompare(b.name));
    const others = result.filter((r) => !r.is_favorite).sort((a, b) => a.name.localeCompare(b.name));
    return { currentlySelected, favorites, others };
  }, [regions, selectedLvl1, selectedRegionId]);

  function handleLvl1Change(value: string) {
    setSelectedLvl1(value === NO_DISTRICT ? "" : value);
  }

  function handleRegionChange(value: string) {
    setSelectedRegionId(value);
  }

  function buildUnfavoriteMessage(routeCount: number, placeCount: number): string {
    const parts: string[] = [];
    if (routeCount > 0) parts.push(`${routeCount} saved route${routeCount === 1 ? "" : "s"}`);
    if (placeCount > 0) parts.push(`${placeCount} saved place${placeCount === 1 ? "" : "s"}`);
    return `This will permanently delete ${parts.join(" and ")} in this region. This action cannot be undone.`;
  }

  async function executeUnfavorite() {
    const id = Number(selectedRegionId);
    try {
      await removeFavoriteRegion(id);
      setRegions((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, is_favorite: false } : r,
        ),
      );
      if (region && region.id === id) {
        setRegion({
          ...region,
          properties: { ...region.properties, is_favorite: false },
        });
      }
    } catch {
      // Silently handle
    }
    setUnfavoriteConfirm(null);
  }

  async function executeFavorite() {
    const id = Number(selectedRegionId);
    try {
      await addFavoriteRegion(id);
      setRegions((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, is_favorite: true } : r,
        ),
      );
      if (region && region.id === id) {
        setRegion({
          ...region,
          properties: { ...region.properties, is_favorite: true },
        });
      }
      fetchWalkedPaths(selectedRegionId)
        .then((data) => {
          setWalkedPathIds(data.walked_path_ids);
          setTotalPaths(data.total_paths);
          setWalkedCount(data.walked_count);
        })
        .catch(() => {
          setWalkedPathIds([]);
          setTotalPaths(0);
          setWalkedCount(0);
        });
    } catch {
      // Silently handle
    }
  }

  async function toggleFavorite() {
    const id = Number(selectedRegionId);
    const listItem = regions.find((r) => r.id === id);
    if (!listItem) return;

    if (listItem.is_favorite) {
      try {
        const routes = await fetchSavedRoutes(selectedRegionId);
        const routeCount = routes.length;
        const placeCount = places.length;
        if (routeCount > 0 || placeCount > 0) {
          setUnfavoriteConfirm({ routeCount, placeCount });
          return;
        }
      } catch {
        // If fetch fails, proceed without confirmation
      }
      await executeUnfavorite();
    } else {
      await executeFavorite();
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background font-sans">
        <div className="fixed right-4 top-4">
          <ThemeToggle />
        </div>
        <main className="flex w-full max-w-md flex-col items-center gap-8 px-6">
          <h1 className="text-4xl font-bold tracking-tight">Walkie</h1>
          <p className="text-center text-lg text-muted-foreground">
            Explore paths and streets within a region.
          </p>
          <LoginForm />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Select
            value={selectedLvl1 || NO_DISTRICT}
            onValueChange={handleLvl1Change}
          >
            <SelectTrigger className="h-9 w-auto min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DISTRICT}>All districts</SelectItem>
              {districts.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedRegionId || ""}
            onValueChange={handleRegionChange}
          >
            <SelectTrigger className="h-9 w-auto min-w-[180px]">
              <SelectValue placeholder="Select a region..." />
            </SelectTrigger>
            <SelectContent position="popper">
              {filteredRegions.currentlySelected.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Currently selected</SelectLabel>
                  {filteredRegions.currentlySelected.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {filteredRegions.favorites.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Favorite Regions</SelectLabel>
                  {filteredRegions.favorites.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {filteredRegions.others.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Other Regions</SelectLabel>
                  {filteredRegions.others.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          {selectedRegionId && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFavorite}
              className="h-8 w-8"
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Star className={`h-5 w-5 ${isFavorite ? "fill-current text-yellow-500" : "text-muted-foreground"}`} />
            </Button>
          )}
          {selectedRegionId && isFavorite && (
            <>
              <Badge variant="secondary">
                {walkedCount}/{totalPaths}{" "}
                ({totalPaths > 0 ? ((walkedCount / totalPaths) * 100).toFixed(1) : "0.0"}%)
              </Badge>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <>
              <span className="text-sm text-muted-foreground">
                {user.username}
              </span>
              <Button variant="ghost" size="sm" onClick={logout}>
                Logout
              </Button>
            </>
          )}
          <ThemeToggle />
        </div>
      </header>
      <div className="flex-1">
        {regionsLoading && (
          <div className="flex h-full items-center justify-center bg-background">
            <p className="text-muted-foreground">Loading regions...</p>
          </div>
        )}
        {error && (
          <div className="flex h-full items-center justify-center bg-background">
            <p className="text-lg text-destructive">{error}</p>
          </div>
        )}
        {!regionsLoading && !error && !selectedRegionId && (
          <div className="flex h-full items-center justify-center bg-background">
            <p className="text-lg text-muted-foreground">
              Select a region to explore
            </p>
          </div>
        )}
        {regionLoading && (
          <div className="flex h-full items-center justify-center bg-background">
            <p className="text-muted-foreground">Loading region...</p>
          </div>
        )}
        {!regionLoading && region && paths && selectedRegionId && (
          <RegionExplorer
            key={selectedRegionId}
            regionId={selectedRegionId}
            region={region}
            paths={paths}
            isFavorite={isFavorite}
            walkedPathIds={new Set(walkedPathIds)}
            onWalkedChange={handleWalkedChange}
            places={places}
            placeCreationMode={placeCreationMode}
            pendingPlaceLocation={pendingPlaceLocation}
            onPlaceCreate={handlePlaceCreate}
            onPlaceCreated={handlePlaceCreated}
            onPlaceDeleted={handlePlaceDeleted}
            onCancelPlaceCreation={handleCancelPlaceCreation}
            onSetPlaceCreationMode={handleSetPlaceCreationMode}
            onDeletePlace={handleDeletePlace}
            onRenamePlace={handleRenamePlace}
          />
        )}
      </div>
      {unfavoriteConfirm && (
        <ConfirmDialog
          title="Remove from favorites?"
          message={buildUnfavoriteMessage(unfavoriteConfirm.routeCount, unfavoriteConfirm.placeCount)}
          confirmLabel="Remove"
          cancelLabel="Keep"
          onConfirm={executeUnfavorite}
          onCancel={() => setUnfavoriteConfirm(null)}
        />
      )}
    </div>
  );
}
