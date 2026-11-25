import type { Theme } from "../worker/events";

type Rgb = [number, number, number];

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toGamma = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

const parseHex = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

/** OKLCH of a #rrggbb color, hue in degrees. */
export function oklch(hex: string) {
  const [r, g, b] = parseHex(hex).map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { L, C: Math.hypot(A, B), h: (h + 360) % 360 };
}

/** Linear sRGB of an OKLCH color; channels fall outside 0..1 out of gamut. */
function linearRgb(L: number, C: number, h: number): Rgb {
  const A = C * Math.cos((h * Math.PI) / 180);
  const B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707695041 * s,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** The most chroma sRGB can show at this lightness and hue. */
function maxChroma(L: number, h: number) {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(linearRgb(L, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** sRGB 0..255 channels of an in-gamut OKLCH color. */
function rgb255(L: number, C: number, h: number): Rgb {
  return linearRgb(L, C, h).map((c) =>
    Math.round(toGamma(Math.min(Math.max(c, 0), 1)) * 255),
  ) as Rgb;
}

const hex = (rgb: Rgb) =>
  `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/**
 * Luma's tint steps: a fixed lightness per step at the accent's hue, with a
 * chroma curve that peaks at step 50 and is clamped to the sRGB gamut. The
 * values were measured from Luma's generated palettes for red, green and blue
 * tints; any accent of the same hue gets the same palette, as on Luma.
 */
const steps = {
  5: [0.99, 0.004],
  10: [0.96, 0.02],
  20: [0.95, 0.024],
  30: [0.85, 0.081],
  40: [0.65, 0.135],
  50: [0.57, 0.18],
  60: [0.5, 0.163],
  70: [0.4, 0.135],
  80: [0.3, 0.09],
  90: [0.2, 0.044],
} as const;

export type Step = keyof typeof steps;

/** Below this chroma an accent reads as gray and gets the neutral palette. */
const grayChroma = 0.03;

/** The accent's tint palette, or null for a gray accent. */
export function palette(accent: string) {
  const { C, h } = oklch(accent);
  if (C < grayChroma) return null;
  const color = (L: number, c: number) =>
    rgb255(L, Math.min(c, maxChroma(L, h)), h);
  const brand = Object.fromEntries(
    Object.entries(steps).map(([step, [L, c]]) => [step, hex(color(L, c))]),
  ) as Record<Step, string>;
  // Text and dividers are a near-black of the hue, as Luma's black-base.
  const black = color(0.19, 0.08);
  return { brand, black };
}

/**
 * The inline style that themes one event's page or card. The neutral
 * palette is the stylesheet's default, so a gray accent sets nothing more.
 */
export function themeStyle(theme: Theme) {
  const tint = palette(theme.accent);
  if (!tint) return `--accent:${theme.accent}`;
  const { brand, black } = tint;
  return [
    `--accent:${theme.accent}`,
    `--black-base-rgb:${black.join(",")}`,
    `--brand-10:${brand[10]}`,
    `--brand-30:${brand[30]}`,
    `--brand-40:${brand[40]}`,
    `--brand-50:${brand[50]}`,
    `--brand-60:${brand[60]}`,
    `--brand-70:${brand[70]}`,
    `--brand-80:${brand[80]}`,
    `--event-primary-button-bg-color:${brand[50]}`,
    `--event-primary-button-hover-bg-color:${brand[40]}`,
  ].join(";");
}

export const themeClass = (theme: Theme) =>
  `kind-${theme.kind} backdrop-${theme.backdrop} font-${theme.font}`;
