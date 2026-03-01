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
