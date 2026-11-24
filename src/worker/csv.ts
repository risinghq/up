import type { EventMeta } from "./events";
import type { Registrant } from "./registrations";

/**
 * A spreadsheet runs a cell that starts with = + - @ tab or CR as a formula.
 * Registrants type these cells, so a leading quote keeps them text.
 */
const inert = (value: string) =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

const cell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** The registrants as CSV, one column per extra question. */
export function registrantsCsv(
  event: EventMeta,
  registrants: Registrant[],
): string {
  const header = [
    "numero",
    "estado",
    "nombre",
    "correo",
    "whatsapp",
    "novedades",
    "inscrito",
    ...event.questions.map((q) => q.label),
  ];
  const rows = registrants.map((r) => [
    String(r.number),
    r.status,
    inert(r.name),
    inert(r.email),
    // E.164 starts with +, and a quote would break the number for import.
    r.phone,
    r.newsOptIn ? "si" : "no",
    r.createdAt,
    ...event.questions.map((q) => inert(r.answers[q.id] ?? "")),
  ]);
  return [header.map(inert), ...rows]
    .map((row) => row.map(cell).join(","))
    .join("\r\n")
    .concat("\r\n");
}
