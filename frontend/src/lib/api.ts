import type {
  RegionFeature,
  RegionListItem,
  PathFeatureCollection,
  SegmentFeatureCollection,
  RouteGenerateRequest,
  RouteResponse,
  LoginRequest,
  LoginResponse,
  AuthUser,
  WalkedPathsResponse,
  Place,
  PlaceCreateRequest,
  PlaceUpdateRequest,
  RouteListItem,
  SaveRouteRequest,
  RouteRenameRequest,
  RouteWalkToggleResponse,
  RemoveFavoriteResponse,
} from "@/types/geo";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) {
    headers["Authorization"] = `Token ${authToken}`;
  }
  return headers;
}

function handle401(res: Response): void {
  if (res.status === 401) {
    authToken = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("authToken");
      window.location.href = "/";
    }
  }
}

export async function fetchRegions(): Promise<RegionListItem[]> {
  const res = await fetch(`${API_URL}/api/regions/`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to fetch regions: ${res.status}`);
  }
  return res.json();
}

export async function fetchRegion(regionId: string): Promise<RegionFeature> {
  const res = await fetch(`${API_URL}/api/regions/${regionId}/`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  handle401(res);
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
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to fetch paths for region ${regionId}: ${res.status}`);
  }
  return res.json();
}

export async function fetchRegionSegments(
  regionId: string,
): Promise<SegmentFeatureCollection> {
  const res = await fetch(`${API_URL}/api/regions/${regionId}/segments/`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to fetch segments for region ${regionId}: ${res.status}`);
  }
  return res.json();
}

export async function generateRoute(
  regionId: string,
  request: RouteGenerateRequest,
): Promise<RouteResponse> {
  const res = await fetch(
    `${API_URL}/api/regions/${regionId}/routes/generate/`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(request),
    },
  );
  handle401(res);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.detail ?? `Failed to generate route: ${res.status}`,
    );
  }
  return res.json();
}

export async function login(request: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "Invalid credentials.");
  }
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/auth/logout/`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/api/auth/me/`, {
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to fetch user: ${res.status}`);
  }
  return res.json();
}

export async function fetchFavoriteRegions(): Promise<RegionListItem[]> {
  const res = await fetch(`${API_URL}/api/regions/favorites/`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to fetch favorite regions: ${res.status}`);
  }
  return res.json();
}

export async function addFavoriteRegion(regionId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/regions/${regionId}/favorite/`, {
    method: "POST",
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok && res.status !== 409) {
    throw new Error(`Failed to add favorite: ${res.status}`);
  }
}

export async function removeFavoriteRegion(regionId: number): Promise<RemoveFavoriteResponse> {
  const res = await fetch(`${API_URL}/api/regions/${regionId}/favorite/`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to remove favorite: ${res.status}`);
  }
  return res.json();
}

export async function fetchWalkedPaths(regionId: string): Promise<WalkedPathsResponse> {
  const res = await fetch(`${API_URL}/api/regions/${regionId}/paths/walked/`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to fetch walked paths: ${res.status}`);
  }
  return res.json();
}

export async function fetchPlaces(regionId: string): Promise<Place[]> {
  const res = await fetch(`${API_URL}/api/regions/${regionId}/places/`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to fetch places: ${res.status}`);
  }
  return res.json();
}

export async function createPlace(
  regionId: string,
  request: PlaceCreateRequest,
): Promise<Place> {
  const res = await fetch(`${API_URL}/api/regions/${regionId}/places/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(request),
  });
  handle401(res);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Failed to create place: ${res.status}`);
  }
  return res.json();
}

export async function updatePlace(
  regionId: string,
  placeId: number,
  request: PlaceUpdateRequest,
): Promise<Place> {
  const res = await fetch(
    `${API_URL}/api/regions/${regionId}/places/${placeId}/`,
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(request),
    },
  );
  handle401(res);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Failed to update place: ${res.status}`);
  }
  return res.json();
}

export async function deletePlace(
  regionId: string,
  placeId: number,
): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/regions/${regionId}/places/${placeId}/`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
  );
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to delete place: ${res.status}`);
  }
}

export async function saveRoute(
  regionId: string,
  request: SaveRouteRequest,
): Promise<RouteListItem> {
  const res = await fetch(
    `${API_URL}/api/regions/${regionId}/routes/saved/`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(request),
    },
  );
  handle401(res);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Failed to save route: ${res.status}`);
  }
  return res.json();
}

export async function fetchSavedRoutes(
  regionId: string,
): Promise<RouteListItem[]> {
  const res = await fetch(
    `${API_URL}/api/regions/${regionId}/routes/saved/`,
    {
      cache: "no-store",
      headers: authHeaders(),
    },
  );
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to fetch saved routes: ${res.status}`);
  }
  return res.json();
}

export async function loadRoute(
  regionId: string,
  routeId: number,
): Promise<RouteResponse> {
  const res = await fetch(
    `${API_URL}/api/regions/${regionId}/routes/saved/${routeId}/`,
    {
      cache: "no-store",
      headers: authHeaders(),
    },
  );
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to load route: ${res.status}`);
  }
  return res.json();
}

export async function deleteRoute(
  regionId: string,
  routeId: number,
): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/regions/${regionId}/routes/saved/${routeId}/`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
  );
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to delete route: ${res.status}`);
  }
}

export async function renameRoute(
  regionId: string,
  routeId: number,
  request: RouteRenameRequest,
): Promise<RouteListItem> {
  const res = await fetch(
    `${API_URL}/api/regions/${regionId}/routes/saved/${routeId}/`,
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(request),
    },
  );
  handle401(res);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Failed to rename route: ${res.status}`);
  }
  return res.json();
}

export async function toggleRouteWalked(
  regionId: string,
  routeId: number,
): Promise<RouteWalkToggleResponse> {
  const res = await fetch(
    `${API_URL}/api/regions/${regionId}/routes/saved/${routeId}/walk/`,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
  handle401(res);
  if (!res.ok) {
    throw new Error(`Failed to toggle route walked: ${res.status}`);
  }
  return res.json();
}
