import { Hono } from "hono";
import { TicketPage } from "../../pages/Ticket";
import { ticketView } from "../../pages/Ticket.view";
import { eventUrl, findEvent, hasEnded } from "../events";
import { notifyTickets } from "../notify";
import { closeProfile, openProfile } from "../profiles";
import { cancel, findTicket } from "../registrations";
import { rolesOf } from "../roles";
import { shareTicket } from "../shares";
import {
  after,
  notFound,
  page,
  site,
  viewContext,
  type AppEnv,
  type Deps,
} from "../web";
import { worksDoor } from "./door";

/** A ticket's page and what its holder does from it. The token is the holder's only key. */
export function ticketRoutes({ now, fetch: fetcher }: Deps) {
  const routes = new Hono<AppEnv>();

  routes.get("/:token", async (c) => {
    const ticket = await findTicket(c.var.db, c.req.param("token"));
    const event = ticket && (await findEvent(c.var.db, ticket.eventSlug));
    if (!ticket || !event) return notFound(c, "ticket");

    const view = ticketView(viewContext(c, now()), {
      ticket,
      event,
      fresh: c.req.query("nueva") !== undefined,
      door: await worksDoor(c, event, now()),
      whatsapp: c.env.WHATSAPP_COMMUNITY_URL,
      hasRole: (await rolesOf(c.var.db, ticket.personId)).length > 0,
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

  routes.post("/:token/perfil", async (c) => {
    const token = c.req.param("token");
    const ticket = await findTicket(c.var.db, token);
    if (!ticket) return notFound(c, "ticket");

    await openProfile(c.var.db, ticket.personId);
    return c.redirect(`/entrada/${token}#perfil`, 303);
  });

  routes.post("/:token/perfil/ocultar", async (c) => {
    const token = c.req.param("token");
    const ticket = await findTicket(c.var.db, token);
    if (!ticket) return notFound(c, "ticket");

    await closeProfile(c.var.db, ticket.personId);
    return c.redirect(`/entrada/${token}#perfil`, 303);
  });

  routes.post("/:token/compartir", async (c) => {
    const token = c.req.param("token");
    if (!(await findTicket(c.var.db, token))) return notFound(c, "ticket");

    await shareTicket(c.var.db, token);
    return c.redirect(`/entrada/${token}#compartir`, 303);
  });

  routes.post("/:token/cancelar", async (c) => {
    const token = c.req.param("token");
    const ticket = await findTicket(c.var.db, token);
    const event = ticket && (await findEvent(c.var.db, ticket.eventSlug));
    if (!ticket || !event) return notFound(c, "ticket");

    if (!hasEnded(event, now())) {
      const seated = await cancel(c.var.db, event, token, now().toISOString());
      await after(
        c,
        notifyTickets(c.var.db, c.env, fetcher, "promoted", event, seated),
      );
    }
    return c.redirect(`/entrada/${token}`, 303);
  });

  return routes;
}
