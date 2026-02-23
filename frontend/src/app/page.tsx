"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { fetchRegions, addFavoriteRegion, removeFavoriteRegion } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import LoginForm from "@/components/LoginForm";
import type { RegionListItem } from "@/types/geo";

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [regions, setRegions] = useState<RegionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLvl1, setSelectedLvl1] = useState("");
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchRegions()
      .then(setRegions)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load regions");
      })
      .finally(() => setLoading(false));
  }, [user]);

  const districts = useMemo(
    () =>
      [...new Set(regions.map((r) => r.administrative_district_lvl_1))]
        .filter(Boolean)
        .sort(),
    [regions],
  );

  const filteredRegions = useMemo(() => {
    let result = regions;
    if (showFavoritesOnly) {
      result = result.filter((r) => r.is_favorite);
    }
    if (selectedLvl1) {
      result = result.filter((r) => r.administrative_district_lvl_1 === selectedLvl1);
    }
    return result;
  }, [regions, selectedLvl1, showFavoritesOnly]);

  function handleLvl1Change(value: string) {
    setSelectedLvl1(value);
    setSelectedRegionId("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedRegionId) {
      router.push(`/regions/${selectedRegionId}`);
    }
  }

  async function toggleFavorite(regionId: number, currentlyFavorite: boolean) {
    try {
      if (currentlyFavorite) {
        await removeFavoriteRegion(regionId);
      } else {
        await addFavoriteRegion(regionId);
      }
      setRegions((prev) =>
        prev.map((r) =>
          r.id === regionId ? { ...r, is_favorite: !r.is_favorite } : r,
        ),
      );
    } catch {
      // Silently handle -- the UI stays consistent
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-md flex-col items-center gap-8 px-6">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Walkie
          </h1>
          <p className="text-center text-lg text-zinc-600 dark:text-zinc-400">
            Explore paths and streets within a region.
          </p>
          <LoginForm />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center gap-8 px-6">
        <div className="flex w-full items-center justify-between">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Walkie
          </h1>
          <div className="flex items-center gap-3">
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
          </div>
        </div>
        <p className="text-center text-lg text-zinc-600 dark:text-zinc-400">
          Explore paths and streets within a region.
        </p>
        {loading && (
          <p className="text-zinc-500 dark:text-zinc-400">Loading regions...</p>
        )}
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        {!loading && !error && (
          <>
            <div className="flex w-full gap-2">
              <button
                type="button"
                onClick={() => setShowFavoritesOnly(false)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  !showFavoritesOnly
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                All Regions
              </button>
              <button
                type="button"
                onClick={() => setShowFavoritesOnly(true)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  showFavoritesOnly
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                My Regions
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
              <select
                value={selectedLvl1}
                onChange={(e) => handleLvl1Change(e.target.value)}
                className="h-12 w-full rounded-lg border border-zinc-300 bg-white px-4 text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="">All districts</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <div className="flex w-full flex-col gap-1">
                <select
                  value={selectedRegionId}
                  onChange={(e) => setSelectedRegionId(e.target.value)}
                  className="h-12 w-full rounded-lg border border-zinc-300 bg-white px-4 text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="">Select a region...</option>
                  {filteredRegions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.is_favorite ? "\u2605 " : ""}{r.name}
                    </option>
                  ))}
                </select>
                {selectedRegionId && (
                  <button
                    type="button"
                    onClick={() => {
                      const region = regions.find(
                        (r) => r.id === Number(selectedRegionId),
                      );
                      if (region) {
                        toggleFavorite(region.id, region.is_favorite);
                      }
                    }}
                    className="self-end text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                  >
                    {regions.find((r) => r.id === Number(selectedRegionId))
                      ?.is_favorite
                      ? "\u2605 Remove from favorites"
                      : "\u2606 Add to favorites"}
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={!selectedRegionId}
                className="h-12 rounded-lg bg-zinc-900 px-6 font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                See Paths
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
