import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import type { Miniflare } from "miniflare";
import type { Db } from "../src/worker/db";
import type { Registration } from "../src/worker/form";
import {
  cancel,
  checkIn,
  claimResend,
  findTicket,
  goingCount,
  register,
  walkIn,
} from "../src/worker/registrations";
import { event, HOST_TIMEOUT, migratedDb, seed } from "./support";

setDefaultTimeout(HOST_TIMEOUT);

const at = "2026-12-01T17:00:00.000Z";

let mf: Miniflare;
let db: Db;

beforeAll(async () => {
  ({ mf, db } = await migratedDb("registrations"));
});

afterAll(() => mf.dispose());

const person = (email: string): Registration => ({
  name: `Persona ${email}`,
  email,
  phone: "+51987654321",
  newsOptIn: false,
  answers: {},
});

/** A fresh event of its own, so each test counts only its own seats. */
async function freshEvent(slug: string, capacity?: number) {
  const e = event({ slug, ...(capacity !== undefined && { capacity }) });
  await seed(db, [e]);
  return e;
}

describe("register", () => {
  test("seats up to the capacity, then waitlists, numbering in order", async () => {
    const e = await freshEvent("cupos", 2);

    const results = [];
    for (const email of ["a@x.pe", "b@x.pe", "c@x.pe"])
      results.push(await register(db, e, person(email), at));

    expect(results.map((r) => r.kind === "created" && r.status)).toEqual([
      "going",
      "going",
      "waitlist",
    ]);
    const tickets = await Promise.all(
      results.map((r) => findTicket(db, r.token)),
    );
    expect(tickets.map((t) => t?.number)).toEqual([1, 2, 3]);
  });

  test("an event without capacity seats everyone", async () => {
    const e = await freshEvent("abierto");
    for (const email of ["a@x.pe", "b@x.pe", "c@x.pe"])
      await register(db, e, person(email), at);
    expect(await goingCount(db, e.slug)).toBe(3);
  });

  test("registrations at once never take more seats than the capacity", async () => {
    const e = await freshEvent("carrera", 3);
    const emails = Array.from({ length: 12 }, (_, i) => `r${i}@x.pe`);

    const results = await Promise.all(
      emails.map((email) => register(db, e, person(email), at)),
    );

    const seated = results.filter(
      (r) => r.kind === "created" && r.status === "going",
    );
    expect(seated).toHaveLength(3);
    expect(await goingCount(db, e.slug)).toBe(3);

    const numbers = await Promise.all(
      results.map(async (r) => (await findTicket(db, r.token))?.number),
    );
    expect(new Set(numbers).size).toBe(emails.length);
  });

  test("an email with a live ticket gets that ticket back", async () => {
    const e = await freshEvent("repite");
    const first = await register(db, e, person("a@x.pe"), at);
    const again = await register(db, e, person("a@x.pe"), at);
    expect(again).toEqual({ kind: "exists", token: first.token });
  });

  test("a cancelled ticket comes back under a new token, and the old one is gone", async () => {
    const e = await freshEvent("vuelve");
    const old = await register(db, e, person("a@x.pe"), at);
    await cancel(db, e, old.token, at);

    const back = await register(db, e, person("a@x.pe"), at);
    expect(back.kind).toBe("created");
    expect(back.token).not.toBe(old.token);
    expect(await findTicket(db, old.token)).toBeNull();
    expect((await findTicket(db, back.token))?.status).toBe("going");
  });

  test("a revived ticket waitlists when the event filled meanwhile", async () => {
    const e = await freshEvent("lleno", 1);
    const old = await register(db, e, person("a@x.pe"), at);
    await cancel(db, e, old.token, at);
    await register(db, e, person("b@x.pe"), at);

    const back = await register(db, e, person("a@x.pe"), at);
    expect(back.kind === "created" && back.status).toBe("waitlist");
  });
});

describe("cancel", () => {
  test("a freed seat goes to the oldest waitlisted ticket", async () => {
    const e = await freshEvent("libera", 1);
    const seated = await register(db, e, person("a@x.pe"), at);
    const first = await register(db, e, person("b@x.pe"), at);
    const second = await register(db, e, person("c@x.pe"), at);

    expect(await cancel(db, e, seated.token, at)).toEqual([first.token]);
    expect((await findTicket(db, first.token))?.status).toBe("going");
    expect((await findTicket(db, second.token))?.status).toBe("waitlist");
  });

  test("a waitlisted cancellation frees no seat", async () => {
    const e = await freshEvent("espera", 1);
    await register(db, e, person("a@x.pe"), at);
    const waiting = await register(db, e, person("b@x.pe"), at);
    expect(await cancel(db, e, waiting.token, at)).toEqual([]);
  });

  test("a checked-in ticket stays: the person attended", async () => {
    const e = await freshEvent("adentro");
    const ticket = await register(db, e, person("a@x.pe"), at);
    await checkIn(db, ticket.token, at);

    await cancel(db, e, ticket.token, at);
    expect((await findTicket(db, ticket.token))?.status).toBe("going");
  });
});

describe("checkIn", () => {
  test("keeps the first time, and refuses a cancelled ticket", async () => {
    const e = await freshEvent("puerta");
    const kept = await register(db, e, person("a@x.pe"), at);
    await checkIn(db, kept.token, at);
    await checkIn(db, kept.token, "2026-12-01T18:00:00.000Z");
    expect((await findTicket(db, kept.token))?.checkedInAt).toBe(at);

    const gone = await register(db, e, person("b@x.pe"), at);
    await cancel(db, e, gone.token, at);
    await checkIn(db, gone.token, at);
    expect((await findTicket(db, gone.token))?.checkedInAt).toBeNull();
  });
});

describe("walkIn", () => {
  test("seats a walk-in past the capacity, and checks in a known one on their ticket", async () => {
    const e = await freshEvent("llegada", 1);
    const booked = await register(db, e, person("a@x.pe"), at);

    const walked = await walkIn(db, e, person("b@x.pe"), at);
    expect(walked.kind).toBe("created");
    expect(walked.ticket.status).toBe("going");
    expect(walked.ticket.checkedInAt).toBe(at);
    expect(await goingCount(db, "llegada")).toBe(2);

    const known = await walkIn(db, e, person("a@x.pe"), at);
    expect(known.kind).toBe("exists");
    expect(known.ticket.token).toBe(booked.token);
    expect(known.ticket.checkedInAt).toBe(at);
  });
});

describe("claimResend", () => {
  test("grants one resend per cooldown", async () => {
    const e = await freshEvent("reenvio");
    const { token } = await register(db, e, person("a@x.pe"), at);
    const t0 = new Date(at);
    const later = (ms: number) => new Date(t0.getTime() + ms);

    expect(await claimResend(db, token, t0, 60_000)).toBe(true);
    expect(await claimResend(db, token, later(59_000), 60_000)).toBe(false);
    expect(await claimResend(db, token, later(60_000), 60_000)).toBe(true);
  });
});
