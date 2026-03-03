"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { searchGeocoding } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { GeocodingResult } from "@/types/geo";

interface PlaceSearchProps {
  regionBbox: [number, number, number, number] | null;
  regionCenter: [number, number] | null;
  onResultHover: (location: [number, number] | null) => void;
  onResultSelect: (result: GeocodingResult) => void;
  onSaveResult: (name: string, location: [number, number]) => void;
}

export default function PlaceSearch({
  regionBbox,
  regionCenter,
  onResultHover,
  onResultSelect,
  onSaveResult,
}: PlaceSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);

  const bboxRef = useRef(regionBbox);
  bboxRef.current = regionBbox;
  const centerRef = useRef(regionCenter);
  centerRef.current = regionCenter;

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    let stale = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const data = await searchGeocoding(
          query.trim(),
          bboxRef.current,
          centerRef.current?.[1],
          centerRef.current?.[0],
        );
        if (!stale) {
          setResults(data);
        }
      } catch {
        if (!stale) {
          setResults([]);
        }
      } finally {
        if (!stale) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="mb-2">
      <div className="relative">
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address or place..."
          className="h-8 pr-7 text-xs"
        />
        {query.length > 0 && !loading && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {loading && (
          <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {results.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {results.map((result, i) => (
            <li
              key={`${result.location[0]}-${result.location[1]}-${i}`}
              className="flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 text-xs hover:bg-accent"
              onMouseEnter={() => onResultHover(result.location)}
              onMouseLeave={() => onResultHover(null)}
              onClick={() => onResultSelect(result)}
            >
              <span className="min-w-0 flex-1 truncate">
                {result.displayName}
              </span>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Save as place"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSaveResult(result.name, result.location);
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
