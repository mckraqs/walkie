"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import {
  fetchRegions,
  fetchRegion,
  fetchRegionPaths,
  addFavoriteRegion,
  removeFavoriteRegion,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import RegionExplorer from "@/components/RegionExplorer";
import type {
  RegionListItem,
  RegionFeature,
  PathFeatureCollection,
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

  async function toggleFavorite() {
    const id = Number(selectedRegionId);
    const listItem = regions.find((r) => r.id === id);
    if (!listItem) return;
    const currentlyFavorite = listItem.is_favorite;
    try {
      if (currentlyFavorite) {
        await removeFavoriteRegion(id);
      } else {
        await addFavoriteRegion(id);
      }
      setRegions((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, is_favorite: !r.is_favorite } : r,
        ),
      );
      if (region && region.id === id) {
        setRegion({
          ...region,
          properties: { ...region.properties, is_favorite: !currentlyFavorite },
        });
      }
    } catch {
      // Silently handle
    }
  }

  const isFavorite = regions.find((r) => r.id === Number(selectedRegionId))?.is_favorite ?? false;

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
          />
        )}
      </div>
    </div>
  );
}
