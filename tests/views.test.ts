import { describe, expect, test } from "bun:test";
import type { EventMeta } from "../src/worker/events";
import type { Profile } from "../src/worker/profiles";
import type { Ticket } from "../src/worker/registrations";
import type { EventRole, Role } from "../src/worker/roles";
import { certificateView } from "../src/pages/Certificate.view";
import { eventView } from "../src/pages/Event.view";
import { profileView } from "../src/pages/Profile.view";
import { ticketView, type Standing } from "../src/pages/Ticket.view";
import { event } from "./support";

const origin = "https://up.test";
const before = { origin, now: new Date("2026-12-01T12:00:00-05:00") };
const after = { origin, now: new Date("2026-12-13T12:00:00-05:00") };

const charla = event({ slug: "charla", title: "Charla abierta" });
const online = event({
  slug: "online",
  place: { kind: "online", platform: "Google Meet" },
  calendar: { eventId: "g1", htmlUrl: "", meetUrl: "https://meet.test/x" },
});

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    token: "T".repeat(22),
    personId: "p1",
    eventSlug: "charla",
    number: 1,
    status: "going",
    name: "Rosa Mamani",
    email: "rosa@example.com",
    phone: "+51987654321",
    createdAt: "2026-11-20T00:00:00.000Z",
    checkedInAt: null,
    shareId: null,
    profileId: null,
    certificateId: null,
    ...overrides,
  };
}

const view = (
  t: Ticket,
  options: { e?: EventMeta; context?: typeof before; hasRole?: boolean } = {},
) =>
  ticketView(options.context ?? before, {
    ticket: t,
    event: options.e ?? charla,
    fresh: false,
    door: false,
    whatsapp: "https://chat.whatsapp.com/test",
    hasRole: options.hasRole ?? false,
  });

describe("ticketView", () => {
  test("the panels follow the ticket's state", () => {
    const inside = ticket({
      checkedInAt: "2026-12-12T20:10:00.000Z",
      certificateId: "C1",
    });
    const cases = [
      {
        name: "seated, before the event",
        t: ticket(),
        panels: ["next", "venue", "share"],
      },
      {
        name: "a role holder, before check-in",
        t: ticket(),
        hasRole: true,
        panels: ["next", "venue", "share", "profile"],
      },
      {
        name: "checked in: the profile leads, the venue goes",
        t: inside,
        panels: ["profile", "next", "share"],
      },
      { name: "cancelled", t: ticket({ status: "cancelled" }), panels: [] },
      {
        name: "after the event, checked in: the certificate leads",
        t: inside,
        context: after,
        panels: ["certificate", "profile"],
      },
      {
        name: "after the event, never came in",
        t: ticket(),
        context: after,
        panels: [],
      },
    ] as const;

    for (const c of cases)
      expect(
        view(c.t, {
          context: "context" in c ? c.context : before,
          hasRole: "hasRole" in c ? c.hasRole : false,
        }).panels,
        c.name,
      ).toEqual([...c.panels]);
  });

  test("the QR shows only for a live venue ticket not yet used", () => {
    expect(view(ticket()).qr).toStartWith("<svg");
    expect(view(ticket({ checkedInAt: before.now.toISOString() })).qr).toBe(
      undefined,
    );
    expect(view(ticket({ status: "cancelled" })).qr).toBe(undefined);
    expect(view(ticket(), { context: after }).qr).toBe(undefined);
    expect(view(ticket(), { e: online }).qr).toBe(undefined);
  });

  test("only a seat gets the call and the credential", () => {
    const seated = view(ticket(), { e: online });
    expect(seated.next.meetUrl).toBe("https://meet.test/x");
    expect(seated.credential).toBe(true);

    const waiting = view(ticket({ status: "waitlist" }), { e: online });
    expect(waiting.next.meetUrl).toBe(undefined);
    expect(waiting.credential).toBe(false);

    expect(view(ticket(), { context: after }).credential).toBe(false);
  });

  test("the ticket says where the holder stands, past tense once it ends", () => {
    const inside = { checkedInAt: before.now.toISOString() };
    const cases: {
      name: string;
      t: Ticket;
      context: typeof before;
      standing: Standing;
    }[] = [
      { name: "seated", t: ticket(), context: before, standing: "going" },
      {
        name: "checked in",
        t: ticket(inside),
        context: before,
        standing: "going",
      },
      {
        name: "came in",
        t: ticket(inside),
        context: after,
        standing: "attended",
      },
      {
        name: "seated, never came",
        t: ticket(),
        context: after,
        standing: "missed",
      },
      {
        name: "still waiting",
        t: ticket({ status: "waitlist" }),
        context: after,
        standing: "missed",
      },
      {
        name: "cancelled",
        t: ticket({ status: "cancelled" }),
        context: after,
        standing: "cancelled",
      },
    ];
    for (const c of cases)
      expect(view(c.t, { context: c.context }).standing, c.name).toBe(
        c.standing,
      );
  });

  test("the community is the primary action until the call or the door outranks it", () => {
    expect(view(ticket()).next.communityPrimary).toBe(true);
    expect(view(ticket(), { e: online }).next.communityPrimary).toBe(false);
    const inside = ticket({ checkedInAt: before.now.toISOString() });
    expect(view(inside).next.communityPrimary).toBe(false);
    expect(view(inside).profile.primary).toBe(true);
  });

  test("a certificate is offered once the event the holder came in to is over", () => {
    const inside = ticket({ checkedInAt: "2026-12-12T20:10:00.000Z" });
    const certified = { ...inside, certificateId: "C1" };

    const v = view(certified, { context: after });
    expect(v.certificateUrl).toBe(`${origin}/c/C1`);
    expect(v.profile.primary).toBe(false);

    expect(view(certified).certificateUrl).toBe(undefined);
    expect(
      view(certified, { context: after, e: { ...charla, status: "draft" } })
        .certificateUrl,
    ).toBe(undefined);
  });

  test("a cancelled ticket offers to register again while the event is ahead", () => {
    const cancelled = ticket({ status: "cancelled" });
    expect(view(cancelled).rejoin).toBe(true);
    expect(view(cancelled, { context: after }).rejoin).toBe(false);
  });

  test("the share and profile links are absolute, from their own ids", () => {
    const v = view(ticket({ shareId: "S1", profileId: "P1" }));
    expect(v.ticketUrl).toBe(`${origin}/entrada/${"T".repeat(22)}`);
    expect(v.shareUrl).toBe(`${origin}/charla/voy/S1`);
    expect(v.profile.url).toBe(`${origin}/p/P1`);
  });
});

describe("eventView", () => {
  test("groups the people by role and links only those with a profile", () => {
    const person = (
      id: number,
      name: string,
      role: Role,
      profileId: string | null = null,
    ): EventRole => ({
      id,
      eventSlug: "charla",
      personId: `person-${id}`,
      name,
      email: null,
      profileId,
      role,
      certificateId: `C${id}`,
    });
    const v = eventView(before, {
      event: charla,
      going: 0,
      team: [
        person(1, "Rosa", "jurado"),
        person(2, "Ana Quispe", "organiza", "P1"),
        person(3, "Luis", "organiza"),
        person(4, "Pedro", "ponente"),
      ],
      form: { values: {}, errors: {} },
      notice: null,
      admin: false,
      turnstileKey: null,
    });
    expect(v.team).toEqual([
      {
        role: "organiza",
        label: "Organizan",
        people: [{ name: "Ana Quispe", url: "/p/P1" }, { name: "Luis" }],
      },
      { role: "ponente", label: "Ponentes", people: [{ name: "Pedro" }] },
      { role: "jurado", label: "Jurado", people: [{ name: "Rosa" }] },
    ]);
  });

  test("ends at the event's end", () => {
    const at = (now: string) =>
      eventView(
        { origin, now: new Date(now) },
        {
          event: charla,
          going: 0,
          team: [],
          form: { values: {}, errors: {} },
          notice: null,
          admin: false,
          turnstileKey: null,
        },
      ).ended;
    expect(at("2026-12-12T18:59:59-05:00")).toBe(false);
    expect(at("2026-12-12T19:00:00-05:00")).toBe(true);
  });
});

describe("profileView", () => {
  const events = [
    event({ slug: "a", start: "2026-10-01T15:00:00-05:00" }),
    event({ slug: "b", start: "2026-12-01T15:00:00-05:00" }),
    event({ slug: "c", start: "2026-11-01T15:00:00-05:00" }),
  ];
  const profile = {
    firstName: "Valeria",
    since: "2026-09-01T00:00:00.000Z",
    attended: ["a", "b", "c"],
    roles: [] as Profile["roles"],
  };

  test("lists events newest first, only the ones the person attended", () => {
    const v = profileView({ ...profile, attended: ["a", "b"] }, events);
    expect(v.events.map((e) => e.slug)).toEqual(["b", "a"]);
  });

  test("groups the events a person had a role at, in role order", () => {
    const plain = profileView(profile, events);
    expect(plain.roles).toEqual([]);
    expect(plain.description).toBe("Los eventos a los que fue Valeria.");

    const v = profileView(
      {
        ...profile,
        roles: [
          { slug: "a", role: "mentor" },
          { slug: "a", role: "organiza" },
          { slug: "b", role: "organiza" },
        ],
      },
      events,
    );
    expect(
      v.roles.map((g) => [g.role, g.tally, g.events.map((e) => e.slug)]),
    ).toEqual([
      ["organiza", "organizados", ["b", "a"]],
      ["mentor", "como mentor", ["a"]],
    ]);
    expect(v.description).toBe(
      "Los eventos en los que participa Valeria y a los que fue.",
    );
  });
});

describe("certificateView", () => {
  const rosa = { id: "C1", eventSlug: "charla", name: "Rosa Mamani" };

  test("says what the person did, when and where", () => {
    const cases = [
      { role: null, verb: "asistió a", e: charla, place: "FCF, UNMSM" },
      { role: "mentor", verb: "fue mentor en", e: online, place: "En línea" },
      { role: "organiza", verb: "organizó", e: charla, place: "FCF, UNMSM" },
    ] as const;

    for (const c of cases) {
      const v = certificateView(after, { ...rosa, role: c.role }, c.e);
      expect([v.verb, v.place], String(c.role)).toEqual([c.verb, c.place]);
    }
  });

  test("names the day once, or the span of days", () => {
    const span = (start: string, end: string) =>
      certificateView(
        after,
        { ...rosa, role: null },
        event({ slug: "charla", start, end }),
      ).date;

    expect(span("2026-12-12T15:00:00-05:00", "2026-12-12T19:00:00-05:00")).toBe(
      "12 de diciembre de 2026",
    );
    expect(span("2026-12-12T09:00:00-05:00", "2026-12-13T18:00:00-05:00")).toBe(
      "del 12 al 13 de diciembre de 2026",
    );
    expect(span("2026-11-30T09:00:00-05:00", "2026-12-02T18:00:00-05:00")).toBe(
      "del 30 de noviembre al 2 de diciembre de 2026",
    );
    expect(span("2026-12-31T20:00:00-05:00", "2027-01-01T02:00:00-05:00")).toBe(
      "del 31 de diciembre de 2026 al 1 de enero de 2027",
    );
  });

  test("prints its own absolute address", () => {
    expect(certificateView(after, { ...rosa, role: null }, charla).url).toBe(
      `${origin}/c/C1`,
    );
  });
});
