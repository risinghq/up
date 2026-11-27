import { Hono } from "hono";
import {
  More,
  Overview,
  type CalendarPanel,
} from "../../../pages/admin/Manage";
import { Registrants } from "../../../pages/admin/Registrants";
import { registrantsCsv } from "../../csv";
import {
  deleteEvent,
  eventUrl,
  linkCalendar,
  type EventMeta,
} from "../../events";
import { findAccount } from "../../google/account";
import { dropCalendar, syncCalendar } from "../../google/calendar";
import { credentials } from "../../google/oauth";
import {
  listRegistrants,
  registrationCount,
  statusCounts,
} from "../../registrants";
import { site, type AppEnv, type Ctx, type Deps } from "../../web";
import { adminPage, pick, withEvent } from "./page";

const calendarNotices = ["synced", "error", "removed"] as const;

/** One event's admin: overview, calendar copy, more, and its registrants. */
export function eventRoutes({ fetch: fetcher }: Deps) {
  const routes = new Hono<AppEnv>();

  const calendarPanel = async (
    c: Ctx,
    event: EventMeta,
  ): Promise<CalendarPanel | undefined> => {
    if (!credentials(c.env)) return undefined;

    const account = await findAccount(c.var.db);
    return {
      account: account?.email,
      link: event.calendar,
      notice: pick(calendarNotices, c.req.query("calendar")),
    };
  };

  const more = async (c: Ctx, event: EventMeta, deleteError?: string) =>
    adminPage(
      c,
      `Más: ${event.title}`,
      <More
        event={event}
        registrations={await registrationCount(c.var.db, event.slug)}
        deleteError={deleteError}
      />,
      { status: deleteError ? 409 : 200 },
    );

  routes.get(
    "/events/:slug",
    withEvent(async (c, event) =>
      adminPage(
        c,
        event.title,
        <Overview
          event={event}
          url={eventUrl(site(c), event)}
          counts={await statusCounts(c.var.db, event.slug)}
          created={c.req.query("created") !== undefined}
          calendar={await calendarPanel(c, event)}
        />,
      ),
    ),
  );

  routes.post(
    "/events/:slug/calendar",
    withEvent(async (c, event) => {
      const synced = await syncCalendar(
        c.var.db,
        c.env,
        fetcher,
        event,
        eventUrl(site(c), event),
      );
      return c.redirect(
        `/admin/events/${event.slug}?calendar=${synced ? "synced" : "error"}`,
        303,
      );
    }),
  );

  routes.post(
    "/events/:slug/calendar/remove",
    withEvent(async (c, event) => {
      await dropCalendar(c.var.db, c.env, fetcher, event);
      await linkCalendar(c.var.db, event.slug, null);
      return c.redirect(`/admin/events/${event.slug}?calendar=removed`, 303);
    }),
  );

  routes.get(
    "/events/:slug/more",
    withEvent((c, event) => more(c, event)),
  );

  routes.post(
    "/events/:slug/delete",
    withEvent(async (c, event) => {
      if (await registrationCount(c.var.db, event.slug))
        return more(c, event, "Tiene inscripciones; déjalo en borrador.");

      await dropCalendar(c.var.db, c.env, fetcher, event);
      await deleteEvent(c.var.db, event.slug);
      if (event.coverKey) await c.env.MEDIA.delete(event.coverKey);
      return c.redirect("/admin", 303);
    }),
  );

  routes.get(
    "/events/:slug/registrants",
    withEvent(async (c, event) =>
      adminPage(
        c,
        `Inscritos: ${event.title}`,
        <Registrants
          event={event}
          registrants={await listRegistrants(c.var.db, event.slug)}
        />,
      ),
    ),
  );

  routes.get(
    "/events/:slug/registrants.csv",
    withEvent(async (c, event) => {
      const csv = registrantsCsv(
        event,
        await listRegistrants(c.var.db, event.slug),
      );
      return c.body(csv, 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${event.slug}-inscritos.csv"`,
        "Cache-Control": "no-store",
      });
    }),
  );

  return routes;
}
