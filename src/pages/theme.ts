import type { Theme } from "../worker/events";

const channel = (hex: string, at: number) => {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of a #rrggbb color. */
const luminance = (hex: string) =>
  0.2126 * channel(hex, 1) +
  0.7152 * channel(hex, 3) +
  0.0722 * channel(hex, 5);

/**
 * Text on the accent is black or white, whichever contrasts more, so an
 * admin's color choice cannot make a button unreadable.
 */
export const accentInk = (hex: string) =>
  (luminance(hex) + 0.05) / 0.05 > 1.05 / (luminance(hex) + 0.05)
    ? "#0a0a0a"
    : "#ffffff";

/** The inline style that themes one event's page or card. */
export const themeStyle = (theme: Theme) =>
  `--accent:${theme.accent};--accent-ink:${accentInk(theme.accent)}`;

export const themeClass = (theme: Theme) =>
  `kind-${theme.kind} backdrop-${theme.backdrop}`;
