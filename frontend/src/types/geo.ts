export interface RegionProperties {
  code: string;
  name: string;
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
  geometry: GeoJSON.MultiLineString;
  properties: PathProperties;
}

export interface PathFeatureCollection {
  type: "FeatureCollection";
  features: PathFeature[];
}
