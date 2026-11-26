// Events happen in Lima; every date on the site is shown in Lima time,
// whatever the visitor's own zone.
const zone = "America/Lima";

const parts = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-PE", { timeZone: zone, ...options }).format(
    new Date(iso),
  );

/** "sábado 12 de diciembre" */
export const longDate = (iso: string) =>
  parts(iso, { weekday: "long", day: "numeric", month: "long" });

/** "diciembre de 2026" */
export const monthYear = (iso: string) =>
  parts(iso, { month: "long", year: "numeric" });

/** "12 de diciembre de 2026" */
export const fullDate = (iso: string) =>
  parts(iso, { day: "numeric", month: "long", year: "numeric" });

/**
 * The days from start to end, saying the month and year once:
 * "12 de diciembre de 2026", "del 12 al 13 de diciembre de 2026",
 * "del 30 de noviembre al 2 de diciembre de 2026".
 */
export function dateSpan(start: string, end: string): string {
  const year = (iso: string) => parts(iso, { year: "numeric" });
  const month = (iso: string) => parts(iso, { month: "long" });
  const last = fullDate(end);

  if (fullDate(start) === last) return last;
  if (year(start) !== year(end)) return `del ${fullDate(start)} al ${last}`;
  if (month(start) !== month(end))
    return `del ${parts(start, { day: "numeric", month: "long" })} al ${last}`;
  return `del ${parts(start, { day: "numeric" })} al ${last}`;
}

/** "12 dic 2026" */
export const shortDate = (iso: string) =>
  parts(iso, { day: "numeric", month: "short", year: "numeric" }).replace(
    ".",
    "",
  );

/** "3:00 p. m." */
export const clock = (iso: string) =>
  parts(iso, { hour: "numeric", minute: "2-digit" });

/** The month and day of the calendar tile: { month: "DIC", day: "12" }. */
export const tile = (iso: string) => ({
  month: parts(iso, { month: "short" }).replace(".", "").toUpperCase(),
  day: parts(iso, { day: "numeric" }),
});
