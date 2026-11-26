import type { EventMeta } from "./events";
import { sendMail, ticketMail, type MailKind } from "./mail";
import type { Fetch } from "./web";
import { findTicket } from "./registrations";
import { sendWhatsApp, ticketMessage, type WhatsAppEnv } from "./whatsapp";

export type NotifyEnv = WhatsAppEnv & {
  DB: D1Database;
  EMAIL?: SendEmail;
  SITE_URL: string;
};

/**
 * Tells each ticket's holder by email and WhatsApp; returns the tokens whose
 * email went out. WhatsApp is best effort: its failure is only logged.
 */
export async function notifyTickets(
  env: NotifyEnv,
  fetcher: Fetch,
  kind: MailKind,
  event: EventMeta,
  tokens: string[],
): Promise<string[]> {
  const site = env.SITE_URL.replace(/\/$/, "");
  const emailed: string[] = [];
  for (const token of tokens) {
    const ticket = await findTicket(env.DB, token);
    if (!ticket) continue;
    if (await sendMail(env.EMAIL, ticketMail(kind, event, ticket, site)))
      emailed.push(token);
    if (kind !== "again")
      await sendWhatsApp(env, fetcher, ticketMessage(kind, event, ticket));
  }
  return emailed;
}
