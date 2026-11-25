import type { Fetch } from "./google";

/** A spot on the map, in degrees. */
export type Point = { lat: number; lng: number };

const number = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

/** Both groups of a pattern match: a latitude, then a longitude. */
const toPoint = (match: RegExpExecArray): Point | null => {
  const point = { lat: Number(match[1]), lng: Number(match[2]) };
  return Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 ? point : null;
};

/** "-12.0599, -77.0817", the form Google Maps copies on a right click. */
export function parsePoint(text: string): Point | null {
  const match = new RegExp(`^${number}\\s*,\\s*${number}$`).exec(text.trim());
  return match ? toPoint(match) : null;
}

// The place's own pin comes first: "@lat,lng" in a Google link is the view's
// center, which drifts from the pin when the admin pans before copying.
const urlPatterns = [
  new RegExp(`!3d${number}!4d${number}`),
  new RegExp(`[?&](?:q|query|ll|destination)=${number},\\s*${number}`),
  new RegExp(`mlat=${number}&mlon=${number}`),
  new RegExp(`#map=\\d+/${number}/${number}`),
  new RegExp(`@${number},${number}`),
];

/** The point a Google Maps or OpenStreetMap link carries, if any. */
export function pointInUrl(url: string): Point | null {
  const decoded = decodeURIComponent(url);
  for (const pattern of urlPatterns) {
    const match = pattern.exec(decoded);
    if (match) return toPoint(match);
  }
  return null;
}

const shortHosts = new Set(["maps.app.goo.gl", "goo.gl"]);

/**
 * The point behind a map link. A short Google link carries none itself, so
 * this follows its redirects, at most three, until a link does.
 */
export async function locate(
  fetcher: Fetch,
  url: string,
): Promise<Point | null> {
  let current = url;
  for (let hop = 0; hop < 3; hop++) {
    const point = pointInUrl(current);
    if (point || !shortHosts.has(new URL(current).hostname)) return point;
    const res = await fetcher(current, { redirect: "manual" });
    const next = res.headers.get("location");
    if (!next) return null;
    current = new URL(next, current).href;
  }
  return pointInUrl(current);
}

/** A Google Maps link that opens the point, for a venue given as coordinates. */
export const pointUrl = ({ lat, lng }: Point) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
