import { Hono } from "hono";
import { Team, type TeamSearch } from "../../../pages/admin/Team";
import { searchAccounts } from "../../accounts";
import { issuesCertificates } from "../../certificates";
import type { EventMeta } from "../../events";
import {
  addRole,
  eventRoles,
  isRole,
  removeRole,
  type Role,
} from "../../roles";
import { site, type AppEnv, type Ctx, type Deps } from "../../web";
import { adminPage, withEvent } from "./page";

/** A query shorter than this lists nobody. */
const minQuery = 2;

/** Reads `?q=` and `?rol=` into the search the page shows. */
async function teamSearch(c: Ctx): Promise<TeamSearch> {
  const query = (c.req.query("q") ?? "").trim().slice(0, 120);
  const rol = c.req.query("rol") ?? "";
  const role: Role = isRole(rol) ? rol : "organiza";
  const results =
    query.length >= minQuery ? await searchAccounts(c.env.DB, query) : null;

  return { query, role, results };
}

/** The Equipo tab: who holds a role at one event. Mounted under /admin/eventos/:slug/equipo. */
export function teamRoutes({ now }: Deps) {
  const team = new Hono<AppEnv>();

  const teamPage = async (
    c: Ctx,
    event: EventMeta,
    search: TeamSearch,
    error?: string,
  ) =>
    adminPage(
      c,
      `Equipo · ${event.title}`,
      <Team
        event={event}
        team={await eventRoles(c.env.DB, event.slug)}
        search={search}
        error={error}
        signInUrl={`${site(c)}/entrar`}
        certificates={issuesCertificates(event, now())}
      />,
      { status: error ? 422 : 200 },
    );

  const back = (c: Ctx, event: EventMeta) =>
    c.redirect(`/admin/eventos/${event.slug}/equipo`, 303);

  team.get(
    "/",
    withEvent(async (c, event) => teamPage(c, event, await teamSearch(c))),
  );

  team.post(
    "/",
    withEvent(async (c, event) => {
      const form = await c.req.formData();
      const person = String(form.get("person") ?? "");
      const role = String(form.get("role") ?? "");
      if (!isRole(role)) return back(c, event);

      const added = await addRole(c.env.DB, event.slug, person, role);
      if (added === "exists")
        return teamPage(
          c,
          event,
          { query: "", role, results: null },
          "Esa persona ya tiene ese rol.",
        );

      return back(c, event);
    }),
  );

  team.post(
    "/:id/quitar",
    withEvent(async (c, event) => {
      const id = Number(c.req.param("id"));
      if (Number.isInteger(id)) await removeRole(c.env.DB, event.slug, id);
      return back(c, event);
    }),
  );

  return team;
}
