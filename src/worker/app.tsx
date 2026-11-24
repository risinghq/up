import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { EventPage, type EventView } from "../pages/Event";
import { Home, type Tab } from "../pages/Home";
import { Privacy } from "../pages/Privacy";
import { TicketPage } from "../pages/Ticket";
import { adminRoutes, SESSION_COOKIE } from "./admin";
import { sessionAdmin } from "./auth";
import { googleCalendarUrl, ics } from "./calendar";
import { coverUrl, findEvent, listEvents, type EventMeta } from "./events";
import { parseRegistration, type FormState } from "./form";
import { cancel, findTicket, goingCount, register } from "./registrations";
import {
  description,
  notFound,
  page,
  site,
  type AppEnv,
  type Ctx,
} from "./web";

export type { Env } from "./web";

export type AppOptions = { now?: () => Date };

const emptyForm: FormState = { values: {}, errors: {} };

export function createApp(options: AppOptions = {}) {
  const now = options.now ?? (() => new Date());
  const app = new Hono<AppEnv>();

  const ended = (event: EventMeta) => new Date(event.end) <= now();

  /** An event the visitor may see: published, or any event for an admin. */
  const visibleEvent = async (c: Ctx, slug: string) => {
    const event = await findEvent(c.env.DB, slug);
    return event && (event.status === "published" || c.get("admin"))
      ? event
      : null;
  };

  const eventPage = async (
    c: Ctx,
    event: EventMeta,
    form: FormState,
    notice: EventView["notice"],
    status = 200,
  ) => {
    const going = await goingCount(c.env.DB, event.slug);
    const url = `${site(c)}/${event.slug}`;
    const cover = coverUrl(event);
    const view: EventView = {
      event,
      going,
      ended: ended(event),
      form,
      notice,
      calendarUrl: googleCalendarUrl(event, url),
      admin: Boolean(c.get("admin")),
    };
    if (view.admin || event.status === "draft")
      c.header("Cache-Control", "no-store");
    return page(
      c,
      {
        title: event.title,
        description: event.summary,
        url,
        image: cover && `${site(c)}${cover}`,
        noindex: event.status === "draft",
      },
      <EventPage {...view} />,
      status,
    );
  };

  app.use(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    c.set(
      "admin",
      token ? await sessionAdmin(c.env.DB, token, now().toISOString()) : null,
    );
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    // A ticket URL is a secret; no page leaks its own path to another site.
    c.header("Referrer-Policy", "strict-origin");
  });

  app.route("/admin", adminRoutes(now));

  app.get("/", async (c) => {
    const tab: Tab = c.req.query("ver") === "pasados" ? "pasados" : "proximos";
    const admin = Boolean(c.get("admin"));
    const all = (await listEvents(c.env.DB)).filter(
      (e) => admin || e.status === "published",
    );
    if (admin) c.header("Cache-Control", "no-store");
    const upcoming = all.filter((e) => !ended(e));
    const past = all.filter(ended).reverse();
    return page(
      c,
      { title: "up", description, url: `${site(c)}/` },
      <Home
        upcoming={upcoming}
        past={past}
        tab={tab}
        community={{
          whatsapp: c.env.WHATSAPP_COMMUNITY_URL,
          instagram: c.env.INSTAGRAM_URL,
        }}
      />,
    );
  });

  app.get("/privacidad", (c) =>
    page(
      c,
      {
        title: "Privacidad",
        description: "Qué datos pide up.rising.sh y para qué.",
        url: `${site(c)}/privacidad`,
      },
      <Privacy />,
    ),
  );

  // Cover keys carry a random part and never change content, so a browser
  // may keep one for a year.
  app.get("/media/:key{.+}", async (c) => {
    const object = await c.env.MEDIA.get(c.req.param("key"));
    if (!object) return notFound(c);
    return c.body(object.body, 200, {
      "Content-Type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: object.httpEtag,
    });
  });

  app.get("/entrada/:token", async (c) => {
    const ticket = await findTicket(c.env.DB, c.req.param("token"));
    const event = ticket && (await findEvent(c.env.DB, ticket.eventSlug));
    if (!ticket || !event) return notFound(c, "ticket");
    c.header("Cache-Control", "no-store");
    const eventUrl = `${site(c)}/${event.slug}`;
    return page(
      c,
      {
        title: `Tu entrada: ${event.title}`,
        description: event.summary,
        url: eventUrl,
        noindex: true,
      },
      <TicketPage
        ticket={ticket}
        event={event}
        ended={ended(event)}
        fresh={c.req.query("nueva") !== undefined}
        ticketUrl={`${site(c)}/entrada/${ticket.token}`}
        calendarUrl={googleCalendarUrl(event, eventUrl)}
        whatsapp={c.env.WHATSAPP_COMMUNITY_URL}
      />,
    );
  });

  app.post("/entrada/:token/cancelar", async (c) => {
    const token = c.req.param("token");
    const ticket = await findTicket(c.env.DB, token);
    const event = ticket && (await findEvent(c.env.DB, ticket.eventSlug));
    if (!ticket || !event) return notFound(c, "ticket");
    if (!ended(event))
      await cancel(c.env.DB, event, token, now().toISOString());
    return c.redirect(`/entrada/${token}`, 303);
  });

  app.get("/:slug/calendario.ics", async (c) => {
    const event = await visibleEvent(c, c.req.param("slug"));
    if (!event) return notFound(c);
    const body = ics(event, `${site(c)}/${event.slug}`, now().toISOString());
    return c.body(body, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
    });
  });

  app.get("/:slug", async (c) => {
    const event = await visibleEvent(c, c.req.param("slug"));
    if (!event) return notFound(c);
    return eventPage(c, event, emptyForm, null);
  });

  app.post("/:slug", async (c) => {
    const event = await visibleEvent(c, c.req.param("slug"));
    if (!event) return notFound(c);
    if (ended(event)) return eventPage(c, event, emptyForm, null, 410);

    const form = await c.req.formData();
    // A person never sees the trap field; a bot that fills it gets the page back.
    if (String(form.get("website") ?? ""))
      return c.redirect(`/${event.slug}`, 303);

    const parsed = parseRegistration(form, event);
    if (!parsed.ok) return eventPage(c, event, parsed, null, 422);

    const result = await register(
      c.env.DB,
      event,
      parsed.value,
      now().toISOString(),
    );
    if (result.kind === "exists")
      return eventPage(c, event, emptyForm, "exists", 409);
    return c.redirect(`/entrada/${result.token}?nueva`, 303);
  });

  app.notFound((c) => notFound(c));

  return app;
}
