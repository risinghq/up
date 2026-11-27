// Fills the local D1 with events, people, roles and tickets to develop
// against. It runs only on an empty database, and every date is an offset
// from today, so the upcoming events stay upcoming.
//
//   bun run db:migrate:local && bun run db:seed

import { getPlatformProxy } from "wrangler";
import { Db } from "../src/worker/db";
import { saveEvent, type EventMeta, type Place } from "../src/worker/events";
import type { Registration } from "../src/worker/form";
import { checkIn, register } from "../src/worker/registrations";
import { addRole, type Role } from "../src/worker/roles";

const ADMIN = "ana@example.com";
const LIMA = "-05:00";
const DAY = 86_400_000;

/** The date `days` from today in Lima, as YYYY-MM-DD. */
function limaDate(anchor: Date, days: number): string {
  const lima = new Date(anchor.getTime() - 5 * 3_600_000 + days * DAY);
  return lima.toISOString().slice(0, 10);
}

/** An ISO time with Lima's offset, `days` from today at `time`. */
const at = (anchor: Date, days: number, time: string) =>
  `${limaDate(anchor, days)}T${time}:00${LIMA}`;

const venue: Place = {
  kind: "venue",
  name: "FCF, UNMSM",
  address: "Av. Venezuela s/n, Lima",
  point: { lat: -12.0566, lng: -77.0844 },
};

function events(anchor: Date): EventMeta[] {
  const base: Pick<EventMeta, "body" | "questions" | "status" | "featured"> = {
    body: "## Qué haremos\n\nTraer laptop. Habrá café.",
    questions: [],
    status: "published",
    featured: false,
  };

  return [
    {
      ...base,
      slug: "mini-hackathon-ia",
      title: "Mini hackathon de IA",
      summary: "Un día para construir algo con modelos abiertos, en equipos.",
      start: at(anchor, 10, "09:00"),
      end: at(anchor, 10, "18:00"),
      place: venue,
      capacity: 40,
      questions: [
        { id: "carrera", label: "Carrera", required: true },
        {
          id: "nivel",
          label: "Nivel",
          required: true,
          options: ["Básico", "Intermedio", "Avanzado"],
        },
      ],
      featured: true,
      theme: {
        kind: "hackathon",
        accent: "#7c3aed",
        backdrop: "glow",
        font: "pixel",
      },
    },
    {
      ...base,
      slug: "taller-qiskit",
      title: "Taller de Qiskit",
      summary: "Tu primer circuito cuántico, paso a paso.",
      start: at(anchor, 17, "15:00"),
      end: at(anchor, 17, "19:00"),
      place: venue,
      capacity: 3,
      theme: {
        kind: "workshop",
        accent: "#2563eb",
        backdrop: "grid",
        font: "sans",
      },
    },
    {
      ...base,
      slug: "charla-rust",
      title: "Charla: Rust en producción",
      summary: "Lo que aprendimos al mover un servicio a Rust.",
      start: at(anchor, 3, "19:00"),
      end: at(anchor, 3, "20:30"),
      place: { kind: "online", platform: "Google Meet" },
      theme: {
        kind: "talk",
        accent: "#ea580c",
        backdrop: "dots",
        font: "mono",
      },
    },
    {
      ...base,
      slug: "meetup-comunidad",
      title: "Meetup de la comunidad",
      summary: "Demos cortas y conversación.",
      start: at(anchor, -20, "18:00"),
      end: at(anchor, -20, "21:00"),
      place: venue,
      theme: {
        kind: "meetup",
        accent: "#059669",
        backdrop: "plain",
        font: "serif",
      },
    },
    {
      ...base,
      slug: "borrador",
      title: "Evento en borrador",
      summary: "Solo lo ven los admins.",
      start: at(anchor, 40, "15:00"),
      end: at(anchor, 40, "18:00"),
      place: venue,
      status: "draft",
      theme: {
        kind: "workshop",
        accent: "#2563eb",
        backdrop: "grid",
        font: "sans",
      },
    },
  ];
}

const names = [
  "Ana Quispe",
  "Luis Mamani",
  "Rosa Huamán",
  "Pedro Flores",
  "Valeria Torres",
  "Diego Rojas",
];

const person = (name: string, answers = {}): Registration => ({
  name,
  email: `${name.split(" ")[0]?.toLowerCase()}@example.com`,
  phone: "+51987654321",
  newsOptIn: false,
  answers,
});

async function isEmpty(db: Db): Promise<boolean> {
  const row = await db
    .selectFrom("events")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n) === 0;
}

async function seed(db: Db, anchor: Date) {
  const now = anchor.toISOString();
  const all = events(anchor);
  for (const e of all) await saveEvent(db, e, now);

  const [hackathon, workshop, talk, meetup] = all;
  if (!hackathon || !workshop || !talk || !meetup) return;

  const ids = new Map<string, string>();
  const answers = { carrera: "Física", nivel: "Intermedio" };
  for (const name of names) {
    await register(db, hackathon, person(name, answers), now);
    await register(db, talk, person(name), now);
  }

  for (const name of names.slice(0, 5))
    await register(db, workshop, person(name), now);

  for (const name of names.slice(0, 4)) {
    const ticket = await register(db, meetup, person(name), now);
    if (name !== "Pedro Flores") await checkIn(db, ticket.token, meetup.start);
  }

  const people = await db.selectFrom("people").select(["id", "name"]).execute();
  for (const p of people) ids.set(p.name, p.id);

  const roles: [EventMeta, string, Role][] = [
    [hackathon, "Ana Quispe", "organizer"],
    [hackathon, "Luis Mamani", "mentor"],
    [hackathon, "Rosa Huamán", "judge"],
    [workshop, "Valeria Torres", "speaker"],
    [talk, "Diego Rojas", "speaker"],
    [meetup, "Ana Quispe", "organizer"],
    [meetup, "Luis Mamani", "volunteer"],
  ];
  for (const [e, name, role] of roles) {
    const id = ids.get(name);
    if (id) await addRole(db, e.slug, id, role);
  }

  await db
    .updateTable("people")
    .set({ admin: 1 })
    .where("email", "=", ADMIN)
    .execute();
}

const proxy = await getPlatformProxy<{ DB: D1Database }>();
const db = new Db(proxy.env.DB);

if (await isEmpty(db)) {
  await seed(db, new Date());
  console.log(
    `Seeded the local D1. Sign in at /sign-in as ${ADMIN}, an admin.`,
  );
} else {
  console.log("The local D1 already holds events; nothing seeded.");
}

await proxy.dispose();
