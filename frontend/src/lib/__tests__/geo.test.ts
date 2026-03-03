import { describe, it, expect } from "vitest";
import {
  formatDistance,
  haversineDistance,
  getRouteEndpoints,
  getEndpointCoords,
} from "@/lib/geo";
import { makeSegmentFeature } from "@/test/helpers";
import type { SegmentFeature } from "@/types/geo";

describe("formatDistance", () => {
  it("formats 0 meters", () => {
    expect(formatDistance(0)).toBe("0 m");
  });

  it("formats sub-kilometer distances in meters", () => {
    expect(formatDistance(500)).toBe("500 m");
    expect(formatDistance(999)).toBe("999 m");
  });

  it("formats exactly 1000m as km", () => {
    expect(formatDistance(1000)).toBe("1.0 km");
  });

  it("formats distances above 1km with one decimal", () => {
    expect(formatDistance(1500)).toBe("1.5 km");
    expect(formatDistance(12345)).toBe("12.3 km");
  });
});

describe("haversineDistance", () => {
  it("returns 0 for identical points", () => {
    const p: [number, number] = [21.0, 52.0];
    expect(haversineDistance(p, p)).toBe(0);
  });

  it("computes a known distance (Warsaw to Krakow ~252km)", () => {
    const warsaw: [number, number] = [21.0122, 52.2297];
    const krakow: [number, number] = [19.9449, 50.0647];
    const dist = haversineDistance(warsaw, krakow);
    expect(dist).toBeGreaterThan(250_000);
    expect(dist).toBeLessThan(260_000);
  });

  it("is symmetric", () => {
    const a: [number, number] = [21.0, 52.0];
    const b: [number, number] = [21.01, 52.01];
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a), 6);
  });

  it("computes distance along same meridian", () => {
    const a: [number, number] = [0, 0];
    const b: [number, number] = [0, 1];
    const dist = haversineDistance(a, b);
    // 1 degree of latitude ~ 111km
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });

  it("computes distance along equator", () => {
    const a: [number, number] = [0, 0];
    const b: [number, number] = [1, 0];
    const dist = haversineDistance(a, b);
    // 1 degree of longitude at equator ~ 111km
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });
});

describe("getRouteEndpoints", () => {
  function buildMap(
    ...segments: SegmentFeature[]
  ): Map<number, SegmentFeature> {
    const m = new Map<number, SegmentFeature>();
    for (const s of segments) m.set(s.id, s);
    return m;
  }

  it("returns nulls for empty list", () => {
    expect(getRouteEndpoints([], new Map())).toEqual({
      startNode: null,
      endNode: null,
    });
  });

  it("returns source/target for single segment", () => {
    const seg = makeSegmentFeature(1, 10, 20);
    const map = buildMap(seg);
    expect(getRouteEndpoints([1], map)).toEqual({
      startNode: 10,
      endNode: 20,
    });
  });

  it("identifies endpoints for two connected segments", () => {
    // Chain: 10 --seg1--> 20 --seg2--> 30
    const seg1 = makeSegmentFeature(1, 10, 20);
    const seg2 = makeSegmentFeature(2, 20, 30);
    const map = buildMap(seg1, seg2);
    expect(getRouteEndpoints([1, 2], map)).toEqual({
      startNode: 10,
      endNode: 30,
    });
  });

  it("identifies endpoints for three+ connected segments", () => {
    // Chain: 10 --seg1--> 20 --seg2--> 30 --seg3--> 40
    const seg1 = makeSegmentFeature(1, 10, 20);
    const seg2 = makeSegmentFeature(2, 20, 30);
    const seg3 = makeSegmentFeature(3, 30, 40);
    const map = buildMap(seg1, seg2, seg3);
    expect(getRouteEndpoints([1, 2, 3], map)).toEqual({
      startNode: 10,
      endNode: 40,
    });
  });

  it("handles consecutive duplicate segments (going back)", () => {
    // Chain: 10 --A--> 20 --B--> 30, then B again (30-->20)
    const segA = makeSegmentFeature(1, 10, 20);
    const segB = makeSegmentFeature(2, 20, 30);
    const map = buildMap(segA, segB);
    expect(getRouteEndpoints([1, 2, 2], map)).toEqual({
      startNode: 10,
      endNode: 20,
    });
  });

  it("handles dead-end round-trip as a loop", () => {
    // Walk in: A(10->20), B(20->30), C(30->40)
    // Walk back: C(40->30), B(30->20), A(20->10)
    const segA = makeSegmentFeature(1, 10, 20);
    const segB = makeSegmentFeature(2, 20, 30);
    const segC = makeSegmentFeature(3, 30, 40);
    const map = buildMap(segA, segB, segC);
    const result = getRouteEndpoints([1, 2, 3, 3, 2, 1], map);
    expect(result.startNode).toBe(10);
    expect(result.endNode).toBe(10);
  });

  it("handles gap with look-ahead to orient disconnected segment", () => {
    // Chain: A(1->2), B(2->3), gap, C(5->6), D(6->7)
    // C's orientation determined by peeking at D: D shares node 6 with C's target,
    // so C is traversed source->target, ending at 6; then D ends at 7.
    const segA = makeSegmentFeature(1, 1, 2);
    const segB = makeSegmentFeature(2, 2, 3);
    const segC = makeSegmentFeature(3, 5, 6);
    const segD = makeSegmentFeature(4, 6, 7);
    const map = buildMap(segA, segB, segC, segD);
    expect(getRouteEndpoints([1, 2, 3, 4], map)).toEqual({
      startNode: 1,
      endNode: 7,
    });
  });

  it("handles gap at end with no look-ahead (defaults to target)", () => {
    // Chain: A(1->2), B(2->3), gap, C(5->6)
    // No next segment after C, so default to target (6).
    const segA = makeSegmentFeature(1, 1, 2);
    const segB = makeSegmentFeature(2, 2, 3);
    const segC = makeSegmentFeature(3, 5, 6);
    const map = buildMap(segA, segB, segC);
    expect(getRouteEndpoints([1, 2, 3], map)).toEqual({
      startNode: 1,
      endNode: 6,
    });
  });

  it("handles multiple gaps correctly", () => {
    // Chain: A(1->2), gap, B(5->6), C(6->7)
    // B's orientation determined by peeking at C: C shares node 6 with B's target,
    // so B traverses source->target ending at 6; then C ends at 7.
    const segA = makeSegmentFeature(1, 1, 2);
    const segB = makeSegmentFeature(2, 5, 6);
    const segC = makeSegmentFeature(3, 6, 7);
    const map = buildMap(segA, segB, segC);
    expect(getRouteEndpoints([1, 2, 3], map)).toEqual({
      startNode: 1,
      endNode: 7,
    });
  });
});

describe("getEndpointCoords", () => {
  function buildMap(
    ...segments: SegmentFeature[]
  ): Map<number, SegmentFeature> {
    const m = new Map<number, SegmentFeature>();
    for (const s of segments) m.set(s.id, s);
    return m;
  }

  it("returns nulls for empty list", () => {
    expect(getEndpointCoords([], new Map())).toEqual({
      start: null,
      end: null,
    });
  });

  it("returns coords for single segment", () => {
    const seg = makeSegmentFeature(1, 10, 20, [
      [21.0, 52.0],
      [21.1, 52.1],
    ]);
    const map = buildMap(seg);
    const result = getEndpointCoords([1], map);
    expect(result.start).toEqual([21.0, 52.0]);
    expect(result.end).toEqual([21.1, 52.1]);
  });

  it("returns correct coords for multi-segment chain", () => {
    const seg1 = makeSegmentFeature(1, 10, 20, [
      [21.0, 52.0],
      [21.05, 52.05],
    ]);
    const seg2 = makeSegmentFeature(2, 20, 30, [
      [21.05, 52.05],
      [21.1, 52.1],
    ]);
    const map = buildMap(seg1, seg2);
    const result = getEndpointCoords([1, 2], map);
    expect(result.start).toEqual([21.0, 52.0]);
    expect(result.end).toEqual([21.1, 52.1]);
  });

  it("returns correct coords for consecutive duplicate (going back)", () => {
    // A: 10->20, coords [21.0,52.0]->[21.05,52.05]
    // B: 20->30, coords [21.05,52.05]->[21.1,52.1]
    // Route: [A, B, B] -> walk A forward, B forward, B backward
    // End node = 20 (B's source), so end coord = B's source coord = [21.05,52.05]
    const segA = makeSegmentFeature(1, 10, 20, [
      [21.0, 52.0],
      [21.05, 52.05],
    ]);
    const segB = makeSegmentFeature(2, 20, 30, [
      [21.05, 52.05],
      [21.1, 52.1],
    ]);
    const map = buildMap(segA, segB);
    const result = getEndpointCoords([1, 2, 2], map);
    expect(result.start).toEqual([21.0, 52.0]);
    expect(result.end).toEqual([21.05, 52.05]);
  });
});
