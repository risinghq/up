import { Hono } from "hono";
import { EventEditor, type EditorView } from "../../../pages/admin/EventEditor";
import { coverTypes, eventValues, parseEventForm } from "../../eventForm";
import {
  coverUrl,
  eventUrl,
  findEvent,
  saveEvent,
  type EventMeta,
} from "../../events";
import type { FormState } from "../../form";
import { findPlaces } from "../../geo";
import { syncCalendar } from "../../google/calendar";
import { notifyTickets } from "../../notify";
import { fillSeats } from "../../registrations";
import { registrationCount } from "../../registrants";
import { newToken } from "../../tokens";
import { after, site, type AppEnv, type Ctx, type Deps } from "../../web";
import { adminPage, withEvent } from "./page";

/** The fields a new event starts with. */
const blankEvent: Record<string, string> = {
  place_kind: "venue",
  place_name: "Facultad de Ciencias Físicas, UNMSM",
  place_address: "Av. Venezuela s/n, Cercado de Lima",
  kind: "workshop",
  accent: "#2563eb",
  backdrop: "grid",
  font: "sans",
  status: "draft",
};

const taken = (form: FormState) => ({
  ...form,
  errors: { ...form.errors, slug: "Ya hay un evento con esta dirección." },
});

/**
 * Stores an uploaded cover and returns its key, or keeps or drops the
 * current one. The caller deletes `stale` once the event row is saved.
 */
async function placeCover(
  media: R2Bucket,
  parsed: { cover: File | null; removeCover: boolean },
  slug: string,
  current?: string,
): Promise<{ key?: string; stale?: string }> {
  if (parsed.cover) {
    const type = parsed.cover.type;
    const key = `covers/${slug}-${newToken().slice(0, 8)}.${coverTypes[type]}`;
    await media.put(key, await parsed.cover.arrayBuffer(), {
      httpMetadata: { contentType: type },
    });
    return { key, stale: current };
  }

  if (parsed.removeCover) return { stale: current };
  return { key: current };
}

/** The event editor: create, edit, and the place search it calls. */
export function editorRoutes({ now, fetch: fetcher }: Deps) {
  const routes = new Hono<AppEnv>();
  const iso = () => now().toISOString();

  /** The editor of `event`, or of a new event when it is absent. */
  const editor = (
    c: Ctx,
    view: Pick<EditorView, "form" | "registrations" | "coverUrl"> &
      Partial<EditorView>,
    event?: EventMeta,
    status = 200,
  ) =>
    adminPage(
      c,
      event ? `Editar: ${event.title}` : "Crear evento",
      <EventEditor
        view={{ saved: false, calendarError: false, ...view }}
        event={event}
      />,
      { status },
    );

  routes.get("/lugares", async (c) => {
    const query = (c.req.query("q") ?? "").slice(0, 200);
    if (query.trim().length < 3) return c.json({ places: [] });

    try {
      return c.json({ places: await findPlaces(fetcher, query) });
    } catch (error) {
      console.error(error);
      return c.json({ error: "La búsqueda no respondió." }, 502);
    }
  });

  routes.get("/eventos/nuevo", (c) =>
    editor(c, { form: { values: blankEvent, errors: {} }, registrations: 0 }),
  );

  routes.post("/eventos/nuevo", async (c) => {
    const parsed = parseEventForm(await c.req.formData());
    if (!parsed.ok)
      return editor(c, { form: parsed, registrations: 0 }, undefined, 422);

    const event = parsed.event;
    if (await findEvent(c.var.db, event.slug))
      return editor(
        c,
        {
          form: taken({ values: eventValues(event), errors: {} }),
          registrations: 0,
        },
        undefined,
        409,
      );

    const cover = await placeCover(c.env.MEDIA, parsed, event.slug);
    await saveEvent(c.var.db, { ...event, coverKey: cover.key }, iso());
    return c.redirect(`/admin/eventos/${event.slug}?creado`, 303);
  });

  routes.get(
    "/eventos/:slug/editar",
    withEvent(async (c, event) =>
      editor(
        c,
        {
          form: { values: eventValues(event), errors: {} },
          registrations: await registrationCount(c.var.db, event.slug),
          coverUrl: coverUrl(event),
          saved: c.req.query("guardado") !== undefined,
          calendarError: c.req.query("calendario") === "error",
        },
        event,
      ),
    ),
  );

  routes.post(
    "/eventos/:slug/editar",
    withEvent(async (c, current) => {
      const registrations = await registrationCount(c.var.db, current.slug);
      const parsed = parseEventForm(
        await c.req.formData(),
        registrations ? current.slug : undefined,
      );
      const base = { registrations, coverUrl: coverUrl(current) };
      if (!parsed.ok) return editor(c, { ...base, form: parsed }, current, 422);

      const event = parsed.event;
      if (
        event.slug !== current.slug &&
        (await findEvent(c.var.db, event.slug))
      )
        return editor(
          c,
          { ...base, form: taken({ values: eventValues(event), errors: {} }) },
          current,
          409,
        );

      const cover = await placeCover(
        c.env.MEDIA,
        parsed,
        event.slug,
        current.coverKey,
      );
      const saved = {
        ...event,
        coverKey: cover.key,
        calendar: current.calendar,
      };
      await saveEvent(c.var.db, saved, iso(), current.slug);
      if (cover.stale) await c.env.MEDIA.delete(cover.stale);

      // A raised capacity seats the waitlist now, not at the next cancellation.
      const seated = await fillSeats(c.var.db, saved);
      await after(
        c,
        notifyTickets(c.var.db, c.env, fetcher, "promoted", saved, seated),
      );

      const synced =
        !saved.calendar ||
        (await syncCalendar(
          c.var.db,
          c.env,
          fetcher,
          saved,
          eventUrl(site(c), saved),
        ));
      return c.redirect(
        `/admin/eventos/${event.slug}/editar?guardado${synced ? "" : "&calendario=error"}`,
        303,
      );
    }),
  );

  return routes;
}
