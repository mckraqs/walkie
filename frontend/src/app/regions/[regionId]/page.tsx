"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  fetchRegion,
  fetchRegionPaths,
  addFavoriteRegion,
  removeFavoriteRegion,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import RegionExplorer from "@/components/RegionExplorer";
import type { RegionFeature, PathFeatureCollection } from "@/types/geo";

interface RegionPageProps {
  params: Promise<{ regionId: string }>;
}

export default function RegionPage({ params }: RegionPageProps) {
  const { regionId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  const [region, setRegion] = useState<RegionFeature | null>(null);
  const [paths, setPaths] = useState<PathFeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([fetchRegion(regionId), fetchRegionPaths(regionId)])
      .then(([regionData, pathsData]) => {
        setRegion(regionData);
        setPaths(pathsData);
        setIsFavorite(regionData.properties.is_favorite);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load region");
      })
      .finally(() => setLoading(false));
  }, [user, regionId]);

  async function toggleFavorite() {
    if (!region) return;
    try {
      if (isFavorite) {
        await removeFavoriteRegion(region.id);
      } else {
        await addFavoriteRegion(region.id);
      }
      setIsFavorite(!isFavorite);
    } catch {
      // Silently handle
    }
  }

  if (authLoading || (!user && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-500 dark:text-zinc-400">Loading region...</p>
      </div>
    );
  }

  if (error || !region || !paths) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-lg text-red-600">
          {error ?? `Failed to load region ${regionId}. Please check the ID and try again.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              {region.properties.name}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {paths.features.length} path{paths.features.length !== 1 && "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleFavorite}
            className="text-xl text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            {isFavorite ? "\u2605" : "\u2606"}
          </button>
        </div>
        <div className="flex items-center gap-4">
          {user && (
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
          )}
          <a
            href="/"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Back
          </a>
        </div>
      </header>
      <div className="flex-1">
        <RegionExplorer
          regionId={regionId}
          region={region}
          paths={paths}
          isFavorite={isFavorite}
        />
      </div>
    </div>
  );
}
