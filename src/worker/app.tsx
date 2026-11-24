import { Hono, type Context } from "hono";
import type { ComponentChildren } from "preact";
import { renderToString } from "preact-render-to-string";
import type { EventEntry } from "../events/types";
import { EventPage, type EventView } from "../pages/Event";
import { Home, type Tab } from "../pages/Home";
import { Layout, type Community, type Head } from "../pages/Layout";
import { NotFound } from "../pages/NotFound";
import { Privacy } from "../pages/Privacy";
import { TicketPage } from "../pages/Ticket";
import { googleCalendarUrl, ics } from "./calendar";
import { parseRegistration, type FormState } from "./form";
import { cancel, findTicket, goingCount, register } from "./registrations";

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Origin used in link previews, calendar entries and ticket links. */
  SITE_URL: string;
  WHATSAPP_COMMUNITY_URL: string;
  INSTAGRAM_URL: string;
  /** Any non-empty value serves draft events. */
  SHOW_DRAFTS: string;
};

type Ctx = Context<{ Bindings: Env }>;

export type AppOptions = { now?: () => Date };

const emptyForm: FormState = { values: {}, errors: {} };

const description =
  "Eventos de rising.sh en Lima: mini hackathons, talleres y charlas. Inscríbete y únete a la comunidad.";

export function createApp(events: EventEntry[], options: AppOptions = {}) {
  const now = options.now ?? (() => new Date());
  const app = new Hono<{ Bindings: Env }>();

  const visible = (c: Ctx) =>
    events.filter((e) => !e.meta.draft || Boolean(c.env.SHOW_DRAFTS));
  const find = (c: Ctx, slug: string) =>
    visible(c).find((e) => e.meta.slug === slug);
  const ended = (entry: EventEntry) => new Date(entry.meta.end) <= now();
  const site = (c: Ctx) => c.env.SITE_URL.replace(/\/$/, "");
  const community = (c: Ctx): Community => ({
    whatsapp: c.env.WHATSAPP_COMMUNITY_URL,
    instagram: c.env.INSTAGRAM_URL,
  });

  const page = (c: Ctx, head: Head, body: ComponentChildren, status = 200) => {
    const html = renderToString(
      <Layout head={head} community={community(c)}>
        {body}
      </Layout>,
    );
    return c.html(`<!doctype html>${html}`, status as 200);
  };

  const notFound = (c: Ctx, what: "page" | "ticket" = "page") =>
    page(
      c,
      {
        title: "No encontrado",
        description,
        url: `${site(c)}${c.req.path}`,
        noindex: true,
      },
      <NotFound what={what} />,
      404,
    );

  const eventPage = (
    c: Ctx,
    entry: EventEntry,
    form: FormState,
    notice: EventView["notice"],
    status = 200,
  ) =>
    goingCount(c.env.DB, entry.meta.slug).then((going) => {
      const url = `${site(c)}/${entry.meta.slug}`;
      const view: EventView = {
        entry,
        going,
        ended: ended(entry),
        form,
        notice,
        calendarUrl: googleCalendarUrl(entry.meta, url),
      };
      const head: Head = {
        title: entry.meta.title,
        description: entry.meta.summary,
        url,
        image: entry.meta.cover && `${site(c)}${entry.meta.cover}`,
        noindex: entry.meta.draft,
      };
      return page(c, head, <EventPage {...view} />, status);
    });

  app.use(async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    // A ticket URL is a secret; no page leaks its own path to another site.
    c.header("Referrer-Policy", "strict-origin");
  });

  app.get("/", (c) => {
    const tab: Tab = c.req.query("ver") === "pasados" ? "pasados" : "proximos";
    const all = visible(c);
    const upcoming = all
      .filter((e) => !ended(e))
      .map((e) => e.meta)
      .sort((a, b) => a.start.localeCompare(b.start));
    const past = all
      .filter(ended)
      .map((e) => e.meta)
      .sort((a, b) => b.start.localeCompare(a.start));
    return page(
      c,
      { title: "up", description, url: `${site(c)}/` },
      <Home
        upcoming={upcoming}
        past={past}
        tab={tab}
        community={community(c)}
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

  app.get("/entrada/:token", async (c) => {
    const ticket = await findTicket(c.env.DB, c.req.param("token"));
    const entry =
      ticket && events.find((e) => e.meta.slug === ticket.eventSlug);
    if (!ticket || !entry) return notFound(c, "ticket");
    c.header("Cache-Control", "no-store");
    const eventUrl = `${site(c)}/${entry.meta.slug}`;
    return page(
      c,
      {
        title: `Tu entrada: ${entry.meta.title}`,
        description: entry.meta.summary,
        url: eventUrl,
        noindex: true,
      },
      <TicketPage
        ticket={ticket}
        event={entry.meta}
        ended={ended(entry)}
        fresh={c.req.query("nueva") !== undefined}
        ticketUrl={`${site(c)}/entrada/${ticket.token}`}
        calendarUrl={googleCalendarUrl(entry.meta, eventUrl)}
        whatsapp={c.env.WHATSAPP_COMMUNITY_URL}
      />,
    );
  });

  app.post("/entrada/:token/cancelar", async (c) => {
    const token = c.req.param("token");
    const ticket = await findTicket(c.env.DB, token);
    const entry =
      ticket && events.find((e) => e.meta.slug === ticket.eventSlug);
    if (!ticket || !entry) return notFound(c, "ticket");
    if (!ended(entry))
      await cancel(c.env.DB, entry.meta, token, now().toISOString());
    return c.redirect(`/entrada/${token}`, 303);
  });

  app.get("/:slug/calendario.ics", (c) => {
    const entry = find(c, c.req.param("slug"));
    if (!entry) return notFound(c);
    const body = ics(
      entry.meta,
      `${site(c)}/${entry.meta.slug}`,
      now().toISOString(),
    );
    return c.body(body, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${entry.meta.slug}.ics"`,
    });
  });

  app.get("/:slug", (c) => {
    const entry = find(c, c.req.param("slug"));
    if (!entry) return notFound(c);
    return eventPage(c, entry, emptyForm, null);
  });

  app.post("/:slug", async (c) => {
    const entry = find(c, c.req.param("slug"));
    if (!entry) return notFound(c);
    if (ended(entry)) return eventPage(c, entry, emptyForm, null, 410);

    const form = await c.req.formData();
    // A person never sees the trap field; a bot that fills it gets the page back.
    if (String(form.get("website") ?? ""))
      return c.redirect(`/${entry.meta.slug}`, 303);

    const parsed = parseRegistration(form, entry.meta);
    if (!parsed.ok) return eventPage(c, entry, parsed, null, 422);

    const result = await register(
      c.env.DB,
      entry.meta,
      parsed.value,
      now().toISOString(),
    );
    if (result.kind === "exists")
      return eventPage(c, entry, emptyForm, "exists", 409);
    return c.redirect(`/entrada/${result.token}?nueva`, 303);
  });

  app.notFound((c) => notFound(c));

  return app;
}
