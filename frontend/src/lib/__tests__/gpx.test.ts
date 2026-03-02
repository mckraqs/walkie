import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  stitchCoordinates,
  buildGpxString,
  buildKmlString,
  downloadRouteFile,
} from "@/lib/gpx";
import { makeRouteResponse } from "@/test/helpers";
import type { SegmentFeature } from "@/types/geo";

function makeLineFeature(
  coords: [number, number][],
  id: number = 1,
): SegmentFeature {
  return {
    id,
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: coords,
    },
    properties: {
      name: `Seg ${id}`,
      category: "footway",
      surface: "asphalt",
      accessible: true,
      is_lit: false,
      source: id * 10,
      target: id * 10 + 1,
      length: 100,
      created_at: "2024-01-01T00:00:00Z",
    },
  };
}

describe("stitchCoordinates", () => {
  it("returns empty array for empty input", () => {
    expect(stitchCoordinates([])).toEqual([]);
  });

  it("returns coords of a single segment", () => {
    const seg = makeLineFeature([
      [1, 2],
      [3, 4],
    ]);
    const result = stitchCoordinates([seg]);
    expect(result).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("joins two consecutive segments", () => {
    const seg1 = makeLineFeature(
      [
        [1, 2],
        [3, 4],
      ],
      1,
    );
    const seg2 = makeLineFeature(
      [
        [3, 4],
        [5, 6],
      ],
      2,
    );
    const result = stitchCoordinates([seg1, seg2]);
    // Junction [3,4] should appear once
    expect(result).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it("reverses a segment when needed", () => {
    const seg1 = makeLineFeature(
      [
        [1, 2],
        [3, 4],
      ],
      1,
    );
    // seg2 is in reverse order (end matches seg1's end)
    const seg2 = makeLineFeature(
      [
        [5, 6],
        [3, 4],
      ],
      2,
    );
    const result = stitchCoordinates([seg1, seg2]);
    expect(result).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it("removes duplicate junction point", () => {
    const seg1 = makeLineFeature(
      [
        [0, 0],
        [1, 1],
      ],
      1,
    );
    const seg2 = makeLineFeature(
      [
        [1, 1],
        [2, 2],
      ],
      2,
    );
    const result = stitchCoordinates([seg1, seg2]);
    // [1,1] should only appear once
    const occurrences = result.filter(
      (c) => c[0] === 1 && c[1] === 1,
    ).length;
    expect(occurrences).toBe(1);
  });

  it("handles 3+ segments", () => {
    const seg1 = makeLineFeature(
      [
        [0, 0],
        [1, 1],
      ],
      1,
    );
    const seg2 = makeLineFeature(
      [
        [1, 1],
        [2, 2],
      ],
      2,
    );
    const seg3 = makeLineFeature(
      [
        [2, 2],
        [3, 3],
      ],
      3,
    );
    const result = stitchCoordinates([seg1, seg2, seg3]);
    expect(result).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });
});

describe("buildGpxString", () => {
  it("produces valid XML structure", () => {
    const gpx = buildGpxString("Test", [
      [21.0, 52.0],
      [21.1, 52.1],
    ]);
    expect(gpx).toContain('<?xml version="1.0"');
    expect(gpx).toContain("<gpx");
    expect(gpx).toContain("<trk>");
    expect(gpx).toContain("<trkseg>");
    expect(gpx).toContain("<name>Test</name>");
  });

  it("escapes XML special characters in name", () => {
    const gpx = buildGpxString("Route <A> & B", [[0, 0]]);
    expect(gpx).toContain("Route &lt;A&gt; &amp; B");
    expect(gpx).not.toContain("<A>");
  });

  it("maps lat/lon correctly", () => {
    const gpx = buildGpxString("R", [[21.5, 52.3]]);
    expect(gpx).toContain('lat="52.3"');
    expect(gpx).toContain('lon="21.5"');
  });

  it("handles empty coordinates", () => {
    const gpx = buildGpxString("Empty", []);
    expect(gpx).toContain("<trkseg>");
    expect(gpx).not.toContain("<trkpt");
  });
});

describe("buildKmlString", () => {
  it("produces valid KML structure", () => {
    const kml = buildKmlString("Test", [
      [21.0, 52.0],
      [21.1, 52.1],
    ]);
    expect(kml).toContain('<?xml version="1.0"');
    expect(kml).toContain("<kml");
    expect(kml).toContain("<Document>");
    expect(kml).toContain("<LineString>");
    expect(kml).toContain("<name>Test</name>");
  });

  it("escapes XML special characters in name", () => {
    const kml = buildKmlString('Route "X" & Y', [[0, 0]]);
    expect(kml).toContain("Route &quot;X&quot; &amp; Y");
  });

  it("formats coordinates as lon,lat,0", () => {
    const kml = buildKmlString("R", [
      [21.5, 52.3],
      [21.6, 52.4],
    ]);
    expect(kml).toContain("21.5,52.3,0 21.6,52.4,0");
  });

  it("handles empty coordinates", () => {
    const kml = buildKmlString("Empty", []);
    expect(kml).toContain("<coordinates></coordinates>");
  });
});

describe("downloadRouteFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and clicks an anchor with correct attributes for GPX", () => {
    const mockUrl = "blob:http://localhost/test-gpx";
    vi.stubGlobal(
      "URL",
      Object.assign({}, URL, {
        createObjectURL: vi.fn(() => mockUrl),
        revokeObjectURL: vi.fn(),
      }),
    );

    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      mockAnchor as unknown as HTMLElement,
    );
    vi.spyOn(document.body, "appendChild").mockImplementation(
      (node) => node,
    );
    vi.spyOn(document.body, "removeChild").mockImplementation(
      (node) => node,
    );

    const route = makeRouteResponse({
      segments: {
        type: "FeatureCollection",
        features: [
          makeLineFeature(
            [
              [21.0, 52.0],
              [21.1, 52.1],
            ],
            1,
          ),
        ],
      },
    });

    downloadRouteFile(route, "My Route", "gpx");

    expect(mockAnchor.download).toBe("My Route.gpx");
    expect(mockAnchor.href).toBe(mockUrl);
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);
  });

  it("uses correct MIME type for KML", () => {
    let capturedBlob: Blob | null = null;
    vi.stubGlobal(
      "URL",
      Object.assign({}, URL, {
        createObjectURL: vi.fn((blob: Blob) => {
          capturedBlob = blob;
          return "blob:test";
        }),
        revokeObjectURL: vi.fn(),
      }),
    );

    const mockAnchor = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(
      mockAnchor as unknown as HTMLElement,
    );
    vi.spyOn(document.body, "appendChild").mockImplementation(
      (node) => node,
    );
    vi.spyOn(document.body, "removeChild").mockImplementation(
      (node) => node,
    );

    const route = makeRouteResponse({
      segments: { type: "FeatureCollection", features: [] },
    });

    downloadRouteFile(route, "Test", "kml");

    expect(capturedBlob).not.toBeNull();
    expect(capturedBlob!.type).toBe("application/vnd.google-earth.kml+xml");
    expect(mockAnchor.download).toBe("Test.kml");
  });
});
