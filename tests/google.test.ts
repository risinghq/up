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
    hosts: "David",
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
    const page = await app.request("/admin", { headers: { cookie } }, bare);
    expect(await page.text()).not.toContain("Google Calendar");
    const res = await app.request(
      "/admin/google/conectar",
      { headers: { cookie } },
      bare,
    );
    expect(res.status).toBe(404);
  });
});

describe("connecting", () => {
  test("the dashboard offers to connect", async () => {
    const html = await (await get("/admin")).text();
    expect(html).toContain('href="/admin/google/conectar"');
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
    expect(location(res)).toBe("/admin?google=error");
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
    expect(location(back)).toBe("/admin?google=conectado");
    expect(await findAccount(DB)).toMatchObject({
      email: "rising@example.com",
      refreshToken: "r1",
    });
    const html = await (await get("/admin?google=conectado")).text();
    expect(html).toContain("rising@example.com");
    expect(html).toContain("Google Calendar quedó conectado.");
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
    const html = await (await get("/admin/eventos/online")).text();
    expect(html).toContain(MEET);
  });

  test("only a ticket with a seat shows the Meet link", async () => {
    const seated = await register("seat@example.com");
    const waiting = await register("wait@example.com");
    expect(await (await get(seated, {})).text()).toContain(MEET);
    expect(await (await get(waiting, {})).text()).not.toContain(MEET);
    expect(await (await get("/online", {})).text()).not.toContain(MEET);
  });

  test("saving the event updates its calendar copy", async () => {
    const res = await post("/admin/eventos/online", editForm("Charla nueva"));
    expect(location(res)).toBe("/admin/eventos/online?guardado");
    expect(google.calendar.get("g1")?.summary).toBe("Charla nueva");
  });

  test("a Google failure keeps the save and says so", async () => {
    google.state.failNext = true;
    const res = await post("/admin/eventos/online", editForm("Charla otra"));
    expect(location(res)).toBe(
      "/admin/eventos/online?guardado&calendario=error",
    );
    expect((await findEvent(DB, "online"))?.title).toBe("Charla otra");
    const html = await (
      await get("/admin/eventos/online?guardado&calendario=error")
    ).text();
    expect(html).toContain("Google no respondió bien");
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
    expect(location(res)).toBe("/admin?google=desconectado");
    const revoke = google.calls.find((c) => c.url.pathname === "/revoke");
    expect(revoke?.body).toBe("token=r1");
    expect(await findAccount(DB)).toBeNull();
  });
});
