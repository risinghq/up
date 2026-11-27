import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import type { Miniflare } from "miniflare";
import { findCertificate } from "../src/worker/certificates";
import type { Db } from "../src/worker/db";
import type { Registration } from "../src/worker/form";
import {
  checkIn,
  findTicket,
  register,
  undoCheckIn,
} from "../src/worker/registrations";
import { addRole, eventRoles } from "../src/worker/roles";
import { event, HOST_TIMEOUT, migratedDb, newPerson, seed } from "./support";

setDefaultTimeout(HOST_TIMEOUT);

const at = "2026-12-12T20:10:00.000Z";
const talk = event({ slug: "charla" });

let mf: Miniflare;
let db: Db;

beforeAll(async () => {
  ({ mf, db } = await migratedDb("certificates"));
  await seed(db, [talk]);
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
  (await findTicket(db, token))?.certificateId ?? null;

test("a ticket gets its certificate at check-in and keeps it", async () => {
  const { token } = await register(
    db,
    talk,
    person("Rosa Mamani", "rosa@x.pe"),
    at,
  );
  expect(await certificateOf(token)).toBeNull();

  await checkIn(db, token, at);
  const id = (await certificateOf(token)) ?? "";
  expect(await findCertificate(db, id)).toEqual({
    id,
    eventSlug: "charla",
    name: "Rosa Mamani",
    role: null,
  });

  await undoCheckIn(db, token);
  expect(await findCertificate(db, id)).toBeNull();

  await checkIn(db, token, at);
  expect(await certificateOf(token)).toBe(id);
});

test("a ticket's certificate names its holder's role, the first in role order", async () => {
  const luis = await newPerson(db, {
    name: "Luis Quispe",
    email: "luis@x.pe",
  });
  await addRole(db, "charla", luis, "mentor");
  await addRole(db, "charla", luis, "speaker");
  const { token } = await register(
    db,
    talk,
    person("Luis Quispe", "luis@x.pe"),
    at,
  );
  await checkIn(db, token, at);

  const found = await findCertificate(db, (await certificateOf(token)) ?? "");
  expect(found?.role).toBe("speaker");
});

test("a role has a certificate of its own", async () => {
  await addRole(
    db,
    "charla",
    await newPerson(db, { name: "Ana Torres" }),
    "judge",
  );
  const id =
    (await eventRoles(db, "charla")).find((p) => p.name === "Ana Torres")
      ?.certificateId ?? "";

  expect(await findCertificate(db, id)).toEqual({
    id,
    eventSlug: "charla",
    name: "Ana Torres",
    role: "judge",
  });
  expect(await findCertificate(db, "nope")).toBeNull();
});
