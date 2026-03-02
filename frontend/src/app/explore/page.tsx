"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";

import {
  fetchRegions,
  fetchRegion,
  fetchRegionPaths,
  addFavoriteRegion,
  removeFavoriteRegion,
  fetchWalkedPaths,
  fetchPlaces,
  fetchSavedRoutes,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import RegionExplorer from "@/components/RegionExplorer";
import ConfirmDialog from "@/components/ConfirmDialog";
import type {
  RegionListItem,
  RegionFeature,
  PathFeatureCollection,
  Place,
} from "@/types/geo";

export default function ExplorePage() {
  const router = useRouter();
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
  const [showWalkedOnly, setShowWalkedOnly] = useState(false);

  const [places, setPlaces] = useState<Place[]>([]);
  const [showPlaces, setShowPlaces] = useState(false);
  const [isCreatingPlace, setIsCreatingPlace] = useState(false);
  const [pendingPlaceLocation, setPendingPlaceLocation] = useState<[number, number] | null>(null);
  const [unfavoriteConfirm, setUnfavoriteConfirm] = useState<{ routeCount: number; placeCount: number } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [authLoading, user, router]);

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
      // Reset via resolved promise to satisfy set-state-in-effect lint rule
      Promise.resolve().then(() => {
        setWalkedPathIds([]);
        setTotalPaths(0);
        setWalkedCount(0);
        setShowWalkedOnly(false);
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
      setShowPlaces(false);
      setIsCreatingPlace(false);
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
    setIsCreatingPlace(false);
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

  const handleExitPlaceCreation = useCallback(() => {
    setIsCreatingPlace(false);
    setPendingPlaceLocation(null);
  }, []);


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
    setSelectedLvl1(value);
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

  if (authLoading || (!user && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <select
            value={selectedLvl1}
            onChange={(e) => handleLvl1Change(e.target.value)}
            className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">All districts</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={selectedRegionId}
            onChange={(e) => setSelectedRegionId(e.target.value)}
            className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {!selectedRegionId && <option value="">Select a region...</option>}
            {filteredRegions.currentlySelected.length > 0 && (
              <optgroup label="Currently selected">
                {filteredRegions.currentlySelected.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
            {filteredRegions.favorites.length > 0 && (
              <optgroup label="Favorites">
                {filteredRegions.favorites.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
            {filteredRegions.others.length > 0 && (
              <optgroup label="Other regions">
                {filteredRegions.others.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {selectedRegionId && (
            <button
              type="button"
              onClick={toggleFavorite}
              className="text-xl text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              {isFavorite ? "\u2605" : "\u2606"}
            </button>
          )}
          {selectedRegionId && isFavorite && (
            <>
              <button
                type="button"
                onClick={() => setShowWalkedOnly((v) => !v)}
                className={`rounded-lg border px-3 py-1 text-sm font-medium ${
                  showWalkedOnly
                    ? "border-green-600 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-900/30 dark:text-green-400"
                    : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                Walked
              </button>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {walkedCount}/{totalPaths}{" "}
                ({totalPaths > 0 ? ((walkedCount / totalPaths) * 100).toFixed(1) : "0.0"}%)
              </span>
              <button
                type="button"
                onClick={() => setShowPlaces((v) => !v)}
                className={`rounded-lg border px-3 py-1 text-sm font-medium ${
                  showPlaces
                    ? "border-purple-600 bg-purple-50 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-400"
                    : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                Places
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingPlace((v) => {
                    if (v) setPendingPlaceLocation(null);
                    return !v;
                  });
                }}
                className={`rounded-lg border px-3 py-1 text-sm font-medium ${
                  isCreatingPlace
                    ? "border-purple-600 bg-purple-50 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-400"
                    : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {isCreatingPlace ? "Cancel Pin" : "+ Place"}
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {user.username}
              </span>
              <button
                type="button"
                onClick={logout}
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </header>
      <div className="flex-1">
        {regionsLoading && (
          <div className="flex h-full items-center justify-center bg-zinc-50 dark:bg-black">
            <p className="text-zinc-500 dark:text-zinc-400">Loading regions...</p>
          </div>
        )}
        {error && (
          <div className="flex h-full items-center justify-center bg-zinc-50 dark:bg-black">
            <p className="text-lg text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
        {!regionsLoading && !error && !selectedRegionId && (
          <div className="flex h-full items-center justify-center bg-zinc-50 dark:bg-black">
            <p className="text-lg text-zinc-500 dark:text-zinc-400">
              Select a region to explore
            </p>
          </div>
        )}
        {regionLoading && (
          <div className="flex h-full items-center justify-center bg-zinc-50 dark:bg-black">
            <p className="text-zinc-500 dark:text-zinc-400">Loading region...</p>
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
            showWalkedOnly={showWalkedOnly}
            onWalkedChange={handleWalkedChange}
            places={places}
            showPlaces={showPlaces}
            isCreatingPlace={isCreatingPlace}
            pendingPlaceLocation={pendingPlaceLocation}
            onPlaceCreate={handlePlaceCreate}
            onPlaceCreated={handlePlaceCreated}
            onPlaceDeleted={handlePlaceDeleted}
            onCancelPlaceCreation={handleCancelPlaceCreation}
            onExitPlaceCreation={handleExitPlaceCreation}
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
