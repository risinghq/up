import { Hono } from "hono";
import { EventPage } from "../../pages/Event";
import { eventView, type Notice } from "../../pages/Event.view";
import { ics } from "../calendar";
import {
  coverUrl,
  eventUrl,
  findEvent,
  hasEnded,
  type EventMeta,
} from "../events";
import { emptyForm, type FormState } from "../form";
import { notifyTickets } from "../notify";
import { phoneOf } from "../people";
import { goingCount } from "../registrations";
import { eventRoles } from "../roles";
import { signUp } from "../signup";
import {
  after,
  humanCheck,
  notFound,
  page,
  site,
  viewContext,
  type AppEnv,
  type Ctx,
  type Deps,
} from "../web";

/** An event the visitor may see: published, or any event for an admin. */
export async function visibleEvent(c: Ctx, slug: string) {
  const event = await findEvent(c.var.db, slug);
  return event && (event.status === "published" || c.get("admin"))
    ? event
    : null;
}

/** The event page, its calendar file and the register form it posts. */
export function eventRoutes({ now, fetch: fetcher }: Deps) {
  const routes = new Hono<AppEnv>();

  const eventPage = async (
    c: Ctx,
    event: EventMeta,
    form: FormState,
    notice: Notice,
    status = 200,
  ) => {
    const view = eventView(viewContext(c, now()), {
      event,
      going: await goingCount(c.var.db, event.slug),
      team: await eventRoles(c.var.db, event.slug),
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

  routes.get("/:slug/calendar.ics", async (c) => {
    const event = await visibleEvent(c, c.req.param("slug"));
    if (!event) return notFound(c);

    const body = ics(event, eventUrl(site(c), event), now().toISOString());
    return c.body(body, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
    });
  });

  routes.get("/:slug", async (c) => {
    const event = await visibleEvent(c, c.req.param("slug"));
    if (!event) return notFound(c);

    // A signed-in person finds the form filled with what the account holds.
    const account = c.get("account");
    const form = account
      ? {
          values: {
            name: account.name,
            email: account.email ?? "",
            phone: (await phoneOf(c.var.db, account.id)) ?? "",
          },
          errors: {},
        }
      : emptyForm;
    return eventPage(c, event, form, null);
  });

  routes.post("/:slug", async (c) => {
    const event = await visibleEvent(c, c.req.param("slug"));
    if (!event) return notFound(c);
    if (hasEnded(event, now()))
      return eventPage(c, event, emptyForm, null, 410);

    const outcome = await signUp(
      {
        db: c.var.db,
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
        if (outcome.own) return c.redirect(`/ticket/${outcome.token}`, 303);
        if (outcome.notify)
          await after(
            c,
            notifyTickets(c.var.db, c.env, fetcher, outcome.notify, event, [
              outcome.token,
            ]),
          );
        return eventPage(c, event, emptyForm, "exists", 409);
      case "created":
        await after(
          c,
          notifyTickets(c.var.db, c.env, fetcher, outcome.notify, event, [
            outcome.token,
          ]),
        );
        return c.redirect(`/ticket/${outcome.token}?new`, 303);
    }
  });

  return routes;
}
