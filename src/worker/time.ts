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
