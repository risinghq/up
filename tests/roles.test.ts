import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Miniflare } from "miniflare";
import {
  claimEmail,
  findAccount,
  searchAccounts,
} from "../src/worker/accounts";
import {
  accountRoles,
  addRole,
  eventRoles,
  holdsDoor,
  rolesOf,
} from "../src/worker/roles";
import { event, migratedDb, seed, signedIn } from "./support";

let mf: Miniflare;
let DB: D1Database;

const now = new Date("2026-11-20T12:00:00.000Z");

const person = async (name: string, email?: string) =>
  (await signedIn(DB, now, { name, email })).id;

beforeAll(async () => {
  ({ mf, DB } = await migratedDb("roles"));
  await seed(DB, [
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
  await addRole(DB, "abierto", await person("Pedro"), "ponente");
  await addRole(DB, "abierto", await person("Ana"), "organiza");
  await addRole(DB, "abierto", await person("Luis"), "organiza");

  expect(
    (await eventRoles(DB, "abierto")).map((p) => [p.role, p.name]),
  ).toEqual([
    ["organiza", "Ana"],
    ["organiza", "Luis"],
    ["ponente", "Pedro"],
  ]);
});

test("a role goes to an existing person once", async () => {
  const rosa = await person("Rosa", "rosa@example.com");

  expect(await addRole(DB, "abierto", rosa, "jurado")).toBe("added");
  expect(await addRole(DB, "abierto", rosa, "jurado")).toBe("exists");
  expect(await addRole(DB, "abierto", "nadie", "jurado")).toBe("unknown");

  await addRole(DB, "borrador", rosa, "mentor");
  expect(await rolesOf(DB, rosa)).toEqual([
    { slug: "abierto", role: "jurado" },
  ]);
});

test("organizers and voluntarios hold the door of their own event", async () => {
  const cases = [
    { role: "organiza", slug: "abierto", door: true },
    { role: "voluntario", slug: "abierto", door: true },
    { role: "mentor", slug: "abierto", door: false },
    { role: "voluntario", slug: "borrador", door: false },
  ] as const;

  for (const c of cases) {
    const id = await person(`Door ${c.role} ${c.slug}`);
    await addRole(DB, c.slug, id, c.role);

    expect({ ...c, door: await holdsDoor(DB, "abierto", id) }).toEqual(c);
  }
});

test("an account lists its published roles, upcoming first, then the latest past", async () => {
  const id = await person("Sara");
  await addRole(DB, "lejano", id, "ponente");
  await addRole(DB, "pasado", id, "mentor");
  await addRole(DB, "abierto", id, "voluntario");
  await addRole(DB, "borrador", id, "organiza");

  expect(
    (await accountRoles(DB, id, now)).map((r) => [r.slug, r.role, r.past]),
  ).toEqual([
    ["abierto", "voluntario", false],
    ["lejano", "ponente", false],
    ["pasado", "mentor", true],
  ]);
});

test("the team search matches a name or an email, people with an email first", async () => {
  await person("Martina Ruiz");
  await person("Martín Soto", "msoto@example.com");
  await person("100% Real", "real@example.com");

  const names = async (query: string) =>
    (await searchAccounts(DB, query)).map((a) => a.name);

  expect(await names("mart")).toEqual(["Martín Soto", "Martina Ruiz"]);
  expect(await names("MSOTO@")).toEqual(["Martín Soto"]);
  expect(await names("0%")).toEqual(["100% Real"]);
  expect(await names("zzz")).toEqual([]);
});

test("proving a role holder's email moves the role to the account", async () => {
  const holder = await person("Teo", "teo@example.com");
  await addRole(DB, "abierto", holder, "mentor");
  await addRole(DB, "lejano", holder, "jurado");

  const accountId = await person("Teo");
  await addRole(DB, "abierto", accountId, "mentor");
  const account = await findAccount(DB, accountId);
  if (!account) throw new Error("no account");

  expect(
    await claimEmail(DB, account, "teo@example.com", now.toISOString()),
  ).toBe("changed");
  expect(await rolesOf(DB, accountId)).toEqual(
    expect.arrayContaining([
      { slug: "abierto", role: "mentor" },
      { slug: "lejano", role: "jurado" },
    ]),
  );
  expect(
    (await eventRoles(DB, "abierto")).filter((r) => r.name === "Teo"),
  ).toHaveLength(1);
});
