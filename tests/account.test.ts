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
import { softPasskey } from "./authenticator";
import { page } from "./dom";
import {
  event,
  form,
  HOST_TIMEOUT,
  migratedDb,
  ORIGIN,
  outbox,
  seed,
  signedIn,
  testEnv,
} from "./support";

setDefaultTimeout(HOST_TIMEOUT);

let clock = new Date("2026-12-01T12:00:00-05:00");
const app = createApp({ now: () => clock });
const mail = outbox();

let mf: Miniflare;
let DB: D1Database;
let env: Env;

beforeAll(async () => {
  let MEDIA: R2Bucket;
  ({ mf, DB, MEDIA } = await migratedDb("account"));
  env = testEnv(DB, MEDIA, { EMAIL: mail.binding });
  await seed(DB, [event({ slug: "charla" })]);
});

afterAll(() => mf.dispose());

/** Moves the clock past the one-minute resend cooldown. */
const tick = () => {
  clock = new Date(clock.getTime() + 2 * 60 * 1000);
};

const fields = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const post = (path: string, values: Record<string, string> = {}, cookie = "") =>
  app.request(
    path,
    {
      method: "POST",
      body: fields(values),
      headers: { origin: ORIGIN, ...(cookie && { cookie }) },
    },
    env,
  );

const get = (path: string, cookie = "") =>
  app.request(path, { headers: cookie ? { cookie } : {} }, env);

const postJson = (path: string, body: unknown, cookie = "") =>
  app.request(
    path,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(cookie && { cookie }),
      },
    },
    env,
  );

const location = (res: Response) => res.headers.get("location") ?? "";

/** The session cookie a response set, as a Cookie header. */
const session = (res: Response) =>
  (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

/** The code in the last mail sent to `email`. */
const lastCode = (email: string) =>
  (mail.subjects(email).at(-1) ?? "").slice(0, 6);

/** Asks for a sign-in code and returns it. */
async function requestCode(email: string, volver = "") {
  tick();
  const res = await post("/entrar", { email, volver });
  expect(res.status).toBe(200);
  return lastCode(email);
}

/** Starts a passkey ceremony and returns the challenge to answer. */
const begin = async (path: string, cookie = "") =>
  (await (await postJson(path, {}, cookie)).json()) as {
    challengeId: string;
    options: { challenge: string };
  };

const personByEmail = (email: string) =>
  DB.prepare("SELECT id, name, phone FROM people WHERE email = ?")
    .bind(email)
    .first<{ id: string; name: string; phone: string | null }>();

describe("signing in with a code", () => {
  test("a new email proves itself and names its account", async () => {
    const code = await requestCode("nueva@example.com", "/charla");
    expect(code).toMatch(/^\d{6}$/);

    const named = await post("/entrar/codigo", {
      email: "nueva@example.com",
      code,
      volver: "/charla",
    });
    const step = await page(named);
    expect(step.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Crea tu cuenta",
    );
    const token =
      step.document.querySelector<HTMLInputElement>("input[name=token]")
        ?.value ?? "";

    const unchecked = await post("/entrar/cuenta", {
      email: "nueva@example.com",
      token,
      name: "Lucía Rojas",
      volver: "/charla",
    });
    expect(unchecked.status).toBe(422);

    const created = await post("/entrar/cuenta", {
      email: "nueva@example.com",
      token,
      name: "Lucía Rojas",
      privacy: "on",
      volver: "/charla",
    });
    expect(location(created)).toBe("/charla");
    const account = await page(await get("/cuenta", session(created)));
    expect(account.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Tu cuenta",
    );
    expect((await personByEmail("nueva@example.com"))?.name).toBe(
      "Lucía Rojas",
    );

    // The proof is spent with the account.
    const again = await post("/entrar/cuenta", {
      email: "nueva@example.com",
      token,
      name: "Otra",
      privacy: "on",
    });
    expect(again.status).toBe(410);
  });

  test("an existing account signs in and returns where it was going", async () => {
    await signedIn(DB, clock, { email: "rosa@example.com", name: "Rosa" });
    const code = await requestCode("rosa@example.com", "/charla");
    const res = await post("/entrar/codigo", {
      email: "rosa@example.com",
      code,
      volver: "/charla",
    });
    expect(location(res)).toBe("/charla");
    expect(session(res)).toStartWith("up_session=");
  });

  test("a return path off the site falls back to the account page", async () => {
    const code = await requestCode("rosa@example.com", "//evil.example");
    const res = await post("/entrar/codigo", {
      email: "rosa@example.com",
      code,
      volver: "//evil.example",
    });
    expect(location(res)).toBe("/cuenta");
  });

  test("one address gets one code a minute", async () => {
    await requestCode("espera@example.com");
    const sent = mail.subjects("espera@example.com").length;
    const res = await post("/entrar", { email: "espera@example.com" });
    expect(res.status).toBe(200);
    expect(mail.subjects("espera@example.com")).toHaveLength(sent);
  });

  test("a code is gone after five wrong tries", async () => {
    const code = await requestCode("tries@example.com");
    const wrong = code === "000000" ? "111111" : "000000";
    const answers = [];
    for (let i = 0; i < 5; i++) {
      const res = await post("/entrar/codigo", {
        email: "tries@example.com",
        code: wrong,
      });
      answers.push(res.status);
    }
    expect(answers).toEqual([422, 422, 422, 422, 410]);

    const late = await post("/entrar/codigo", {
      email: "tries@example.com",
      code,
    });
    expect(late.status).toBe(410);
  });

  test("a post from another site is refused", async () => {
    const res = await app.request(
      "/entrar",
      {
        method: "POST",
        body: fields({ email: "rosa@example.com" }),
        headers: { origin: "https://evil.example" },
      },
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("passkeys", () => {
  test("an account adds a passkey and signs in with it", async () => {
    const { cookie } = await signedIn(DB, clock, {
      email: "llave@example.com",
      name: "Llave",
    });
    const key = await softPasskey(ORIGIN);

    const start = await begin("/cuenta/passkeys/opciones", cookie);
    const added = await postJson(
      "/cuenta/passkeys",
      {
        challengeId: start.challengeId,
        response: await key.create(start.options.challenge),
      },
      cookie,
    );
    expect(await added.json()).toEqual({
      redirect: "/cuenta?aviso=passkey#passkeys",
    });

    const signIn = await begin("/entrar/passkey/opciones");
    const answer = await key.get(signIn.options.challenge);
    const res = await postJson("/entrar/passkey", {
      challengeId: signIn.challengeId,
      response: answer,
      volver: "/charla",
    });
    expect(await res.json()).toEqual({ redirect: "/charla" });
    const account = await page(await get("/cuenta", session(res)));
    expect(
      account.screen.getByRole("textbox", { name: "Nombre y apellido" }),
    ).toHaveProperty("value", "Llave");

    // A challenge answers once.
    const replay = await postJson("/entrar/passkey", {
      challengeId: signIn.challengeId,
      response: answer,
    });
    expect(replay.status).toBe(401);
  });

  test("an unknown passkey is refused", async () => {
    const key = await softPasskey(ORIGIN);
    const start = await begin("/entrar/passkey/opciones");
    const res = await postJson("/entrar/passkey", {
      challengeId: start.challengeId,
      response: await key.get(start.options.challenge),
    });
    expect(res.status).toBe(401);
  });

  test("an account without an email keeps its last passkey", async () => {
    const { id, cookie } = await signedIn(DB, clock, { name: "Sin correo" });
    const key = await softPasskey(ORIGIN);
    const start = await begin("/cuenta/passkeys/opciones", cookie);
    await postJson(
      "/cuenta/passkeys",
      {
        challengeId: start.challengeId,
        response: await key.create(start.options.challenge),
      },
      cookie,
    );

    await post(`/cuenta/passkeys/${key.id}/quitar`, {}, cookie);
    const kept = await DB.prepare(
      "SELECT COUNT(*) AS n FROM credentials WHERE person_id = ?",
    )
      .bind(id)
      .first<{ n: number }>();
    expect(kept?.n).toBe(1);
  });
});

describe("the account", () => {
  test("a visitor is sent to sign in", async () => {
    expect(location(await get("/cuenta"))).toBe("/entrar?volver=%2Fcuenta");
  });

  test("signing out ends the session", async () => {
    const { cookie } = await signedIn(DB, clock, { name: "Sale" });
    const res = await post("/salir", {}, cookie);
    expect(location(res)).toBe("/");
    expect(location(await get("/cuenta", cookie))).toStartWith("/entrar");
  });

  test("proving an email folds that person's tickets into the account", async () => {
    const registered = await app.request(
      "/charla",
      {
        method: "POST",
        body: form({ email: "doble@example.com", name: "Doble" }),
      },
      env,
    );
    expect(registered.status).toBe(303);
    const before = await personByEmail("doble@example.com");

    const { id, cookie } = await signedIn(DB, clock, { name: "Doble" });
    tick();
    await post("/cuenta/correo", { email: "doble@example.com" }, cookie);
    const res = await post(
      "/cuenta/correo/codigo",
      { email: "doble@example.com", code: lastCode("doble@example.com") },
      cookie,
    );
    expect(location(res)).toBe("/cuenta?aviso=correo");

    const after = await personByEmail("doble@example.com");
    expect(after?.id).toBe(id);
    expect(after?.phone).toBe(before?.phone ?? null);
    const tickets = await DB.prepare(
      "SELECT COUNT(*) AS n FROM registrations WHERE person_id = ?",
    )
      .bind(id)
      .first<{ n: number }>();
    expect(tickets?.n).toBe(1);
  });

  test("an account with an email cannot take another person's", async () => {
    const { cookie } = await signedIn(DB, clock, {
      email: "propia@example.com",
      name: "Propia",
    });
    const res = await post(
      "/cuenta/correo",
      { email: "rosa@example.com" },
      cookie,
    );
    expect(res.status).toBe(422);
  });

  test("a registration without proof keeps the account's name and phone", async () => {
    await signedIn(DB, clock, { email: "fija@example.com", name: "Fija" });
    await app.request(
      "/charla",
      {
        method: "POST",
        body: form({ email: "fija@example.com", name: "Impostor" }),
      },
      env,
    );
    expect((await personByEmail("fija@example.com"))?.name).toBe("Fija");
  });

  test("tickets list the next event first and mark the ended ones", async () => {
    await seed(DB, [
      event({
        slug: "pasado",
        title: "Pasado",
        start: "2026-11-20T15:00:00-05:00",
        end: "2026-11-20T19:00:00-05:00",
      }),
      event({
        slug: "lejano",
        title: "Lejano",
        start: "2027-01-10T15:00:00-05:00",
        end: "2027-01-10T19:00:00-05:00",
      }),
      event({ slug: "cercano", title: "Cercano" }),
    ]);
    const { id, cookie } = await signedIn(DB, clock, { name: "Lista" });
    for (const [i, slug] of ["pasado", "lejano", "cercano"].entries())
      await DB.prepare(
        `INSERT INTO registrations (id, event_slug, person_id, number, status, answers, created_at)
         VALUES (?, ?, ?, 1, 'going', '{}', ?)`,
      )
        .bind(`lista-${i}`, slug, id, clock.toISOString())
        .run();

    const { screen } = await page(await get("/cuenta", cookie));
    const list = screen.getByRole("region", { name: "Tus entradas" });
    const items = [...list.querySelectorAll("li")].map((li) => li.textContent);

    expect(items.map((text) => text?.split(/\d/)[0])).toEqual([
      "Cercano",
      "Lejano",
      "Pasado",
    ]);
    expect(items[2]).toContain("Terminó");
    expect(items[0]).not.toContain("Terminó");
  });
});
