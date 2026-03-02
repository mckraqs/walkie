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
  path_id?: number;
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

export interface SegmentProperties {
  name: string;
  category: string;
  surface: string;
  accessible: boolean;
  is_lit: boolean;
  source: number;
  target: number;
  length: number;
  created_at: string;
}

export interface SegmentFeature {
  id: number;
  type: "Feature";
  geometry: GeoJSON.LineString;
  properties: SegmentProperties;
}

export interface SegmentFeatureCollection {
  type: "FeatureCollection";
  features: SegmentFeature[];
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
  start_place_id?: number | null;
  end_place_id?: number | null;
  start_coords?: [number, number] | null;
  end_coords?: [number, number] | null;
}

export interface RouteResponse {
  total_distance: number;
  is_loop: boolean;
  start_point: [number, number] | null;
  end_point: [number, number] | null;
  segments: PathFeatureCollection;
  paths_count: number;
  path_names: string[];
  used_shortest_path?: boolean;
}

export interface WalkedPathsResponse {
  walked_path_ids: number[];
  total_paths: number;
  walked_count: number;
}

export interface Place {
  id: number;
  name: string;
  location: [number, number];
  created_at: string;
  updated_at: string;
}

export interface PlaceCreateRequest {
  name: string;
  location: [number, number];
}

export interface PlaceUpdateRequest {
  name?: string;
  location?: [number, number];
}

export interface RouteListItem {
  id: number;
  name: string;
  total_distance: number;
  is_loop: boolean;
  is_custom: boolean;
  walked: boolean;
  created_at: string;
}

export interface RouteWalkToggleResponse {
  id: number;
  walked: boolean;
  walked_path_ids: number[];
  total_paths: number;
  walked_count: number;
}

export interface SaveRouteRequest {
  name: string;
  segment_ids: number[];
  total_distance: number;
  is_loop: boolean;
  is_custom?: boolean;
  start_point: [number, number] | null;
  end_point: [number, number] | null;
}

export interface RouteRenameRequest {
  name: string;
}

export interface RemoveFavoriteResponse {
  routes_deleted: number;
  places_deleted: number;
}
