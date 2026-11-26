import { Hono } from "hono";
import { Team, type DoorLink } from "../pages/admin/Team";
import { issuesCertificates } from "./certificates";
import type { EventMeta } from "./events";
import { emailPattern, type FormState } from "./form";
import { adminPage, withEvent } from "./adminPage";
import {
  addRole,
  eventRoles,
  isRole,
  openDoor,
  removeRole,
  type NewRole,
} from "./roles";
import { site, type AppEnv, type Ctx } from "./web";

type ParsedRole = ({ ok: true; value: NewRole } | { ok: false }) & FormState;

export function parseRoleForm(form: FormData): ParsedRole {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const name = text("name");
  const email = text("email").toLowerCase();
  const role = text("role");
  const values = { name, email, role };
  const errors: Record<string, string> = {};

  if (name.length < 2) errors.name = "Escribe el nombre.";
  else if (name.length > 120) errors.name = "El nombre es demasiado largo.";
  if (email && (!emailPattern.test(email) || email.length > 254))
    errors.email = "Escribe un correo válido o déjalo vacío.";
  if (!isRole(role)) errors.role = "Elige un rol.";

  if (Object.keys(errors).length || !isRole(role))
    return { ok: false, values, errors };
  return {
    ok: true,
    value: { name, email: email || null, role },
    values,
    errors,
  };
}

const blankForm: FormState = { values: { role: "organiza" }, errors: {} };

/** The Equipo tab: who holds a role at one event. Mounted under /admin/eventos/:slug/equipo. */
export function teamRoutes(now: () => Date) {
  const team = new Hono<AppEnv>();

  const teamPage = async (
    c: Ctx,
    event: EventMeta,
    form = blankForm,
    status?: number,
    doorLink?: DoorLink,
  ) =>
    adminPage(
      c,
      `Equipo · ${event.title}`,
      <Team
        event={event}
        team={await eventRoles(c.env.DB, event.slug)}
        form={form}
        doorLink={doorLink}
        certificates={issuesCertificates(event, now())}
      />,
      { status },
    );

  const back = (c: Ctx, event: EventMeta) =>
    c.redirect(`/admin/eventos/${event.slug}/equipo`, 303);

  team.get(
    "/",
    withEvent((c, event) => teamPage(c, event)),
  );

  team.post(
    "/",
    withEvent(async (c, event) => {
      const parsed = parseRoleForm(await c.req.formData());
      if (!parsed.ok) return teamPage(c, event, parsed, 422);

      if ((await addRole(c.env.DB, event.slug, parsed.value)) === "exists") {
        const errors = { email: "Esa persona ya tiene ese rol." };
        return teamPage(c, event, { values: parsed.values, errors }, 422);
      }

      return back(c, event);
    }),
  );

  // The link is shown on this response only; the table keeps its hash.
  team.post(
    "/:id/puerta",
    withEvent(async (c, event) => {
      const id = Number(c.req.param("id"));
      const person = (await eventRoles(c.env.DB, event.slug)).find(
        (p) => p.id === id,
      );
      const token = person && (await openDoor(c.env.DB, event.slug, id));
      if (!person || !token) return back(c, event);

      return teamPage(c, event, undefined, undefined, {
        name: person.name,
        url: `${site(c)}/puerta/abrir/${token}`,
      });
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
