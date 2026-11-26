import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Miniflare } from "miniflare";
import {
  addRole,
  doorEvent,
  eventRoles,
  openDoor,
  removeRole,
  rolesOf,
} from "../src/worker/roles";
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

test("a door link opens one event for a voluntario until replaced or removed", async () => {
  const add = (name: string, role: "voluntario" | "mentor") =>
    addRole(DB, "borrador", { name, email: null, role });
  await add("Vale", "voluntario");
  await add("Mario", "mentor");
  const id = async (name: string) =>
    (await eventRoles(DB, "borrador")).find((p) => p.name === name)?.id ?? 0;

  expect(await openDoor(DB, "borrador", await id("Mario"))).toBeNull();
  expect(await openDoor(DB, "abierto", await id("Vale"))).toBeNull();

  const first = (await openDoor(DB, "borrador", await id("Vale"))) ?? "";
  expect(await doorEvent(DB, first)).toBe("borrador");
  expect(
    (await eventRoles(DB, "borrador")).map((p) => [p.name, p.door]),
  ).toEqual([
    ["Mario", false],
    ["Vale", true],
  ]);

  const second = (await openDoor(DB, "borrador", await id("Vale"))) ?? "";
  expect(await doorEvent(DB, first)).toBeNull();
  expect(await doorEvent(DB, second)).toBe("borrador");

  await removeRole(DB, "borrador", await id("Vale"));
  expect(await doorEvent(DB, second)).toBeNull();
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
