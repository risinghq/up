import { placeLine } from "./calendar";
import type { EventMeta } from "./events";
import { findTicket, type Ticket } from "./registrations";
import { clock, longDate } from "./time";

/** The address is listed under the EMAIL binding's allowed senders. */
const from = { email: "eventos@rising.sh", name: "up.rising.sh" };
const replyTo = "david@rising.sh";

/** Why a ticket's holder gets an email. */
export type MailKind = "going" | "waitlist" | "promoted" | "again" | "reminder";

export type Mail = { to: string; subject: string; html: string; text: string };

const copy: Record<MailKind, { subject: string; lead: string }> = {
  going: { subject: "Estás inscrito", lead: "Tu cupo está confirmado." },
  waitlist: {
    subject: "Estás en la lista de espera",
    lead: "Los cupos se llenaron y quedaste en la lista de espera. Si alguien cancela, te damos su cupo y te escribimos.",
  },
  promoted: {
    subject: "Tienes cupo",
    lead: "Se liberó un cupo y ahora es tuyo.",
  },
  again: {
    subject: "Tu entrada",
    lead: "Este correo ya estaba inscrito, así que te reenviamos el enlace de tu entrada. Si no fuiste tú, ignora este mensaje.",
  },
  reminder: {
    subject: "Recordatorio",
    lead: "Tu evento empieza en menos de un día. Te esperamos.",
  },
};

const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const capitalize = (text: string) =>
  text.slice(0, 1).toUpperCase() + text.slice(1);

/** The lines that say when and where, the same in both bodies. */
function details(event: EventMeta, seated: boolean): string[] {
  const when = `${capitalize(longDate(event.start))}, ${clock(event.start)} a ${clock(event.end)} (hora de Lima)`;
  const where =
    event.place.kind === "online" && seated
      ? `${placeLine(event)}. El enlace para unirte está en tu entrada.`
      : placeLine(event);
  return [when, where];
}

/** The email for a ticket's holder, in plain text and HTML. */
export function ticketMail(
  kind: MailKind,
  event: EventMeta,
  ticket: Pick<Ticket, "token" | "name" | "email" | "status">,
  site: string,
): Mail {
  const { subject, lead } = copy[kind];
  const url = `${site}/entrada/${ticket.token}`;
  const greeting = `Hola, ${ticket.name.split(/\s+/)[0]}:`;
  const lines = details(event, ticket.status === "going");
  const footer =
    "¿Ya no puedes ir? Cancela desde tu entrada y tu cupo pasa a otra persona.";

  const text = [
    greeting,
    lead,
    event.title,
    ...lines,
    `Tu entrada: ${url}`,
    footer,
  ].join("\n\n");

  const p = (body: string, style = "") =>
    `<p style="margin:0 0 16px;${style}">${body}</p>`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px 16px;background:#f4f5f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.5;color:#131517">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
${p(escape(greeting))}
${p(escape(lead))}
${p(escape(event.title), "font-size:20px;font-weight:600;line-height:1.3")}
${lines.map((line) => p(escape(line), "color:#5f6164")).join("\n")}
<p style="margin:24px 0"><a href="${escape(url)}" style="display:inline-block;background:#131517;color:#ffffff;text-decoration:none;font-weight:500;padding:10px 20px;border-radius:8px">Ver mi entrada</a></p>
${p(escape(footer), "margin:0;font-size:14px;color:#5f6164")}
</div>
</body></html>`;

  return {
    to: ticket.email,
    subject: `${subject}: ${event.title}`,
    html,
    text,
  };
}

/**
 * Sends one email. A failure is logged and returns false: an email is never
 * worth failing the request that caused it. Without the binding, as in tests
 * and plain local dev, nothing is sent.
 */
export async function sendMail(
  binding: SendEmail | undefined,
  mail: Mail,
): Promise<boolean> {
  if (!binding) return false;
  try {
    await binding.send({ from, replyTo, ...mail });
    return true;
  } catch (error) {
    console.error("email to a ticket holder failed", error);
    return false;
  }
}

/** Mails each ticket's holder; returns the tokens whose email went out. */
export async function mailTickets(
  env: { DB: D1Database; EMAIL?: SendEmail; SITE_URL: string },
  kind: MailKind,
  event: EventMeta,
  tokens: string[],
): Promise<string[]> {
  const site = env.SITE_URL.replace(/\/$/, "");
  const sent: string[] = [];
  for (const token of tokens) {
    const ticket = await findTicket(env.DB, token);
    if (!ticket) continue;
    const mail = ticketMail(kind, event, ticket, site);
    if (await sendMail(env.EMAIL, mail)) sent.push(token);
  }
  return sent;
}
