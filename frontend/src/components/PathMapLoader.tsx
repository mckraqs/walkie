"use client";

import dynamic from "next/dynamic";
import type { RegionFeature, PathFeatureCollection } from "@/types/geo";

const PathMap = dynamic(() => import("@/components/PathMap"), { ssr: false });

interface PathMapLoaderProps {
  region: RegionFeature;
  paths: PathFeatureCollection;
}

export default function PathMapLoader({ region, paths }: PathMapLoaderProps) {
  return <PathMap region={region} paths={paths} />;
}
