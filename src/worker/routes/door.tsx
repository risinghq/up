import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { DoorPage, type Arrival } from "../../pages/Door";
import { eventUrl, findEvent, hasEnded, type EventMeta } from "../events";
import { emptyForm, parseRegistration, type FormState } from "../form";
import { notifyTickets } from "../notify";
import { checkedInCount } from "../registrants";
import {
  checkIn,
  findTicket,
  goingCount,
  undoCheckIn,
  walkIn,
} from "../registrations";
import { holdsDoor } from "../roles";
import {
  after,
  notFound,
  page,
  site,
  type AppEnv,
  type Ctx,
  type Deps,
} from "../web";
import { retry } from "./accountPages";

/**
 * Whether the request may work the event's door: an admin always, an
 * account that organizes or volunteers at the event until it ends.
 */
export async function worksDoor(c: Ctx, event: EventMeta, now: Date) {
  if (c.get("admin")) return true;

  const account = c.get("account");
  if (!account || hasEnded(event, now)) return false;

  return holdsDoor(c.env.DB, event.slug, account.id);
}

/** The door of an event, at /puerta, for its organizers, voluntarios and the admins. */
export function doorRoutes({ now, fetch: fetcher }: Deps) {
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
        form={form}
        arrival={arrival}
      />,
      status,
    );
  };

  /**
   * Loads the event in the path for a request that may work its door. A
   * signed-out visitor opening the door is sent to sign in and back; any
   * other refused request gets 404.
   */
  const withDoor =
    (handler: (c: Ctx, event: EventMeta) => Promise<Response>) =>
    async (c: Ctx) => {
      const event = await findEvent(c.env.DB, c.req.param("slug") ?? "");
      if (event && (await worksDoor(c, event, now()))) return handler(c, event);

      if (event && !c.get("account") && c.req.method === "GET")
        return c.redirect(retry(`/puerta/${event.slug}`), 303);
      return notFound(c);
    };

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
