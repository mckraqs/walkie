"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { fetchRegions } from "@/lib/api";
import type { RegionListItem } from "@/types/geo";

export default function Home() {
  const router = useRouter();
  const [regions, setRegions] = useState<RegionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLvl1, setSelectedLvl1] = useState("");
  const [selectedRegionId, setSelectedRegionId] = useState("");

  useEffect(() => {
    fetchRegions()
      .then(setRegions)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load regions");
      })
      .finally(() => setLoading(false));
  }, []);

  const districts = useMemo(
    () =>
      [...new Set(regions.map((r) => r.administrative_district_lvl_1))]
        .filter(Boolean)
        .sort(),
    [regions],
  );

  const filteredRegions = useMemo(
    () =>
      selectedLvl1
        ? regions.filter((r) => r.administrative_district_lvl_1 === selectedLvl1)
        : regions,
    [regions, selectedLvl1],
  );

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center gap-8 px-6">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Walkie
        </h1>
        <p className="text-center text-lg text-zinc-600 dark:text-zinc-400">
          Explore paths and streets within a region.
        </p>
        {loading && (
          <p className="text-zinc-500 dark:text-zinc-400">Loading regions...</p>
        )}
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        {!loading && !error && (
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
            <select
              value={selectedRegionId}
              onChange={(e) => setSelectedRegionId(e.target.value)}
              className="h-12 w-full rounded-lg border border-zinc-300 bg-white px-4 text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">Select a region...</option>
              {filteredRegions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!selectedRegionId}
              className="h-12 rounded-lg bg-zinc-900 px-6 font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              See Paths
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
