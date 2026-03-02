import type {
  PathFeature,
  SegmentFeature,
  RouteResponse,
  RouteListItem,
  Place,
} from "@/types/geo";

export function makePathFeature(
  overrides: Partial<PathFeature> & { id?: number } = {},
): PathFeature {
  const id = overrides.id ?? 1;
  return {
    id,
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [21.0, 52.0],
        [21.001, 52.001],
      ],
    },
    properties: {
      name: `Path ${id}`,
      category: "footway",
      surface: "asphalt",
      accessible: true,
      is_lit: false,
      created_at: "2024-01-01T00:00:00Z",
      ...overrides.properties,
    },
    ...overrides,
    // Re-apply id after spread since overrides may contain it
  } as PathFeature;
}

export function makeSegmentFeature(
  id: number = 1,
  source: number = 100,
  target: number = 200,
  coords: [number, number][] = [
    [21.0, 52.0],
    [21.001, 52.001],
  ],
): SegmentFeature {
  return {
    id,
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: coords,
    },
    properties: {
      name: `Segment ${id}`,
      category: "footway",
      surface: "asphalt",
      accessible: true,
      is_lit: false,
      source,
      target,
      length: 150,
      created_at: "2024-01-01T00:00:00Z",
    },
  };
}

export function makeRouteResponse(
  overrides: Partial<RouteResponse> = {},
): RouteResponse {
  return {
    total_distance: 3000,
    is_loop: false,
    start_point: [21.0, 52.0],
    end_point: [21.01, 52.01],
    segments: {
      type: "FeatureCollection",
      features: [],
    },
    paths_count: 2,
    path_names: ["Main Street", "Oak Avenue"],
    ...overrides,
  };
}

export function makeRouteListItem(
  overrides: Partial<RouteListItem> = {},
): RouteListItem {
  return {
    id: 1,
    name: "Test Route",
    total_distance: 3000,
    is_loop: false,
    is_custom: false,
    walked: false,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: 1,
    name: "Test Place",
    location: [21.0, 52.0],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

export function mockResponse(
  body: unknown = {},
  init: { status?: number; ok?: boolean } = {},
): Response {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? "OK" : "Error",
    type: "basic" as ResponseType,
    url: "",
    clone: () => mockResponse(body, init),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}
