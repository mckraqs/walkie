import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockResponse } from "@/test/helpers";
import {
  setAuthToken,
  fetchRegions,
  generateRoute,
  login,
  logout,
  addFavoriteRegion,
  removeFavoriteRegion,
} from "@/lib/api";

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("localStorage", mockLocalStorage);
  setAuthToken(null);
  Object.defineProperty(window, "location", {
    value: { href: "/" },
    writable: true,
    configurable: true,
  });
  mockLocalStorage.removeItem.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("setAuthToken / authHeaders", () => {
  it("includes token in requests when set", async () => {
    setAuthToken("test-token");
    vi.mocked(fetch).mockResolvedValue(mockResponse([]));

    await fetchRegions();

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Token test-token",
        }),
      }),
    );
  });

  it("excludes authorization header when token is null", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse([]));

    await fetchRegions();

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe("handle401", () => {
  it("clears token and redirects on 401", async () => {
    setAuthToken("old-token");
    vi.mocked(fetch).mockResolvedValue(mockResponse({}, { status: 401 }));

    await expect(fetchRegions()).rejects.toThrow();
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith("authToken");
    expect(window.location.href).toBe("/");
  });
});

describe("fetchRegions", () => {
  it("returns regions on success", async () => {
    const regions = [{ id: 1, name: "Test" }];
    vi.mocked(fetch).mockResolvedValue(mockResponse(regions));

    const result = await fetchRegions();
    expect(result).toEqual(regions);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({}, { status: 500 }));

    await expect(fetchRegions()).rejects.toThrow("Failed to fetch regions: 500");
  });
});

describe("generateRoute", () => {
  it("returns route on success", async () => {
    const route = { total_distance: 3000 };
    vi.mocked(fetch).mockResolvedValue(mockResponse(route));

    const result = await generateRoute("1", {
      target_distance_km: 3,
      route_type: "one_way",
    });
    expect(result).toEqual(route);
  });

  it("extracts detail from error body", async () => {
    const errorResp = {
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: "Distance too short" }),
      headers: new Headers(),
      redirected: false,
      statusText: "Bad Request",
      type: "basic" as ResponseType,
      url: "",
      clone: vi.fn(),
      body: null,
      bodyUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      text: () => Promise.resolve(""),
      bytes: () => Promise.resolve(new Uint8Array()),
    } as Response;
    vi.mocked(fetch).mockResolvedValue(errorResp);

    await expect(
      generateRoute("1", { target_distance_km: 0.01 }),
    ).rejects.toThrow("Distance too short");
  });
});

describe("login", () => {
  it("returns login response on success", async () => {
    const response = { token: "abc", user: { id: 1, username: "test" } };
    vi.mocked(fetch).mockResolvedValue(mockResponse(response));

    const result = await login({ username: "test", password: "pass" });
    expect(result).toEqual(response);
  });

  it("throws with detail message on failure", async () => {
    const errorResp = {
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: "Bad credentials" }),
      headers: new Headers(),
      redirected: false,
      statusText: "Bad Request",
      type: "basic" as ResponseType,
      url: "",
      clone: vi.fn(),
      body: null,
      bodyUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      text: () => Promise.resolve(""),
      bytes: () => Promise.resolve(new Uint8Array()),
    } as Response;
    vi.mocked(fetch).mockResolvedValue(errorResp);

    await expect(login({ username: "x", password: "y" })).rejects.toThrow(
      "Bad credentials",
    );
  });
});

describe("logout", () => {
  it("sends POST to logout endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({}));
    setAuthToken("tok");

    await logout();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/logout/"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("addFavoriteRegion", () => {
  it("succeeds on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({}, { status: 200 }));

    await expect(addFavoriteRegion(1)).resolves.toBeUndefined();
  });

  it("treats 409 as success (already favorited)", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({}, { status: 409 }));

    await expect(addFavoriteRegion(1)).resolves.toBeUndefined();
  });

  it("throws on other error status", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({}, { status: 500 }));

    await expect(addFavoriteRegion(1)).rejects.toThrow();
  });
});

describe("removeFavoriteRegion", () => {
  it("returns response on success", async () => {
    const body = { routes_deleted: 2, places_deleted: 1 };
    vi.mocked(fetch).mockResolvedValue(mockResponse(body));

    const result = await removeFavoriteRegion(1);
    expect(result).toEqual(body);
  });

  it("treats 404 as success (already removed)", async () => {
    const body = { routes_deleted: 0, places_deleted: 0 };
    vi.mocked(fetch).mockResolvedValue(mockResponse(body, { status: 404 }));

    const result = await removeFavoriteRegion(1);
    expect(result).toEqual(body);
  });

  it("throws on other error status", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({}, { status: 500 }));

    await expect(removeFavoriteRegion(1)).rejects.toThrow();
  });
});
