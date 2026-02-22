import { fetchRegion, fetchRegionPaths } from "@/lib/api";
import PathMapLoader from "@/components/PathMapLoader";

interface RegionPageProps {
  params: Promise<{ regionId: string }>;
}

export default async function RegionPage({ params }: RegionPageProps) {
  const { regionId } = await params;

  let region;
  let paths;
  try {
    [region, paths] = await Promise.all([
      fetchRegion(regionId),
      fetchRegionPaths(regionId),
    ]);
  } catch {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-lg text-red-600">
          Failed to load region {regionId}. Please check the ID and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {region.properties.name}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {paths.features.length} path{paths.features.length !== 1 && "s"}
          </p>
        </div>
        <a
          href="/"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Back
        </a>
      </header>
      <div className="flex-1">
        <PathMapLoader region={region} paths={paths} />
      </div>
    </div>
  );
}
