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

/** Get the start and end graph-node IDs of a segment chain.
 *
 * Traces the chain segment-by-segment, tracking which node we arrive at
 * after each step. This correctly handles duplicate (retraced) segments
 * such as dead-end streets walked in both directions.
 */
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

  // Determine initial traversal direction from the first two segments
  let startNode: number;
  let currentNode: number;

  if (segIds[0] === segIds[1]) {
    // Same segment repeated (immediate backtrack): pick source as start
    startNode = first.properties.source;
    currentNode = first.properties.target;
  } else {
    const secondNodes = new Set([
      second.properties.source,
      second.properties.target,
    ]);
    if (secondNodes.has(first.properties.source)) {
      startNode = first.properties.target;
      currentNode = first.properties.source;
    } else {
      startNode = first.properties.source;
      currentNode = first.properties.target;
    }
  }

  // Walk through remaining segments, flipping direction at each step
  for (let i = 1; i < segIds.length; i++) {
    const seg = segMap.get(segIds[i]);
    if (!seg) return { startNode, endNode: null };

    if (currentNode === seg.properties.source) {
      currentNode = seg.properties.target;
    } else if (currentNode === seg.properties.target) {
      currentNode = seg.properties.source;
    } else {
      // Gap detected — determine orientation by peeking at the next segment
      const nextSeg = i + 1 < segIds.length ? segMap.get(segIds[i + 1]) : null;
      if (nextSeg && (nextSeg.properties.source === seg.properties.source
                    || nextSeg.properties.target === seg.properties.source)) {
        currentNode = seg.properties.source;
      } else {
        currentNode = seg.properties.target;
      }
    }
  }

  return { startNode, endNode: currentNode };
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
