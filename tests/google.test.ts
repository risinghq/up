import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import type { Miniflare } from "miniflare";
import { createApp, type Env } from "../src/worker/app";
import { findEvent } from "../src/worker/events";
import { findAccount } from "../src/worker/google";
import {
  adminCookie,
  event,
  form,
  HOST_TIMEOUT,
  migratedDb,
  ORIGIN,
  seed,
  testEnv,
} from "./support";
import { page, type Page } from "./dom";

setDefaultTimeout(HOST_TIMEOUT);

const MEET = "https://meet.google.com/abc-defg-hij";

type Call = { method: string; url: URL; body: string };

/**
 * Stands in for Google: the token endpoint, revoke, and a primary calendar
 * that holds events by id. `failNext` makes the next calendar call answer 500.
 */
function fakeGoogle() {
  const calls: Call[] = [];
  const calendar = new Map<string, Record<string, unknown>>();
  const state = { failNext: false, next: 1 };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const idToken = (claims: object) =>
    `h.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.s`;

  const fetch = async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const body =
      init.body instanceof URLSearchParams
        ? init.body.toString()
        : String(init.body ?? "");
    const u = new URL(url);
    calls.push({ method, url: u, body });
    if (u.host === "oauth2.googleapis.com" && u.pathname === "/token") {
      const fields = new URLSearchParams(body);
      return fields.get("grant_type") === "authorization_code"
        ? fields.get("code") === "good"
          ? json({
              access_token: "a1",
              refresh_token: "r1",
              id_token: idToken({ email: "rising@example.com" }),
            })
          : json({ error: "invalid_grant" }, 400)
        : json({ access_token: "a1" });
    }
    if (u.pathname === "/revoke") return json({});
    if (state.failNext) {
      state.failNext = false;
      return json({ error: "backend" }, 500);
    }
    const id = decodeURIComponent(u.pathname.split("/events/")[1] ?? "");
    const view = (e: Record<string, unknown>) =>
      json({
        ...e,
        htmlLink: `https://calendar.google.com/event?eid=${e.id}`,
        hangoutLink: MEET,
      });
    if (method === "POST") {
      const created = { ...JSON.parse(body), id: `g${state.next++}` };
      calendar.set(created.id, created);
      return view(created);
    }
    const found = calendar.get(id);
    if (!found) return json({ error: "notFound" }, 404);
    if (method === "PATCH") {
      Object.assign(found, JSON.parse(body));
      return view(found);
    }
    calendar.delete(id);
    return new Response(null, { status: 204 });
  };
  return { fetch, calls, calendar, state };
}

const now = new Date("2026-12-01T12:00:00-05:00");
const google = fakeGoogle();
const app = createApp({ now: () => now, fetch: google.fetch });

let mf: Miniflare;
let DB: D1Database;
let env: Env;
let cookie: string;

beforeAll(async () => {
  let MEDIA: R2Bucket;
  ({ mf, DB, MEDIA } = await migratedDb("google"));
  env = testEnv(DB, MEDIA, {
    GOOGLE_CLIENT_ID: "client",
    GOOGLE_CLIENT_SECRET: "secret",
  });
  cookie = await adminCookie(DB, now);
  await seed(DB, [
    event({
      slug: "online",
      title: "Charla en línea",
      capacity: 1,
      place: { kind: "online", platform: "Google Meet" },
    }),
  ]);
});

afterAll(() => mf.dispose());

const get = (path: string, headers: Record<string, string> = { cookie }) =>
  app.request(path, { headers }, env);

const post = (path: string, body = new FormData()) =>
  app.request(
    path,
    { method: "POST", body, headers: { cookie, origin: ORIGIN } },
    env,
  );

const location = (res: Response) => res.headers.get("location") ?? "";

const open = async (path: string, headers?: Record<string, string>) =>
  page(await get(path, headers));

/** The links on a page that lead into the event's Meet call. */
const meetLinks = (p: Page) =>
  p.screen
    .queryAllByRole("link")
    .filter((a) => a.getAttribute("href") === MEET);

/** Registers on the public page and returns the ticket path. */
async function register(email: string) {
  const res = await app.request(
    "/online",
    { method: "POST", body: form({ email }) },
    env,
  );
  return location(res).replace("?nueva", "");
}

/** The editor's fields for the seeded event, retitled. */
function editForm(title: string) {
  const data = new FormData();
  const fields = {
    title,
    slug: "online",
    summary: "Un evento de prueba.",
    body: "Cuerpo.",
    start: "2026-12-12T15:00",
    end: "2026-12-12T19:00",
    place_kind: "online",
    place_name: "Google Meet",
    capacity: "1",
    status: "published",
    kind: "charla",
    accent: "#2563eb",
    backdrop: "grid",
    font: "sans",
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("without an OAuth client", () => {
  test("the admin shows no Google section and the connect route is gone", async () => {
    const bare = { ...env, GOOGLE_CLIENT_ID: undefined };
    const settings = await page(
      await app.request("/admin/ajustes", { headers: { cookie } }, bare),
    );
    expect(
      settings.screen.queryByRole("heading", {
        name: "Google Calendar y Meet",
      }),
    ).toBeNull();
    const res = await app.request(
      "/admin/google/conectar",
      { headers: { cookie } },
      bare,
    );
    expect(res.status).toBe(404);
  });
});

describe("connecting", () => {
  test("the settings offer to connect", async () => {
    const settings = await open("/admin/ajustes");
    expect(
      settings.screen
        .getByRole("link", { name: "Conectar Google" })
        .getAttribute("href"),
    ).toBe("/admin/google/conectar");
  });

  test("a visitor cannot start or finish the flow", async () => {
    expect(location(await get("/admin/google/conectar", {}))).toBe(
      "/admin/entrar",
    );
    expect(location(await get("/admin/google/vuelta?code=good", {}))).toBe(
      "/admin/entrar",
    );
  });

  test("a return without the state cookie is refused", async () => {
    const res = await get("/admin/google/vuelta?code=good&state=forged");
    expect(location(res)).toBe("/admin/ajustes?google=error");
    expect(await findAccount(DB)).toBeNull();
  });

  test("consent stores the account and its refresh token", async () => {
    const start = await get("/admin/google/conectar");
    expect(start.status).toBe(302);
    const consent = new URL(location(start));
    expect(consent.host).toBe("accounts.google.com");
    expect(consent.searchParams.get("redirect_uri")).toBe(
      `${ORIGIN}/admin/google/vuelta`,
    );
    expect(consent.searchParams.get("access_type")).toBe("offline");
    expect(consent.searchParams.get("scope")).toContain("calendar.events");
    const state = consent.searchParams.get("state") ?? "";
    const stateCookie = start.headers.get("set-cookie") ?? "";
    expect(stateCookie).toContain("Path=/admin/google");
    expect(stateCookie).toContain("HttpOnly");

    const back = await get(`/admin/google/vuelta?code=good&state=${state}`, {
      cookie: `${cookie}; up_google_state=${state}`,
    });
    expect(location(back)).toBe("/admin/ajustes?google=conectado");
    expect(await findAccount(DB)).toMatchObject({
      email: "rising@example.com",
      refreshToken: "r1",
    });
    const settings = await open("/admin/ajustes?google=conectado");
    expect(settings.screen.getByRole("status").textContent).toBe(
      "Google Calendar quedó conectado.",
    );
    expect(settings.text(".google-account p")).toBe(
      "Conectado como rising@example.com.",
    );
    expect(
      settings.screen.getByRole("button", { name: "Desconectar" }),
    ).toBeDefined();
  });
});

describe("the event's calendar copy", () => {
  test("creates the event with a Meet call and invites nobody", async () => {
    const res = await post("/admin/eventos/online/calendario");
    expect(location(res)).toBe("/admin/eventos/online?calendario=listo");
    const insert = google.calls.find(
      (c) => c.method === "POST" && c.body.startsWith("{"),
    );
    expect(insert?.url.searchParams.get("conferenceDataVersion")).toBe("1");
    expect(insert?.url.searchParams.get("sendUpdates")).toBe("none");
    const body = JSON.parse(insert?.body ?? "{}");
    expect(body.attendees).toBeUndefined();
    expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe(
      "hangoutsMeet",
    );
    expect(body.start).toEqual({
      dateTime: "2026-12-12T15:00:00-05:00",
      timeZone: "America/Lima",
    });
    expect((await findEvent(DB, "online"))?.calendar).toEqual({
      eventId: "g1",
      htmlUrl: "https://calendar.google.com/event?eid=g1",
      meetUrl: MEET,
    });
    expect(meetLinks(await open("/admin/eventos/online"))).toHaveLength(1);
  });

  test("only a ticket with a seat shows the Meet link", async () => {
    const seated = await open(await register("seat@example.com"), {});
    expect(
      seated.screen
        .getByRole("link", { name: "Entrar a la llamada en Google Meet" })
        .getAttribute("href"),
    ).toBe(MEET);

    const waiting = await open(await register("wait@example.com"), {});
    expect(meetLinks(waiting)).toEqual([]);
    expect(meetLinks(await open("/online", {}))).toEqual([]);
  });

  test("saving the event updates its calendar copy", async () => {
    const res = await post(
      "/admin/eventos/online/editar",
      editForm("Charla nueva"),
    );
    expect(location(res)).toBe("/admin/eventos/online/editar?guardado");
    expect(google.calendar.get("g1")?.summary).toBe("Charla nueva");
  });

  test("a Google failure keeps the save and says so", async () => {
    google.state.failNext = true;
    const res = await post(
      "/admin/eventos/online/editar",
      editForm("Charla otra"),
    );
    expect(location(res)).toBe(
      "/admin/eventos/online/editar?guardado&calendario=error",
    );
    expect((await findEvent(DB, "online"))?.title).toBe("Charla otra");
    const editor = await open(
      "/admin/eventos/online/editar?guardado&calendario=error",
    );
    expect(
      editor.screen.getAllByRole("status").map((s) => s.textContent?.trim()),
    ).toContain("Guardado.");
    expect(editor.screen.getByRole("alert").textContent).toStartWith(
      "Google no respondió bien",
    );
  });

  test("a copy deleted in Google is created again on sync", async () => {
    google.calendar.delete("g1");
    await post("/admin/eventos/online/calendario");
    expect((await findEvent(DB, "online"))?.calendar?.eventId).toBe("g2");
  });

  test("removing it deletes the copy and forgets the link", async () => {
    const res = await post("/admin/eventos/online/calendario/quitar");
    expect(location(res)).toBe("/admin/eventos/online?calendario=quitado");
    expect(google.calendar.has("g2")).toBe(false);
    expect((await findEvent(DB, "online"))?.calendar).toBeUndefined();
  });
});

describe("disconnecting", () => {
  test("revokes the token and forgets the account", async () => {
    const res = await post("/admin/google/desconectar");
    expect(location(res)).toBe("/admin/ajustes?google=desconectado");
    const revoke = google.calls.find((c) => c.url.pathname === "/revoke");
    expect(revoke?.body).toBe("token=r1");
    expect(await findAccount(DB)).toBeNull();
  });
});
