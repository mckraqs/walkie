import type {
  RegionFeature,
  RegionListItem,
  PathFeatureCollection,
  RouteGenerateRequest,
  RouteResponse,
  LoginRequest,
  LoginResponse,
  AuthUser,
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

export async function removeFavoriteRegion(regionId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/regions/${regionId}/favorite/`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to remove favorite: ${res.status}`);
  }
}
