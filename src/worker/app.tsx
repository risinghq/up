import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { renderSVG } from "uqr";
import { EventPage, type EventView } from "../pages/Event";
import { Home, type Tab } from "../pages/Home";
import { Privacy } from "../pages/Privacy";
import { ProfilePage } from "../pages/Profile";
import { TicketPage } from "../pages/Ticket";
import { Voy } from "../pages/Voy";
import { adminRoutes, SESSION_COOKIE } from "./admin";
import { sessionAdmin } from "./auth";
import { googleCalendarUrl, ics } from "./calendar";
import { renderCard, type CardAssets } from "./card";
import { coverUrl, findEvent, listEvents, type EventMeta } from "./events";
import { parseRegistration, type FormState } from "./form";
import type { Fetch } from "./google";
import { notifyTickets } from "./notify";
import { TOKEN_FIELD, verifyHuman } from "./turnstile";
import {
  cancel,
  claimResend,
  closeProfile,
  findProfile,
  findShare,
  findTicket,
  goingCount,
  openProfile,
  register,
  shareTicket,
} from "./registrations";
import {
  after,
  description,
  notFound,
  page,
  site,
  type AppEnv,
  type Ctx,
} from "./web";

export type { Env } from "./web";

export type AppOptions = {
  now?: () => Date;
  /** Carries the calls to Google and Turnstile. */
  fetch?: Fetch;
  /** Draws the share card; without it the card's URL answers 404. */
  card?: CardAssets;
};

const emptyForm: FormState = { values: {}, errors: {} };

const humanErrors = {
  missing:
    "No pudimos confirmar que eres una persona. Activa JavaScript o recarga la página.",
  refused: "No pudimos confirmar que eres una persona. Inténtalo otra vez.",
};

/** The register form's Turnstile keys, when both are set. */
function humanCheck(c: Ctx) {
  const siteKey = c.env.TURNSTILE_SITE_KEY;
  const secret = c.env.TURNSTILE_SECRET_KEY;
  return siteKey && secret ? { siteKey, secret } : null;
}

/** A repeat registration resends the ticket link at most this often. */
const RESEND_COOLDOWN = 15 * 60 * 1000;

export function createApp(options: AppOptions = {}) {
  const now = options.now ?? (() => new Date());
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
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
      turnstileKey: humanCheck(c)?.siteKey ?? null,
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
        theme: event.theme,
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

  app.route("/admin", adminRoutes(now, fetcher));

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
    const ticketUrl = `${site(c)}/entrada/${ticket.token}`;
    return page(
      c,
      {
        title: `Tu entrada: ${event.title}`,
        description: event.summary,
        url: eventUrl,
        noindex: true,
        theme: event.theme,
      },
      <TicketPage
        ticket={ticket}
        event={event}
        ended={ended(event)}
        fresh={c.req.query("nueva") !== undefined}
        ticketUrl={ticketUrl}
        calendarUrl={googleCalendarUrl(event, eventUrl)}
        meetUrl={
          ticket.status === "going" ? event.calendar?.meetUrl : undefined
        }
        whatsapp={c.env.WHATSAPP_COMMUNITY_URL}
        qr={
          event.place.kind === "venue"
            ? renderSVG(ticketUrl, { border: 2 })
            : undefined
        }
        door={Boolean(c.get("admin"))}
        shareUrl={
          ticket.shareId ? `${eventUrl}/voy/${ticket.shareId}` : undefined
        }
        profileUrl={
          ticket.profileId ? `${site(c)}/p/${ticket.profileId}` : undefined
        }
      />,
    );
  });

  app.post("/entrada/:token/perfil", async (c) => {
    const token = c.req.param("token");
    const ticket = await findTicket(c.env.DB, token);
    if (!ticket) return notFound(c, "ticket");
    await openProfile(c.env.DB, token);
    return c.redirect(`/entrada/${token}#perfil`, 303);
  });

  app.post("/entrada/:token/perfil/ocultar", async (c) => {
    const token = c.req.param("token");
    const ticket = await findTicket(c.env.DB, token);
    if (!ticket) return notFound(c, "ticket");
    await closeProfile(c.env.DB, token);
    return c.redirect(`/entrada/${token}#perfil`, 303);
  });

  app.get("/p/:profileId", async (c) => {
    const profile = await findProfile(c.env.DB, c.req.param("profileId"));
    if (!profile) return notFound(c);
    const attended = new Set(profile.attended);
    const events = (await listEvents(c.env.DB)).filter((e) =>
      attended.has(e.slug),
    );
    c.header("Cache-Control", "no-store");
    return page(
      c,
      {
        title: `${profile.firstName} en up.rising.sh`,
        description: `Los eventos a los que fue ${profile.firstName}.`,
        url: `${site(c)}/p/${c.req.param("profileId")}`,
        noindex: true,
      },
      <ProfilePage firstName={profile.firstName} events={events} />,
    );
  });

  app.post("/entrada/:token/compartir", async (c) => {
    const token = c.req.param("token");
    const ticket = await findTicket(c.env.DB, token);
    if (!ticket) return notFound(c, "ticket");
    await shareTicket(c.env.DB, token);
    return c.redirect(`/entrada/${token}#compartir`, 303);
  });

  app.post("/entrada/:token/cancelar", async (c) => {
    const token = c.req.param("token");
    const ticket = await findTicket(c.env.DB, token);
    const event = ticket && (await findEvent(c.env.DB, ticket.eventSlug));
    if (!ticket || !event) return notFound(c, "ticket");
    if (!ended(event)) {
      const seated = await cancel(c.env.DB, event, token, now().toISOString());
      await after(c, notifyTickets(c.env, fetcher, "promoted", event, seated));
    }
    return c.redirect(`/entrada/${token}`, 303);
  });

  /** A share link's event, when the link is live and the event visible. */
  const sharedEvent = async (c: Ctx, slug: string, shareId: string) => {
    const share = await findShare(c.env.DB, shareId);
    const event = share?.eventSlug === slug && (await visibleEvent(c, slug));
    return share && event ? { share, event } : null;
  };

  app.get("/:slug/voy/:file{[A-Za-z0-9_-]+\\.png}", async (c) => {
    const shareId = c.req.param("file").slice(0, -".png".length);
    const found = await sharedEvent(c, c.req.param("slug"), shareId);
    if (!found || !options.card) return notFound(c);
    const png = await renderCard(
      options.card,
      found.share.firstName,
      found.event,
      ended(found.event),
    );
    return c.body(new Uint8Array(png), 200, {
      "Content-Type": "image/png",
      // The title or date may change, so a crawler refetches within the hour.
      "Cache-Control": "public, max-age=3600",
    });
  });

  app.get("/:slug/voy/:shareId", async (c) => {
    const found = await sharedEvent(
      c,
      c.req.param("slug"),
      c.req.param("shareId"),
    );
    if (!found) return notFound(c);
    const { share, event } = found;
    const url = `${site(c)}/${event.slug}/voy/${c.req.param("shareId")}`;
    const verb = ended(event) ? "fue a" : "va a";
    return page(
      c,
      {
        title: `${share.firstName} ${verb} ${event.title}`,
        description: event.summary,
        url,
        image: options.card && `${url}.png`,
        noindex: true,
        theme: event.theme,
      },
      <Voy firstName={share.firstName} event={event} ended={ended(event)} />,
    );
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

    const check = humanCheck(c);
    if (check) {
      const verdict = await verifyHuman(
        fetcher,
        check.secret,
        String(form.get(TOKEN_FIELD) ?? ""),
        c.req.header("CF-Connecting-IP") ?? null,
      );
      if (verdict !== "human") {
        const errors = { human: humanErrors[verdict] };
        return eventPage(
          c,
          event,
          { values: parsed.values, errors },
          null,
          422,
        );
      }
    }

    const result = await register(
      c.env.DB,
      event,
      parsed.value,
      now().toISOString(),
    );
    if (result.kind === "exists") {
      if (await claimResend(c.env.DB, result.token, now(), RESEND_COOLDOWN))
        await after(
          c,
          notifyTickets(c.env, fetcher, "again", event, [result.token]),
        );
      return eventPage(c, event, emptyForm, "exists", 409);
    }
    await after(
      c,
      notifyTickets(c.env, fetcher, result.status, event, [result.token]),
    );
    return c.redirect(`/entrada/${result.token}?nueva`, 303);
  });

  app.notFound((c) => notFound(c));

  return app;
}
