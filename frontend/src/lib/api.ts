import type { RegionFeature, PathFeatureCollection } from "@/types/geo";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchRegion(regionId: string): Promise<RegionFeature> {
  const res = await fetch(`${API_URL}/api/regions/${regionId}/`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch region ${regionId}: ${res.status}`);
  }
  return res.json();
}

export async function fetchRegionPaths(
  regionId: string,
): Promise<PathFeatureCollection> {
  const res = await fetch(`${API_URL}/api/regions/${regionId}/paths/`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch paths for region ${regionId}: ${res.status}`);
  }
  return res.json();
}
