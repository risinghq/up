import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Miniflare } from "miniflare";
import { addRole, eventRoles, rolesOf } from "../src/worker/roles";
import { event, migratedDb, seed } from "./support";

let mf: Miniflare;
let DB: D1Database;

beforeAll(async () => {
  ({ mf, DB } = await migratedDb("roles"));
  await seed(DB, [
    event({ slug: "abierto" }),
    event({ slug: "borrador", status: "draft" }),
  ]);
});

afterAll(() => mf.dispose());

test("an event lists its people in role order, then in the order added", async () => {
  const add = (name: string, role: "organiza" | "ponente") =>
    addRole(DB, "abierto", { name, email: null, role });
  await add("Pedro", "ponente");
  await add("Ana", "organiza");
  await add("Luis", "organiza");

  expect(
    (await eventRoles(DB, "abierto")).map((p) => [p.role, p.name]),
  ).toEqual([
    ["organiza", "Ana"],
    ["organiza", "Luis"],
    ["ponente", "Pedro"],
  ]);
});

test("a person's roles count only at published events", async () => {
  const rosa = { name: "Rosa", email: "rosa@example.com" };
  expect(await addRole(DB, "abierto", { ...rosa, role: "jurado" })).toBe(
    "added",
  );
  expect(await addRole(DB, "abierto", { ...rosa, role: "jurado" })).toBe(
    "exists",
  );
  await addRole(DB, "borrador", { ...rosa, role: "mentor" });

  expect(await rolesOf(DB, "rosa@example.com")).toEqual([
    { slug: "abierto", role: "jurado" },
  ]);
});
