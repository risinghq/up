import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { EventEditor, type EditorView } from "../pages/admin/EventEditor";
import { Events, type Period } from "../pages/admin/Events";
import { More, Overview, type CalendarPanel } from "../pages/admin/Manage";
import { Registrants } from "../pages/admin/Registrants";
import {
  Settings,
  type AdminsNotice,
  type GooglePanel,
} from "../pages/admin/Settings";
import { grantAdmin, listAdmins, revokeAdmin, type Account } from "./accounts";
import { registrantsCsv } from "./csv";
import { coverTypes, eventValues, parseEventForm } from "./eventForm";
import {
  coverUrl,
  deleteEvent,
  findEvent,
  hasEnded,
  linkCalendar,
  listEvents,
  saveEvent,
  type EventMeta,
} from "./events";
import { emailPattern, type FormState } from "./form";
import { findPlaces } from "./geo";
import { notifyTickets } from "./notify";
import {
  accessToken,
  authUrl,
  deleteAccount,
  deleteCalendarEvent,
  exchangeCode,
  findAccount,
  revoke,
  saveAccount,
  syncEvent,
  type Fetch,
  type GoogleCredentials,
} from "./google";
import { fillSeats, goingCount } from "./registrations";
import {
  listRegistrants,
  registrationCount,
  statusCounts,
} from "./registrants";
import { teamRoutes } from "./team";
import { newToken } from "./tokens";
import { after, notFound, site, type AppEnv, type Ctx } from "./web";
import { adminPage, withEvent } from "./adminPage";
import { whatsappMode } from "./whatsapp";

const GOOGLE_STATE_COOKIE = "up_google_state";

const calendarNotices = ["listo", "error", "quitado"] as const;
const googleNotices = ["conectado", "desconectado", "error"] as const;
const adminsNotices: readonly AdminsNotice[] = ["agregado", "quitado"];

/** The query value when it is one of `allowed`. */
const pick = <T extends string>(
  allowed: readonly T[],
  value: string | undefined,
) => allowed.find((a) => a === value);

/** The fields a new event starts with. */
const blankEvent: Record<string, string> = {
  place_kind: "venue",
  place_name: "Facultad de Ciencias Físicas, UNMSM",
  place_address: "Av. Venezuela s/n, Cercado de Lima",
  kind: "taller",
  accent: "#2563eb",
  backdrop: "grid",
  font: "sans",
  status: "draft",
};

export function adminRoutes(now: () => Date, fetcher: Fetch) {
  const admin = new Hono<AppEnv>();
  const iso = () => now().toISOString();
  const secure = (c: Ctx) => c.env.SITE_URL.startsWith("https:");

  const googleCreds = (c: Ctx): GoogleCredentials | null =>
    c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: c.env.GOOGLE_CLIENT_ID,
          clientSecret: c.env.GOOGLE_CLIENT_SECRET,
        }
      : null;
  const googleReturn = (c: Ctx) => `${site(c)}/admin/google/vuelta`;

  /** An access token for the connected account, or null when none is. */
  const calendarToken = async (c: Ctx) => {
    const creds = googleCreds(c);
    const account = creds && (await findAccount(c.env.DB));
    return creds && account
      ? accessToken(fetcher, creds, account.refreshToken)
      : null;
  };

  /** Creates or updates the event's calendar copy and Meet call. False when that failed. */
  const syncCalendar = async (c: Ctx, event: EventMeta) => {
    try {
      const token = await calendarToken(c);
      if (!token) return false;
      const link = await syncEvent(
        fetcher,
        token,
        event,
        `${site(c)}/${event.slug}`,
        event.calendar,
      );
      await linkCalendar(c.env.DB, event.slug, link);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  /** Deletes the event's calendar copy. A failure leaves an orphan in Google, never a broken admin. */
  const dropCalendar = async (c: Ctx, event: EventMeta) => {
    if (!event.calendar) return;
    try {
      const token = await calendarToken(c);
      if (token)
        await deleteCalendarEvent(fetcher, token, event.calendar.eventId);
    } catch (error) {
      console.error(error);
    }
  };

  const calendarPanel = async (
    c: Ctx,
    event: EventMeta,
  ): Promise<CalendarPanel | undefined> => {
    if (!googleCreds(c)) return undefined;
    const account = await findAccount(c.env.DB);
    return {
      account: account?.email,
      link: event.calendar,
      notice: pick(calendarNotices, c.req.query("calendario")),
    };
  };

  // Form posts must come from this origin.
  admin.use(
    csrf({ origin: (origin, c) => origin === new URL(c.env.SITE_URL).origin }),
  );

  admin.get("/entrar", (c) => c.redirect("/entrar?volver=/admin", 303));

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
        `/entrar?${new URLSearchParams({ volver: c.req.path })}`,
        303,
      );
    return c.text("Necesitas entrar como admin.", 403);
  });

  const signedIn = (c: Ctx) => c.get("admin") as Account;

  // Upcoming runs soonest first; past runs newest first.
  admin.get("/", async (c) => {
    const period: Period =
      c.req.query("periodo") === "pasados" ? "pasados" : "proximos";
    const events = await listEvents(c.env.DB);
    const upcoming = events.filter((e) => !hasEnded(e, now()));
    const past = events.filter((e) => hasEnded(e, now())).reverse();
    const shown = period === "proximos" ? upcoming : past;
    const rows = await Promise.all(
      shown.map(async (event) => ({
        event,
        going: await goingCount(c.env.DB, event.slug),
      })),
    );
    return adminPage(
      c,
      "Eventos",
      <Events
        period={period}
        events={rows}
        counts={{ proximos: upcoming.length, pasados: past.length }}
      />,
    );
  });

  const settings = async (
    c: Ctx,
    form: { email: string; error?: string } = { email: "" },
    status = 200,
  ) => {
    const google: GooglePanel | undefined = googleCreds(c)
      ? {
          account: (await findAccount(c.env.DB))?.email,
          notice: pick(googleNotices, c.req.query("google")),
        }
      : undefined;
    return adminPage(
      c,
      "Ajustes",
      <Settings
        admins={{
          admins: await listAdmins(c.env.DB),
          selfId: signedIn(c).id,
          notice: pick(adminsNotices, c.req.query("admins")),
          ...form,
        }}
        google={google}
        whatsapp={whatsappMode(c.env)}
      />,
      { status, section: "ajustes" },
    );
  };

  admin.get("/ajustes", (c) => settings(c));

  admin.get("/google/conectar", (c) => {
    const creds = googleCreds(c);
    if (!creds) return notFound(c);
    const state = newToken();
    setCookie(c, GOOGLE_STATE_COOKIE, state, {
      path: "/admin/google",
      httpOnly: true,
      sameSite: "Lax",
      secure: secure(c),
      maxAge: 10 * 60,
    });
    return c.redirect(authUrl(creds, googleReturn(c), state), 302);
  });

  admin.get("/google/vuelta", async (c) => {
    const creds = googleCreds(c);
    if (!creds) return notFound(c);
    const expected = getCookie(c, GOOGLE_STATE_COOKIE);
    deleteCookie(c, GOOGLE_STATE_COOKIE, { path: "/admin/google" });
    const code = c.req.query("code");
    if (!code || !expected || c.req.query("state") !== expected)
      return c.redirect("/admin/ajustes?google=error", 303);
    try {
      const granted = await exchangeCode(fetcher, creds, code, googleReturn(c));
      await saveAccount(c.env.DB, {
        ...granted,
        connectedBy: signedIn(c).id,
        connectedAt: iso(),
      });
      return c.redirect("/admin/ajustes?google=conectado", 303);
    } catch (error) {
      console.error(error);
      return c.redirect("/admin/ajustes?google=error", 303);
    }
  });

  admin.post("/google/desconectar", async (c) => {
    const account = await findAccount(c.env.DB);
    if (account) {
      await revoke(fetcher, account.refreshToken).catch(console.error);
      await deleteAccount(c.env.DB);
    }
    return c.redirect("/admin/ajustes?google=desconectado", 303);
  });

  admin.post("/admins", async (c) => {
    const email = String((await c.req.formData()).get("email") ?? "")
      .trim()
      .toLowerCase();
    const change = emailPattern.test(email)
      ? await grantAdmin(c.env.DB, email, iso())
      : null;

    if (change === "done")
      return c.redirect("/admin/ajustes?admins=agregado#admins-title", 303);
    const error = change
      ? "Esa persona aún no tiene cuenta. Pídele que entre en /entrar con ese correo."
      : "Escribe un correo válido.";
    return settings(c, { email, error }, 422);
  });

  admin.post("/admins/:id/quitar", async (c) => {
    await revokeAdmin(c.env.DB, signedIn(c), c.req.param("id"), iso());
    return c.redirect("/admin/ajustes?admins=quitado#admins-title", 303);
  });

  /** The editor of `event`, or of a new event when it is absent. */
  const editor = (
    c: Ctx,
    view: Pick<EditorView, "form" | "registrations" | "coverUrl"> &
      Partial<EditorView>,
    event?: EventMeta,
    status = 200,
  ) =>
    adminPage(
      c,
      event ? `Editar: ${event.title}` : "Crear evento",
      <EventEditor
        view={{ saved: false, calendarError: false, ...view }}
        event={event}
      />,
      { status },
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

  admin.get("/lugares", async (c) => {
    const query = (c.req.query("q") ?? "").slice(0, 200);
    if (query.trim().length < 3) return c.json({ places: [] });
    try {
      return c.json({ places: await findPlaces(fetcher, query) });
    } catch (error) {
      console.error(error);
      return c.json({ error: "La búsqueda no respondió." }, 502);
    }
  });

  admin.get("/eventos/nuevo", (c) =>
    editor(c, { form: { values: blankEvent, errors: {} }, registrations: 0 }),
  );

  admin.post("/eventos/nuevo", async (c) => {
    const parsed = parseEventForm(await c.req.formData());
    if (!parsed.ok)
      return editor(c, { form: parsed, registrations: 0 }, undefined, 422);
    const event = parsed.event;
    if (await findEvent(c.env.DB, event.slug))
      return editor(
        c,
        {
          form: taken({ values: eventValues(event), errors: {} }),
          registrations: 0,
        },
        undefined,
        409,
      );
    const cover = await placeCover(c, parsed, event.slug);
    await saveEvent(c.env.DB, { ...event, coverKey: cover.key }, iso());
    return c.redirect(`/admin/eventos/${event.slug}?creado`, 303);
  });

  admin.get(
    "/eventos/:slug",
    withEvent(async (c, event) =>
      adminPage(
        c,
        event.title,
        <Overview
          event={event}
          url={`${site(c)}/${event.slug}`}
          counts={await statusCounts(c.env.DB, event.slug)}
          created={c.req.query("creado") !== undefined}
          calendar={await calendarPanel(c, event)}
        />,
      ),
    ),
  );

  admin.get(
    "/eventos/:slug/editar",
    withEvent(async (c, event) =>
      editor(
        c,
        {
          form: { values: eventValues(event), errors: {} },
          registrations: await registrationCount(c.env.DB, event.slug),
          coverUrl: coverUrl(event),
          saved: c.req.query("guardado") !== undefined,
          calendarError: c.req.query("calendario") === "error",
        },
        event,
      ),
    ),
  );

  admin.post(
    "/eventos/:slug/editar",
    withEvent(async (c, current) => {
      const registrations = await registrationCount(c.env.DB, current.slug);
      const parsed = parseEventForm(
        await c.req.formData(),
        registrations ? current.slug : undefined,
      );
      const base = { registrations, coverUrl: coverUrl(current) };
      if (!parsed.ok) return editor(c, { ...base, form: parsed }, current, 422);
      const event = parsed.event;
      if (
        event.slug !== current.slug &&
        (await findEvent(c.env.DB, event.slug))
      )
        return editor(
          c,
          { ...base, form: taken({ values: eventValues(event), errors: {} }) },
          current,
          409,
        );
      const cover = await placeCover(c, parsed, event.slug, current.coverKey);
      const saved = {
        ...event,
        coverKey: cover.key,
        calendar: current.calendar,
      };
      await saveEvent(c.env.DB, saved, iso(), current.slug);
      if (cover.stale) await c.env.MEDIA.delete(cover.stale);
      // A raised capacity seats the waitlist now, not at the next cancellation.
      const seated = await fillSeats(c.env.DB, saved);
      await after(c, notifyTickets(c.env, fetcher, "promoted", saved, seated));
      const synced = !saved.calendar || (await syncCalendar(c, saved));
      return c.redirect(
        `/admin/eventos/${event.slug}/editar?guardado${synced ? "" : "&calendario=error"}`,
        303,
      );
    }),
  );

  admin.post(
    "/eventos/:slug/calendario",
    withEvent(async (c, event) => {
      const synced = await syncCalendar(c, event);
      return c.redirect(
        `/admin/eventos/${event.slug}?calendario=${synced ? "listo" : "error"}`,
        303,
      );
    }),
  );

  admin.post(
    "/eventos/:slug/calendario/quitar",
    withEvent(async (c, event) => {
      await dropCalendar(c, event);
      await linkCalendar(c.env.DB, event.slug, null);
      return c.redirect(`/admin/eventos/${event.slug}?calendario=quitado`, 303);
    }),
  );

  const more = async (c: Ctx, event: EventMeta, deleteError?: string) =>
    adminPage(
      c,
      `Más: ${event.title}`,
      <More
        event={event}
        registrations={await registrationCount(c.env.DB, event.slug)}
        deleteError={deleteError}
      />,
      { status: deleteError ? 409 : 200 },
    );

  admin.get(
    "/eventos/:slug/mas",
    withEvent((c, event) => more(c, event)),
  );

  admin.post(
    "/eventos/:slug/eliminar",
    withEvent(async (c, event) => {
      if (await registrationCount(c.env.DB, event.slug))
        return more(c, event, "Tiene inscripciones; déjalo en borrador.");
      await dropCalendar(c, event);
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

  admin.route("/eventos/:slug/equipo", teamRoutes(now));

  return admin;
}
