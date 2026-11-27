import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Miniflare } from "miniflare";
import {
  claimEmail,
  findAccount,
  searchAccounts,
} from "../src/worker/accounts";
import type { Db } from "../src/worker/db";
import {
  accountRoles,
  addRole,
  eventRoles,
  holdsDoor,
  rolesOf,
} from "../src/worker/roles";
import { event, migratedDb, seed, signedIn } from "./support";

let mf: Miniflare;
let db: Db;

const now = new Date("2026-11-20T12:00:00.000Z");

const person = async (name: string, email?: string) =>
  (await signedIn(db, now, { name, email })).id;

beforeAll(async () => {
  ({ mf, db } = await migratedDb("roles"));
  await seed(db, [
    event({ slug: "abierto" }),
    event({ slug: "borrador", status: "draft" }),
    event({
      slug: "pasado",
      start: "2026-10-01T15:00:00-05:00",
      end: "2026-10-01T19:00:00-05:00",
    }),
    event({
      slug: "lejano",
      start: "2027-01-10T15:00:00-05:00",
      end: "2027-01-10T19:00:00-05:00",
    }),
  ]);
});

afterAll(() => mf.dispose());

test("an event lists its people in role order, then in the order added", async () => {
  await addRole(db, "abierto", await person("Pedro"), "speaker");
  await addRole(db, "abierto", await person("Ana"), "organizer");
  await addRole(db, "abierto", await person("Luis"), "organizer");

  expect(
    (await eventRoles(db, "abierto")).map((p) => [p.role, p.name]),
  ).toEqual([
    ["organizer", "Ana"],
    ["organizer", "Luis"],
    ["speaker", "Pedro"],
  ]);
});

test("a role goes to an existing person once", async () => {
  const rosa = await person("Rosa", "rosa@example.com");

  expect(await addRole(db, "abierto", rosa, "judge")).toBe("added");
  expect(await addRole(db, "abierto", rosa, "judge")).toBe("exists");
  expect(await addRole(db, "abierto", "nadie", "judge")).toBe("unknown");

  await addRole(db, "borrador", rosa, "mentor");
  expect(await rolesOf(db, rosa)).toEqual([{ slug: "abierto", role: "judge" }]);
});

test("organizers and volunteers hold the door of their own event", async () => {
  const cases = [
    { role: "organizer", slug: "abierto", door: true },
    { role: "volunteer", slug: "abierto", door: true },
    { role: "mentor", slug: "abierto", door: false },
    { role: "volunteer", slug: "borrador", door: false },
  ] as const;

  for (const c of cases) {
    const id = await person(`Door ${c.role} ${c.slug}`);
    await addRole(db, c.slug, id, c.role);

    expect({ ...c, door: await holdsDoor(db, "abierto", id) }).toEqual(c);
  }
});

test("an account lists its published roles, upcoming first, then the latest past", async () => {
  const id = await person("Sara");
  await addRole(db, "lejano", id, "speaker");
  await addRole(db, "pasado", id, "mentor");
  await addRole(db, "abierto", id, "volunteer");
  await addRole(db, "borrador", id, "organizer");

  expect(
    (await accountRoles(db, id, now)).map((r) => [r.slug, r.role, r.past]),
  ).toEqual([
    ["abierto", "volunteer", false],
    ["lejano", "speaker", false],
    ["pasado", "mentor", true],
  ]);
});

test("the team search matches a name or an email, people with an email first", async () => {
  await person("Martina Ruiz");
  await person("Martín Soto", "msoto@example.com");
  await person("100% Real", "real@example.com");

  const names = async (query: string) =>
    (await searchAccounts(db, query)).map((a) => a.name);

  expect(await names("mart")).toEqual(["Martín Soto", "Martina Ruiz"]);
  expect(await names("MSOTO@")).toEqual(["Martín Soto"]);
  expect(await names("0%")).toEqual(["100% Real"]);
  expect(await names("zzz")).toEqual([]);
});

test("proving a role holder's email moves the role to the account", async () => {
  const holder = await person("Teo", "teo@example.com");
  await addRole(db, "abierto", holder, "mentor");
  await addRole(db, "lejano", holder, "judge");

  const accountId = await person("Teo");
  await addRole(db, "abierto", accountId, "mentor");
  const account = await findAccount(db, accountId);
  if (!account) throw new Error("no account");

  expect(
    await claimEmail(db, account, "teo@example.com", now.toISOString()),
  ).toBe("changed");
  expect(await rolesOf(db, accountId)).toEqual(
    expect.arrayContaining([
      { slug: "abierto", role: "mentor" },
      { slug: "lejano", role: "judge" },
    ]),
  );
  expect(
    (await eventRoles(db, "abierto")).filter((r) => r.name === "Teo"),
  ).toHaveLength(1);
});
