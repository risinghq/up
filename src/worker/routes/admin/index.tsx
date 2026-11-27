import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { Events, type Period } from "../../../pages/admin/Events";
import { hasEnded, listEvents } from "../../events";
import { goingCount } from "../../registrations";
import { notFound, type AppEnv, type Deps } from "../../web";
import { editorRoutes } from "./editor";
import { eventRoutes } from "./event";
import { adminPage } from "./page";
import { settingsRoutes } from "./settings";
import { teamRoutes } from "./team";

/** /admin: the gate every admin route passes, the dashboard, and the sections. */
export function adminRoutes(deps: Deps) {
  const { now } = deps;
  const admin = new Hono<AppEnv>();

  // Form posts must come from this origin.
  admin.use(
    csrf({ origin: (origin, c) => origin === new URL(c.env.SITE_URL).origin }),
  );

  admin.get("/sign-in", (c) => c.redirect("/sign-in?next=/admin", 303));

  // Every route below needs a signed-in admin. A signed-in person who is not
  // one finds no admin here at all.
  admin.use(async (c, next) => {
    if (c.get("admin")) return next();
    if (c.get("account"))
      return c.req.method === "GET"
        ? notFound(c)
        : c.text("Necesitas ser admin.", 403);
    if (c.req.method === "GET")
      return c.redirect(
        `/sign-in?${new URLSearchParams({ next: c.req.path })}`,
        303,
      );
    return c.text("Necesitas entrar como admin.", 403);
  });

  // Upcoming runs soonest first; past runs newest first.
  admin.get("/", async (c) => {
    const period: Period =
      c.req.query("period") === "past" ? "past" : "upcoming";
    const events = await listEvents(c.var.db);
    const upcoming = events.filter((e) => !hasEnded(e, now()));
    const past = events.filter((e) => hasEnded(e, now())).reverse();
    const shown = period === "upcoming" ? upcoming : past;
    const rows = await Promise.all(
      shown.map(async (event) => ({
        event,
        going: await goingCount(c.var.db, event.slug),
      })),
    );

    return adminPage(
      c,
      "Eventos",
      <Events
        period={period}
        events={rows}
        counts={{ upcoming: upcoming.length, past: past.length }}
      />,
    );
  });

  admin.route("/", settingsRoutes(deps));
  admin.route("/", editorRoutes(deps));
  admin.route("/", eventRoutes(deps));
  admin.route("/events/:slug/team", teamRoutes(deps));

  return admin;
}
