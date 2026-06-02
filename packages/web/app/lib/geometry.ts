export interface LineFeature {
  type: "Feature";
  properties: { lineId: string; lineName: string };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

export interface LineFeatureCollection {
  type: "FeatureCollection";
  features: LineFeature[];
}
