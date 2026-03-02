import type { SegmentFeature } from "@/types/geo";

/** Format a distance in meters to a human-readable string. */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/** Compute the great-circle distance between two [lon, lat] points in meters. */
export function haversineDistance(
  a: [number, number],
  b: [number, number],
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Get the start and end graph-node IDs of a segment chain. */
export function getRouteEndpoints(
  segIds: number[],
  segMap: Map<number, SegmentFeature>,
): { startNode: number | null; endNode: number | null } {
  if (segIds.length === 0) return { startNode: null, endNode: null };
  if (segIds.length === 1) {
    const seg = segMap.get(segIds[0]);
    if (!seg) return { startNode: null, endNode: null };
    return {
      startNode: seg.properties.source,
      endNode: seg.properties.target,
    };
  }
  const first = segMap.get(segIds[0]);
  const second = segMap.get(segIds[1]);
  if (!first || !second) return { startNode: null, endNode: null };
  const secondNodes = new Set([
    second.properties.source,
    second.properties.target,
  ]);
  const startNode = secondNodes.has(first.properties.source)
    ? first.properties.target
    : first.properties.source;

  const last = segMap.get(segIds[segIds.length - 1]);
  const secondToLast = segMap.get(segIds[segIds.length - 2]);
  if (!last || !secondToLast) return { startNode, endNode: null };
  const stlNodes = new Set([
    secondToLast.properties.source,
    secondToLast.properties.target,
  ]);
  const endNode = stlNodes.has(last.properties.source)
    ? last.properties.target
    : last.properties.source;

  return { startNode, endNode };
}

/** Get the geographic coordinates of the start and end of a segment chain. */
export function getEndpointCoords(
  segIds: number[],
  segMap: Map<number, SegmentFeature>,
): { start: [number, number] | null; end: [number, number] | null } {
  if (segIds.length === 0) return { start: null, end: null };

  const { startNode, endNode } = getRouteEndpoints(segIds, segMap);

  const first = segMap.get(segIds[0]);
  let start: [number, number] | null = null;
  if (first) {
    const coords = first.geometry.coordinates;
    start =
      startNode === first.properties.target
        ? (coords[coords.length - 1] as [number, number])
        : (coords[0] as [number, number]);
  }

  const last = segMap.get(segIds[segIds.length - 1]);
  let end: [number, number] | null = null;
  if (last) {
    const coords = last.geometry.coordinates;
    end =
      endNode === last.properties.source
        ? (coords[0] as [number, number])
        : (coords[coords.length - 1] as [number, number]);
  }

  return { start, end };
}
