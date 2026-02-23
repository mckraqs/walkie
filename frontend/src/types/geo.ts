export interface RegionProperties {
  code: string;
  name: string;
  administrative_district_lvl_1: string;
  administrative_district_lvl_2: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface PathProperties {
  name: string;
  category: string;
  surface: string;
  accessible: boolean;
  is_lit: boolean;
  created_at: string;
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
}

export interface RouteGenerateRequest {
  target_distance_km: number;
}

export interface RouteResponse {
  total_distance: number;
  paths: PathFeatureCollection;
}
