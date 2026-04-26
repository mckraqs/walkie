import type { RouteResponse } from "@/types/geo";

type Coord = [number, number];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Merge ordered GeoJSON LineString features into a single coordinate array.
 * Handles segment reversal and duplicate junction points.
 */
export function stitchCoordinates(
  features: RouteResponse["segments"]["features"],
): Coord[] {
  const coords: Coord[] = [];

  for (const feature of features) {
    const geom = feature.geometry;
    let segCoords: Coord[] = (geom as GeoJSON.LineString).coordinates.map(
      (c) => [c[0], c[1]] as Coord,
    );

    if (coords.length === 0) {
      coords.push(...segCoords);
      continue;
    }

    const last = coords[coords.length - 1];
    const first = segCoords[0];
    const end = segCoords[segCoords.length - 1];

    const distToFirst =
      (last[0] - first[0]) ** 2 + (last[1] - first[1]) ** 2;
    const distToEnd = (last[0] - end[0]) ** 2 + (last[1] - end[1]) ** 2;

    if (distToEnd < distToFirst) {
      segCoords = segCoords.slice().reverse();
    }

    // Skip duplicate junction point
    if (segCoords[0][0] === last[0] && segCoords[0][1] === last[1]) {
      segCoords = segCoords.slice(1);
    }

    coords.push(...segCoords);
  }

  return coords;
}

/** Build a GPX 1.1 XML string from a route name and coordinates. */
export function buildGpxString(name: string, coordinates: Coord[]): string {
  const escapedName = escapeXml(name);
  const trkpts = coordinates
    .map(([lon, lat]) => `      <trkpt lat="${lat}" lon="${lon}"/>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Walkie" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapedName}</name>
  </metadata>
  <trk>
    <name>${escapedName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

/** Build a KML 2.2 XML string from a route name and coordinates. */
export function buildKmlString(name: string, coordinates: Coord[]): string {
  const escapedName = escapeXml(name);
  const coordText = coordinates
    .map(([lon, lat]) => `${lon},${lat},0`)
    .join(" ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapedName}</name>
    <Placemark>
      <name>${escapedName}</name>
      <LineString>
        <coordinates>${coordText}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
}

/**
 * Parse a GPX XML string and extract [lon, lat] coordinates from all trackpoints.
 * Concatenates all tracks and track segments into a single coordinate array.
 */
export function parseGpx(xmlString: string): Coord[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid GPX file: XML parsing failed.");
  }

  const coords: Coord[] = [];
  const trkpts = doc.getElementsByTagName("trkpt");

  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i];
    const lat = parseFloat(pt.getAttribute("lat") ?? "");
    const lon = parseFloat(pt.getAttribute("lon") ?? "");
    if (!isNaN(lat) && !isNaN(lon)) {
      coords.push([lon, lat]);
    }
  }

  if (coords.length === 0) {
    throw new Error("No trackpoints found in GPX file.");
  }

  return coords;
}

/**
 * Compute perpendicular distance from a point to a line segment in approximate meters.
 * Uses equirectangular approximation, accurate enough at walking-GPS scale.
 */
function perpendicularDistanceMeters(
  point: Coord,
  lineStart: Coord,
  lineEnd: Coord,
): number {
  const DEG_TO_RAD = Math.PI / 180;
  const EARTH_RADIUS = 6_371_000;
  const midLat = ((lineStart[1] + lineEnd[1]) / 2) * DEG_TO_RAD;
  const cosLat = Math.cos(midLat);

  // Convert to approximate meters
  const px = point[0] * cosLat * EARTH_RADIUS * DEG_TO_RAD;
  const py = point[1] * EARTH_RADIUS * DEG_TO_RAD;
  const ax = lineStart[0] * cosLat * EARTH_RADIUS * DEG_TO_RAD;
  const ay = lineStart[1] * EARTH_RADIUS * DEG_TO_RAD;
  const bx = lineEnd[0] * cosLat * EARTH_RADIUS * DEG_TO_RAD;
  const by = lineEnd[1] * EARTH_RADIUS * DEG_TO_RAD;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // lineStart and lineEnd are the same point
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const ex = px - projX;
  const ey = py - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Douglas-Peucker line simplification.
 * Reduces the number of points while preserving shape within the given epsilon (meters).
 */
export function douglasPeucker(coords: Coord[], epsilon: number): Coord[] {
  if (coords.length <= 2) return coords;

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < coords.length - 1; i++) {
    const dist = perpendicularDistanceMeters(
      coords[i],
      coords[0],
      coords[coords.length - 1],
    );
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(coords.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(coords.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [coords[0], coords[coords.length - 1]];
}

/** Default simplification tolerance in meters. */
const DEFAULT_EPSILON_METERS = 5;

/**
 * Parse a GPX string and simplify the resulting coordinates using Douglas-Peucker.
 * Returns raw count, simplified count, and the simplified coordinates.
 */
export function parseAndSimplifyGpx(
  xmlString: string,
  epsilonMeters: number = DEFAULT_EPSILON_METERS,
): { raw: number; simplified: number; coordinates: Coord[] } {
  const rawCoords = parseGpx(xmlString);
  const simplified = douglasPeucker(rawCoords, epsilonMeters);
  return {
    raw: rawCoords.length,
    simplified: simplified.length,
    coordinates: simplified,
  };
}

/** Generate and trigger download of a route file (GPX or KML). */
export function downloadRouteFile(
  route: RouteResponse,
  name: string,
  format: "gpx" | "kml",
): void {
  const coordinates = stitchCoordinates(route.segments.features);

  const content =
    format === "kml"
      ? buildKmlString(name, coordinates)
      : buildGpxString(name, coordinates);

  const mimeType =
    format === "kml"
      ? "application/vnd.google-earth.kml+xml"
      : "application/gpx+xml";

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
