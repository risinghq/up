import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import type { Miniflare } from "miniflare";
import { findCertificate } from "../src/worker/certificates";
import type { Registration } from "../src/worker/form";
import {
  checkIn,
  findTicket,
  register,
  undoCheckIn,
} from "../src/worker/registrations";
import { addRole, eventRoles } from "../src/worker/roles";
import { event, HOST_TIMEOUT, migratedDb, seed } from "./support";

setDefaultTimeout(HOST_TIMEOUT);

const at = "2026-12-12T20:10:00.000Z";
const charla = event({ slug: "charla" });

let mf: Miniflare;
let DB: D1Database;

beforeAll(async () => {
  ({ mf, DB } = await migratedDb("certificates"));
  await seed(DB, [charla]);
});

afterAll(() => mf.dispose());

const person = (name: string, email: string): Registration => ({
  name,
  email,
  phone: "+51987654321",
  newsOptIn: false,
  answers: {},
});

const certificateOf = async (token: string) =>
  (await findTicket(DB, token))?.certificateId ?? null;

test("a ticket gets its certificate at check-in and keeps it", async () => {
  const { token } = await register(
    DB,
    charla,
    person("Rosa Mamani", "rosa@x.pe"),
    at,
  );
  expect(await certificateOf(token)).toBeNull();

  await checkIn(DB, token, at);
  const id = (await certificateOf(token)) ?? "";
  expect(await findCertificate(DB, id)).toEqual({
    id,
    eventSlug: "charla",
    name: "Rosa Mamani",
    role: null,
  });

  await undoCheckIn(DB, token);
  expect(await findCertificate(DB, id)).toBeNull();

  await checkIn(DB, token, at);
  expect(await certificateOf(token)).toBe(id);
});

test("a ticket's certificate names its holder's role, the first in role order", async () => {
  await addRole(DB, "charla", {
    name: "Luis Quispe",
    email: "luis@x.pe",
    role: "mentor",
  });
  await addRole(DB, "charla", {
    name: "Luis Quispe",
    email: "luis@x.pe",
    role: "ponente",
  });
  const { token } = await register(
    DB,
    charla,
    person("Luis Quispe", "luis@x.pe"),
    at,
  );
  await checkIn(DB, token, at);

  const found = await findCertificate(DB, (await certificateOf(token)) ?? "");
  expect(found?.role).toBe("ponente");
});

test("a role has a certificate of its own", async () => {
  await addRole(DB, "charla", {
    name: "Ana Torres",
    email: null,
    role: "jurado",
  });
  const id =
    (await eventRoles(DB, "charla")).find((p) => p.name === "Ana Torres")
      ?.certificateId ?? "";

  expect(await findCertificate(DB, id)).toEqual({
    id,
    eventSlug: "charla",
    name: "Ana Torres",
    role: "jurado",
  });
  expect(await findCertificate(DB, "nope")).toBeNull();
});
