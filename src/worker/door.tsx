import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { DoorPage, type Arrival } from "../pages/Door";
import { findEvent, hasEnded, type EventMeta } from "./events";
import { emptyForm, parseRegistration, type FormState } from "./form";
import type { Fetch } from "./google";
import { notifyTickets } from "./notify";
import { checkedInCount } from "./registrants";
import {
  checkIn,
  findTicket,
  goingCount,
  undoCheckIn,
  walkIn,
} from "./registrations";
import { doorEvent } from "./roles";
import { eventUrl } from "./views";
import { after, notFound, page, site, type AppEnv, type Ctx } from "./web";

export const DOOR_COOKIE = "up_door";
const DOOR_DAYS = 7;

/**
 * Whether the request may work the event's door: an admin always, a
 * voluntario with the event's door link until the event ends.
 */
export const worksDoor = (c: Ctx, event: EventMeta, now: Date) =>
  Boolean(c.get("admin")) ||
  (c.get("door") === event.slug && !hasEnded(event, now));

/** The slug a door cookie opens, or null. */
export const doorCookieEvent = (db: D1Database, token: string | undefined) =>
  token ? doorEvent(db, token) : Promise.resolve(null);

/** The door of an event, at /puerta, for its voluntarios and the admins. */
export function doorRoutes(now: () => Date, fetcher: Fetch) {
  const door = new Hono<AppEnv>();
  const iso = () => now().toISOString();

  door.use(
    csrf({ origin: (origin, c) => origin === new URL(c.env.SITE_URL).origin }),
  );

  const doorPage = async (
    c: Ctx,
    event: EventMeta,
    form: FormState,
    arrival: Arrival | null,
    status = 200,
  ) => {
    c.header("Cache-Control", "no-store");
    return page(
      c,
      {
        title: `Puerta: ${event.title}`,
        description: event.summary,
        url: eventUrl(site(c), event),
        noindex: true,
        theme: event.theme,
      },
      <DoorPage
        event={event}
        going={await goingCount(c.env.DB, event.slug)}
        checkedIn={await checkedInCount(c.env.DB, event.slug)}
        open={!hasEnded(event, now())}
        volunteer={!c.get("admin")}
        form={form}
        arrival={arrival}
      />,
      status,
    );
  };

  /** Loads the event in the path, or answers 404 to a request that may not work its door. */
  const withDoor =
    (handler: (c: Ctx, event: EventMeta) => Promise<Response>) =>
    async (c: Ctx) => {
      const event = await findEvent(c.env.DB, c.req.param("slug") ?? "");
      return event && worksDoor(c, event, now())
        ? handler(c, event)
        : notFound(c);
    };

  door.get("/abrir/:token", async (c) => {
    const token = c.req.param("token");
    const slug = await doorEvent(c.env.DB, token);
    if (!slug) return notFound(c);

    setCookie(c, DOOR_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: c.env.SITE_URL.startsWith("https:"),
      maxAge: DOOR_DAYS * 24 * 60 * 60,
    });
    return c.redirect(`/puerta/${slug}`, 303);
  });

  door.post("/salir", (c) => {
    deleteCookie(c, DOOR_COOKIE, { path: "/" });
    return c.redirect("/", 303);
  });

  door.get(
    "/:slug",
    withDoor((c, event) => doorPage(c, event, emptyForm, null)),
  );

  door.post(
    "/:slug/llegada",
    withDoor(async (c, event) => {
      if (hasEnded(event, now()))
        return doorPage(c, event, emptyForm, null, 410);

      const form = await c.req.formData();
      const parsed = parseRegistration(form, { ...event, questions: [] });
      if (!parsed.ok) return doorPage(c, event, parsed, null, 422);

      const arrival = await walkIn(c.env.DB, event, parsed.value, iso());
      if (arrival.kind === "created")
        await after(
          c,
          notifyTickets(c.env, fetcher, "going", event, [arrival.ticket.token]),
        );

      return doorPage(c, event, emptyForm, arrival);
    }),
  );

  // A scan opens the ticket page, whose Puerta panel posts here. The
  // registrants list posts here too, with `volver` naming it.
  const checkInRoute = (
    act: (db: D1Database, token: string) => Promise<void>,
  ) =>
    withDoor(async (c, event) => {
      const ticket = await findTicket(c.env.DB, c.req.param("token") ?? "");
      if (ticket?.eventSlug !== event.slug) return notFound(c, "ticket");

      await act(c.env.DB, ticket.token);
      const form = await c.req.formData();
      return c.redirect(
        form.get("volver") === "inscritos" && c.get("admin")
          ? `/admin/eventos/${event.slug}/inscritos#n${ticket.number}`
          : `/entrada/${ticket.token}`,
        303,
      );
    });

  door.post(
    "/:slug/ingreso/:token",
    checkInRoute((db, token) => checkIn(db, token, iso())),
  );
  door.post("/:slug/ingreso/:token/deshacer", checkInRoute(undoCheckIn));

  return door;
}
