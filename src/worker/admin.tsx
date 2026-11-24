import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import type { ComponentChildren } from "preact";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Dashboard, type NewInvite } from "../pages/admin/Dashboard";
import { EventEditor, type EditorView } from "../pages/admin/EventEditor";
import { Invite, InviteGone, SignIn } from "../pages/admin/Passkey";
import { Registrants } from "../pages/admin/Registrants";
import {
  acceptInvite,
  createInvite,
  createSession,
  endSession,
  findCredential,
  findInvite,
  listAdmins,
  saveChallenge,
  SESSION_DAYS,
  takeChallenge,
  touchCredential,
  type Admin,
} from "./auth";
import { registrantsCsv } from "./csv";
import { coverTypes, eventValues, parseEventForm } from "./eventForm";
import {
  coverUrl,
  deleteEvent,
  findEvent,
  listEvents,
  saveEvent,
  type EventMeta,
} from "./events";
import type { FormState } from "./form";
import {
  authenticationOptions,
  registrationOptions,
  relyingParty,
  verifyAuthentication,
  verifyRegistration,
} from "./passkeys";
import {
  fillSeats,
  goingCount,
  listRegistrants,
  registrationCount,
} from "./registrations";
import { newToken } from "./tokens";
import { notFound, page, site, type AppEnv, type Ctx } from "./web";

export const SESSION_COOKIE = "up_admin";

/** The fields a new event starts with. */
const blankEvent: Record<string, string> = {
  hosts: "David, Pedro",
  place_kind: "venue",
  place_name: "Facultad de Ciencias Físicas, UNMSM",
  place_address: "Av. Venezuela s/n, Cercado de Lima",
  kind: "taller",
  accent: "#2563eb",
  backdrop: "grid",
  status: "draft",
};

export function adminRoutes(now: () => Date) {
  const admin = new Hono<AppEnv>();
  const iso = () => now().toISOString();
  const rp = (c: Ctx) => relyingParty(c.env.SITE_URL);

  const adminPage = (
    c: Ctx,
    title: string,
    body: ComponentChildren,
    status = 200,
    passkeys = false,
  ) => {
    c.header("Cache-Control", "no-store");
    return page(
      c,
      {
        title,
        description: "Administración de up.",
        url: `${site(c)}${c.req.path}`,
        noindex: true,
      },
      body,
      status,
      passkeys,
    );
  };

  const startSession = async (c: Ctx, adminId: string) => {
    setCookie(
      c,
      SESSION_COOKIE,
      await createSession(c.env.DB, adminId, iso()),
      {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: c.env.SITE_URL.startsWith("https:"),
        maxAge: SESSION_DAYS * 24 * 60 * 60,
      },
    );
  };

  const json = async <T,>(c: Ctx): Promise<Partial<T>> =>
    c.req.json<Partial<T>>().catch(() => ({}));

  // Form posts must come from this origin. The passkey endpoints take JSON,
  // which a cross-site form cannot send.
  admin.use(
    csrf({ origin: (origin, c) => origin === new URL(c.env.SITE_URL).origin }),
  );

  admin.get("/entrar", (c) =>
    c.get("admin")
      ? c.redirect("/admin", 303)
      : adminPage(c, "Entrar", <SignIn />, 200, true),
  );

  admin.get("/invitacion/:token", async (c) => {
    const token = c.req.param("token");
    const name = await findInvite(c.env.DB, token, iso());
    return name
      ? adminPage(
          c,
          "Invitación",
          <Invite name={name} token={token} />,
          200,
          true,
        )
      : adminPage(c, "Invitación", <InviteGone />, 404);
  });

  admin.post("/passkey/registro/opciones", async (c) => {
    const { invite } = await json<{ invite: string }>(c);
    const name = invite && (await findInvite(c.env.DB, invite, iso()));
    if (!name) return c.json({ error: "La invitación ya no sirve." }, 410);
    const options = await registrationOptions(rp(c), name);
    const challengeId = await saveChallenge(c.env.DB, options.challenge, iso());
    return c.json({ challengeId, options });
  });

  admin.post("/passkey/registro", async (c) => {
    const body = await json<{
      invite: string;
      challengeId: string;
      response: RegistrationResponseJSON;
    }>(c);
    const failed = () =>
      c.json({ error: "No pudimos verificar la passkey." }, 400);
    if (!body.invite || !body.challengeId || !body.response) return failed();
    const challenge = await takeChallenge(c.env.DB, body.challengeId, iso());
    if (!challenge) return failed();
    const credential = await verifyRegistration(
      rp(c),
      body.response,
      challenge,
    );
    if (!credential) return failed();
    const created = await acceptInvite(
      c.env.DB,
      body.invite,
      credential,
      iso(),
    );
    if (!created) return c.json({ error: "La invitación ya no sirve." }, 410);
    await startSession(c, created.id);
    return c.json({ redirect: "/admin" });
  });

  admin.post("/passkey/entrar/opciones", async (c) => {
    const options = await authenticationOptions(rp(c));
    const challengeId = await saveChallenge(c.env.DB, options.challenge, iso());
    return c.json({ challengeId, options });
  });

  admin.post("/passkey/entrar", async (c) => {
    const body = await json<{
      challengeId: string;
      response: AuthenticationResponseJSON;
    }>(c);
    const refused = () =>
      c.json({ error: "Esa passkey no es de un admin de up." }, 401);
    if (!body.challengeId || typeof body.response?.id !== "string")
      return refused();
    const challenge = await takeChallenge(c.env.DB, body.challengeId, iso());
    if (!challenge) return refused();
    const stored = await findCredential(c.env.DB, body.response.id);
    if (!stored) return refused();
    const counter = await verifyAuthentication(
      rp(c),
      body.response,
      challenge,
      stored,
    );
    if (counter === null) return refused();
    await touchCredential(c.env.DB, stored.id, counter, iso());
    await startSession(c, stored.adminId);
    return c.json({ redirect: "/admin" });
  });

  // Every route below needs a signed-in admin.
  admin.use(async (c, next) => {
    if (c.get("admin")) return next();
    if (c.req.method === "GET") return c.redirect("/admin/entrar", 303);
    return c.text("Necesitas entrar como admin.", 403);
  });

  const signedIn = (c: Ctx) => c.get("admin") as Admin;

  const dashboard = async (
    c: Ctx,
    extra: { invite?: NewInvite; inviteError?: string } = {},
    status = 200,
  ) => {
    const events = await listEvents(c.env.DB);
    const rows = await Promise.all(
      events.reverse().map(async (event) => ({
        event,
        going: await goingCount(c.env.DB, event.slug),
        ended: new Date(event.end) <= now(),
      })),
    );
    return adminPage(
      c,
      "Admin",
      <Dashboard
        admin={signedIn(c)}
        events={rows}
        admins={await listAdmins(c.env.DB)}
        {...extra}
      />,
      status,
    );
  };

  admin.get("/", (c) => dashboard(c));

  admin.post("/invitaciones", async (c) => {
    const name = String((await c.req.formData()).get("name") ?? "").trim();
    if (!name || name.length > 60)
      return dashboard(c, { inviteError: "Escribe un nombre." }, 422);
    const token = await createInvite(c.env.DB, name, iso());
    return dashboard(c, {
      invite: { name, url: `${site(c)}/admin/invitacion/${token}` },
    });
  });

  admin.post("/salir", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await endSession(c.env.DB, token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.redirect("/", 303);
  });

  const editor = (
    c: Ctx,
    view: Omit<EditorView, "saved"> & { saved?: boolean },
    status = 200,
  ) =>
    adminPage(
      c,
      view.slug ? `Editar ${view.form.values.title}` : "Nuevo evento",
      <EventEditor saved={false} {...view} />,
      status,
    );

  /**
   * Stores an uploaded cover and returns its key, or keeps or drops the
   * current one. The caller deletes `stale` once the event row is saved.
   */
  const placeCover = async (
    c: Ctx,
    parsed: { cover: File | null; removeCover: boolean },
    slug: string,
    current?: string,
  ): Promise<{ key?: string; stale?: string }> => {
    if (parsed.cover) {
      const type = parsed.cover.type;
      const key = `covers/${slug}-${newToken().slice(0, 8)}.${coverTypes[type]}`;
      await c.env.MEDIA.put(key, await parsed.cover.arrayBuffer(), {
        httpMetadata: { contentType: type },
      });
      return { key, stale: current };
    }
    if (parsed.removeCover) return { stale: current };
    return { key: current };
  };

  const taken = (form: FormState) => ({
    ...form,
    errors: { ...form.errors, slug: "Ya hay un evento con esta dirección." },
  });

  admin.get("/eventos/nuevo", (c) =>
    editor(c, { form: { values: blankEvent, errors: {} }, registrations: 0 }),
  );

  admin.post("/eventos/nuevo", async (c) => {
    const parsed = parseEventForm(await c.req.formData());
    if (!parsed.ok) return editor(c, { form: parsed, registrations: 0 }, 422);
    const event = parsed.event;
    if (await findEvent(c.env.DB, event.slug))
      return editor(
        c,
        {
          form: taken({ values: eventValues(event), errors: {} }),
          registrations: 0,
        },
        409,
      );
    const cover = await placeCover(c, parsed, event.slug);
    await saveEvent(c.env.DB, { ...event, coverKey: cover.key }, iso());
    return c.redirect(`/admin/eventos/${event.slug}?guardado`, 303);
  });

  /** Loads the event in the path or answers 404. */
  const withEvent =
    (handler: (c: Ctx, event: EventMeta) => Promise<Response> | Response) =>
    async (c: Ctx) => {
      const event = await findEvent(c.env.DB, c.req.param("slug") ?? "");
      return event ? handler(c, event) : notFound(c);
    };

  admin.get(
    "/eventos/:slug",
    withEvent(async (c, event) =>
      editor(c, {
        form: { values: eventValues(event), errors: {} },
        slug: event.slug,
        registrations: await registrationCount(c.env.DB, event.slug),
        coverUrl: coverUrl(event),
        saved: c.req.query("guardado") !== undefined,
      }),
    ),
  );

  admin.post(
    "/eventos/:slug",
    withEvent(async (c, current) => {
      const registrations = await registrationCount(c.env.DB, current.slug);
      const parsed = parseEventForm(
        await c.req.formData(),
        registrations ? current.slug : undefined,
      );
      const base = {
        slug: current.slug,
        registrations,
        coverUrl: coverUrl(current),
      };
      if (!parsed.ok) return editor(c, { ...base, form: parsed }, 422);
      const event = parsed.event;
      if (
        event.slug !== current.slug &&
        (await findEvent(c.env.DB, event.slug))
      )
        return editor(
          c,
          { ...base, form: taken({ values: eventValues(event), errors: {} }) },
          409,
        );
      const cover = await placeCover(c, parsed, event.slug, current.coverKey);
      const saved = { ...event, coverKey: cover.key };
      await saveEvent(c.env.DB, saved, iso(), current.slug);
      if (cover.stale) await c.env.MEDIA.delete(cover.stale);
      // A raised capacity seats the waitlist now, not at the next cancellation.
      await fillSeats(c.env.DB, saved);
      return c.redirect(`/admin/eventos/${event.slug}?guardado`, 303);
    }),
  );

  admin.post(
    "/eventos/:slug/eliminar",
    withEvent(async (c, event) => {
      const registrations = await registrationCount(c.env.DB, event.slug);
      if (registrations)
        return editor(
          c,
          {
            form: { values: eventValues(event), errors: {} },
            slug: event.slug,
            registrations,
            coverUrl: coverUrl(event),
            deleteError: "Tiene inscripciones; déjalo en borrador.",
          },
          409,
        );
      await deleteEvent(c.env.DB, event.slug);
      if (event.coverKey) await c.env.MEDIA.delete(event.coverKey);
      return c.redirect("/admin", 303);
    }),
  );

  admin.get(
    "/eventos/:slug/inscritos",
    withEvent(async (c, event) =>
      adminPage(
        c,
        `Inscritos: ${event.title}`,
        <Registrants
          event={event}
          registrants={await listRegistrants(c.env.DB, event.slug)}
        />,
      ),
    ),
  );

  admin.get(
    "/eventos/:slug/inscritos.csv",
    withEvent(async (c, event) => {
      const csv = registrantsCsv(
        event,
        await listRegistrants(c.env.DB, event.slug),
      );
      return c.body(csv, 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${event.slug}-inscritos.csv"`,
        "Cache-Control": "no-store",
      });
    }),
  );

  return admin;
}
