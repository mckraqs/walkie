export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface AuthUser {
  id: number;
  username: string;
}

export interface RegionProperties {
  code: string;
  name: string;
  administrative_district_lvl_1: string;
  administrative_district_lvl_2: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
}

export interface PathProperties {
  name: string;
  category: string;
  surface: string;
  accessible: boolean;
  is_lit: boolean;
  created_at: string;
  sequence_index?: number;
}

export interface RegionFeature {
  id: number;
  type: "Feature";
  geometry: GeoJSON.MultiPolygon;
  properties: RegionProperties;
}

export interface PathFeature {
  id: number;
  type: "Feature";
  geometry: GeoJSON.MultiLineString | GeoJSON.LineString;
  properties: PathProperties;
}

export interface PathFeatureCollection {
  type: "FeatureCollection";
  features: PathFeature[];
}

export interface RegionListItem {
  id: number;
  code: string;
  name: string;
  administrative_district_lvl_1: string;
  administrative_district_lvl_2: string;
  is_favorite: boolean;
}

export type RouteType = "one_way" | "loop";

export interface RouteGenerateRequest {
  target_distance_km: number;
  route_type?: RouteType;
}

export interface RouteResponse {
  total_distance: number;
  is_loop: boolean;
  start_point: [number, number] | null;
  end_point: [number, number] | null;
  segments: PathFeatureCollection;
  paths_count: number;
  path_names: string[];
}
