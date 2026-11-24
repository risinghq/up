import {
  backdrops,
  fonts,
  kinds,
  type Backdrop,
  type EventMeta,
  type Font,
  type Kind,
} from "./events";
import type { FormState } from "./form";
import { formatQuestions, parseQuestions } from "./questions";

/** Paths the Worker routes itself; an event cannot take them. */
const reservedSlugs = new Set([
  "admin",
  "entrada",
  "privacidad",
  "media",
  "assets",
]);

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const accentPattern = /^#[0-9a-f]{6}$/;

// Lima has kept UTC-5 without daylight saving since 1994.
const LIMA = "-05:00";

/** An instant as a datetime-local value in Lima time: 2026-12-12T15:00. */
export const toLimaInput = (iso: string) =>
  new Date(Date.parse(iso) - 5 * 60 * 60 * 1000).toISOString().slice(0, 16);

const fromLimaInput = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00${LIMA}` : null;

const isUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** An event as the editor's fields show it. */
export function eventValues(event: EventMeta): Record<string, string> {
  const place = event.place;
  return {
    title: event.title,
    slug: event.slug,
    summary: event.summary,
    body: event.body,
    start: toLimaInput(event.start),
    end: toLimaInput(event.end),
    place_kind: place.kind,
    place_name: place.kind === "venue" ? place.name : place.platform,
    place_address: place.kind === "venue" ? place.address : "",
    map_url: place.kind === "venue" ? (place.mapUrl ?? "") : "",
    hosts: event.hosts.join(", "),
    capacity: event.capacity === undefined ? "" : String(event.capacity),
    questions: formatQuestions(event.questions),
    status: event.status,
    recording_url: event.recordingUrl ?? "",
    kind: event.theme.kind,
    accent: event.theme.accent,
    backdrop: event.theme.backdrop,
    font: event.theme.font,
    featured: event.featured ? "on" : "",
  };
}

export type ParsedEvent =
  | { ok: true; event: EventMeta; cover: File | null; removeCover: boolean }
  | ({ ok: false } & FormState);

export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export const coverTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Reads the editor form. `lockedSlug` is the slug of an event that already
 * has registrations: it wins over whatever the form sent.
 */
export function parseEventForm(
  form: FormData,
  lockedSlug?: string,
): ParsedEvent {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const values = {
    title: text("title"),
    slug: lockedSlug ?? text("slug"),
    summary: text("summary"),
    body: String(form.get("body") ?? "").replace(/\r\n/g, "\n"),
    start: text("start"),
    end: text("end"),
    place_kind: text("place_kind"),
    place_name: text("place_name"),
    place_address: text("place_address"),
    map_url: text("map_url"),
    hosts: text("hosts"),
    capacity: text("capacity"),
    questions: text("questions"),
    status: text("status"),
    recording_url: text("recording_url"),
    kind: text("kind"),
    accent: text("accent").toLowerCase(),
    backdrop: text("backdrop"),
    font: text("font") || "sans",
    featured: form.get("featured") ? "on" : "",
  };
  const errors: Record<string, string> = {};

  if (!values.title) errors.title = "Escribe un título.";
  else if (values.title.length > 120) errors.title = "Máximo 120 caracteres.";
  if (!slugPattern.test(values.slug) || values.slug.length > 60)
    errors.slug =
      "Usa minúsculas, números y guiones, por ejemplo taller-qiskit.";
  else if (reservedSlugs.has(values.slug))
    errors.slug = "Esa dirección la usa el sitio. Elige otra.";
  if (!values.summary) errors.summary = "Escribe un resumen.";
  else if (values.summary.length > 300)
    errors.summary = "Máximo 300 caracteres.";
  if (values.body.length > 20_000) errors.body = "Máximo 20 000 caracteres.";

  const start = fromLimaInput(values.start);
  const end = fromLimaInput(values.end);
  if (!start) errors.start = "Elige fecha y hora de inicio.";
  if (!end) errors.end = "Elige fecha y hora de fin.";
  else if (start && Date.parse(end) <= Date.parse(start))
    errors.end = "El fin va después del inicio.";

  const online = values.place_kind === "online";
  if (!values.place_name)
    errors.place_name = online
      ? "Escribe la plataforma, por ejemplo Google Meet."
      : "Escribe el nombre del lugar.";
  if (!online && !values.place_address)
    errors.place_address = "Escribe la dirección.";
  if (!online && values.map_url && !isUrl(values.map_url))
    errors.map_url = "Pega un enlace que empiece con https://.";

  const hosts = values.hosts
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (!hosts.length) errors.hosts = "Escribe al menos un organizador.";

  let capacity: number | undefined;
  if (values.capacity) {
    capacity = Number(values.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100_000)
      errors.capacity = "Un número entero mayor que cero, o vacío sin límite.";
  }

  const questions = parseQuestions(values.questions);
  if (questions.length > 20) errors.questions = "Máximo 20 preguntas.";

  if (values.recording_url && !isUrl(values.recording_url))
    errors.recording_url = "Pega un enlace que empiece con https://.";
  if (!kinds.includes(values.kind as Kind)) errors.kind = "Elige un tipo.";
  if (!accentPattern.test(values.accent))
    errors.accent = "Un color como #2563eb.";
  if (!backdrops.includes(values.backdrop as Backdrop))
    errors.backdrop = "Elige un fondo.";
  if (!fonts.includes(values.font as Font)) errors.font = "Elige una letra.";
  const status = values.status === "published" ? "published" : "draft";

  const file = form.get("cover");
  const cover = file instanceof File && file.size > 0 ? file : null;
  if (cover && !coverTypes[cover.type])
    errors.cover = "Sube una imagen JPG, PNG o WebP.";
  else if (cover && cover.size > MAX_COVER_BYTES)
    errors.cover = "La imagen pesa más de 5 MB.";

  if (Object.keys(errors).length || !start || !end)
    return { ok: false, values, errors };
  return {
    ok: true,
    cover,
    removeCover: Boolean(form.get("remove_cover")),
    event: {
      slug: values.slug,
      title: values.title,
      summary: values.summary,
      body: values.body,
      start,
      end,
      place: online
        ? { kind: "online", platform: values.place_name }
        : {
            kind: "venue",
            name: values.place_name,
            address: values.place_address,
            ...(values.map_url ? { mapUrl: values.map_url } : {}),
          },
      hosts,
      ...(capacity !== undefined ? { capacity } : {}),
      questions,
      status,
      ...(values.recording_url ? { recordingUrl: values.recording_url } : {}),
      theme: {
        kind: values.kind as Kind,
        accent: values.accent,
        backdrop: values.backdrop as Backdrop,
        font: values.font as Font,
      },
      featured: values.featured === "on",
    },
  };
}
