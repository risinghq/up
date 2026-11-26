import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { CertificatePage } from "../pages/Certificate";
import { EventPage, type Notice } from "../pages/Event";
import { Home, type Tab } from "../pages/Home";
import { Privacy } from "../pages/Privacy";
import { ProfilePage } from "../pages/Profile";
import { TicketPage } from "../pages/Ticket";
import { Voy } from "../pages/Voy";
import { accountRoutes } from "./account";
import { adminRoutes } from "./admin";
import { sessionAccount } from "./auth";
import { ics } from "./calendar";
import { DOOR_COOKIE, doorCookieEvent, doorRoutes, worksDoor } from "./door";
import { renderCard, type CardAssets } from "./card";
import { findCertificate, issuesCertificates } from "./certificates";
import {
  coverUrl,
  findEvent,
  hasEnded,
  listEvents,
  type EventMeta,
} from "./events";
import { emptyForm, type FormState } from "./form";
import type { Fetch } from "./google";
import { notifyTickets } from "./notify";
import {
  closeProfile,
  findProfile,
  openProfile,
  profilesByEmail,
} from "./profiles";
import { cancel, findTicket, goingCount } from "./registrations";
import { eventRoles, rolesOf } from "./roles";
import { findShare, shareTicket } from "./shares";
import { phoneOf } from "./people";
import { SESSION_COOKIE } from "./session";
import { signUp } from "./signup";
import {
  certificateView,
  eventUrl,
  eventView,
  profileView,
  ticketView,
  type ViewContext,
} from "./views";
import {
  after,
  description,
  humanCheck,
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

export function createApp(options: AppOptions = {}) {
  const now = options.now ?? (() => new Date());
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  const app = new Hono<AppEnv>();

  const ended = (event: EventMeta) => hasEnded(event, now());
  const viewContext = (c: Ctx): ViewContext => ({
    origin: site(c),
    now: now(),
  });

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
    notice: Notice,
    status = 200,
  ) => {
    const team = await eventRoles(c.env.DB, event.slug);
    const emails = team.flatMap((person) =>
      person.email ? [person.email] : [],
    );
    const view = eventView(viewContext(c), {
      event,
      going: await goingCount(c.env.DB, event.slug),
      team,
      profiles: await profilesByEmail(c.env.DB, emails),
      form,
      notice,
      admin: Boolean(c.get("admin")),
      turnstileKey: humanCheck(c)?.siteKey ?? null,
    });

    if (view.admin || event.status === "draft")
      c.header("Cache-Control", "no-store");
    const cover = coverUrl(event);
    return page(
      c,
      {
        title: event.title,
        description: event.summary,
        url: eventUrl(site(c), event),
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
    const account = token
      ? await sessionAccount(c.env.DB, token, now().toISOString())
      : null;
    c.set("account", account);
    c.set("admin", account?.admin ? account : null);
    c.set("door", await doorCookieEvent(c.env.DB, getCookie(c, DOOR_COOKIE)));
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    // A ticket URL is a secret; no page leaks its own path to another site.
    c.header("Referrer-Policy", "strict-origin");
  });

  app.route("/admin", adminRoutes(now, fetcher));
  app.route("/", accountRoutes(now, fetcher));
  app.route("/puerta", doorRoutes(now, fetcher));

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

    const view = ticketView(viewContext(c), {
      ticket,
      event,
      fresh: c.req.query("nueva") !== undefined,
      door: worksDoor(c, event, now()),
      whatsapp: c.env.WHATSAPP_COMMUNITY_URL,
      hasRole: (await rolesOf(c.env.DB, ticket.email)).length > 0,
    });

    c.header("Cache-Control", "no-store");
    return page(
      c,
      {
        title: `Tu entrada: ${event.title}`,
        description: event.summary,
        url: eventUrl(site(c), event),
        noindex: true,
        theme: event.theme,
      },
      <TicketPage {...view} />,
    );
  });

  app.post("/entrada/:token/perfil", async (c) => {
    const token = c.req.param("token");
    const ticket = await findTicket(c.env.DB, token);
    if (!ticket) return notFound(c, "ticket");
    await openProfile(c.env.DB, ticket.personId);
    return c.redirect(`/entrada/${token}#perfil`, 303);
  });

  app.post("/entrada/:token/perfil/ocultar", async (c) => {
    const token = c.req.param("token");
    const ticket = await findTicket(c.env.DB, token);
    if (!ticket) return notFound(c, "ticket");
    await closeProfile(c.env.DB, ticket.personId);
    return c.redirect(`/entrada/${token}#perfil`, 303);
  });

  app.get("/p/:profileId", async (c) => {
    const profileId = c.req.param("profileId");
    const profile = await findProfile(c.env.DB, profileId);
    if (!profile) return notFound(c);
    const view = profileView(profile, await listEvents(c.env.DB));

    c.header("Cache-Control", "no-store");
    return page(
      c,
      {
        title: `${view.firstName} en up.rising.sh`,
        description: view.description,
        url: `${site(c)}/p/${profileId}`,
        noindex: true,
      },
      <ProfilePage {...view} />,
    );
  });

  app.get("/c/:id", async (c) => {
    const certificate = await findCertificate(c.env.DB, c.req.param("id"));
    const event =
      certificate && (await findEvent(c.env.DB, certificate.eventSlug));
    if (!certificate || !event || !issuesCertificates(event, now()))
      return notFound(c);

    const view = certificateView(viewContext(c), certificate, event);
    c.header("Cache-Control", "no-store");
    return page(
      c,
      {
        title: `Certificado: ${view.name}`,
        description: `${view.name} ${view.verb} ${event.title}.`,
        url: view.url,
        noindex: true,
        theme: event.theme,
      },
      <CertificatePage {...view} />,
    );
  });

  app.post("/entrada/:token/compartir", async (c) => {
    const token = c.req.param("token");
    if (!(await findTicket(c.env.DB, token))) return notFound(c, "ticket");
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
    const shareId = c.req.param("shareId");
    const found = await sharedEvent(c, c.req.param("slug"), shareId);
    if (!found) return notFound(c);

    const { share, event } = found;
    const url = `${eventUrl(site(c), event)}/voy/${shareId}`;
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
    const body = ics(event, eventUrl(site(c), event), now().toISOString());
    return c.body(body, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
    });
  });

  app.get("/:slug", async (c) => {
    const event = await visibleEvent(c, c.req.param("slug"));
    if (!event) return notFound(c);

    // A signed-in person finds the form filled with what the account holds.
    const account = c.get("account");
    const form = account
      ? {
          values: {
            name: account.name,
            email: account.email ?? "",
            phone: (await phoneOf(c.env.DB, account.id)) ?? "",
          },
          errors: {},
        }
      : emptyForm;
    return eventPage(c, event, form, null);
  });

  app.post("/:slug", async (c) => {
    const event = await visibleEvent(c, c.req.param("slug"));
    if (!event) return notFound(c);
    if (ended(event)) return eventPage(c, event, emptyForm, null, 410);

    const outcome = await signUp(
      {
        db: c.env.DB,
        fetch: fetcher,
        now: now(),
        turnstileSecret: humanCheck(c)?.secret ?? null,
        provenEmail: c.get("account")?.email ?? null,
      },
      event,
      await c.req.formData(),
      c.req.header("CF-Connecting-IP") ?? null,
    );

    switch (outcome.kind) {
      case "trapped":
        return c.redirect(`/${event.slug}`, 303);
      case "refused":
        return eventPage(c, event, outcome.form, null, 422);
      case "exists":
        if (outcome.own) return c.redirect(`/entrada/${outcome.token}`, 303);
        if (outcome.notify)
          await after(
            c,
            notifyTickets(c.env, fetcher, outcome.notify, event, [
              outcome.token,
            ]),
          );
        return eventPage(c, event, emptyForm, "exists", 409);
      case "created":
        await after(
          c,
          notifyTickets(c.env, fetcher, outcome.notify, event, [outcome.token]),
        );
        return c.redirect(`/entrada/${outcome.token}?nueva`, 303);
    }
  });

  app.notFound((c) => notFound(c));

  return app;
}
