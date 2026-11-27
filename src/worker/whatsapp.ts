import type { EventMeta } from "./events";
import { details, type MailKind } from "./mail";
import type { Fetch } from "./web";
import type { Ticket } from "./registrations";

const GRAPH = "https://graph.facebook.com/v25.0";

/** A repeat registration's link goes only to the email, never to the phone. */
export type MessageKind = Exclude<MailKind, "again">;

/**
 * The utility templates as they are submitted to Meta, in Spanish (`es`).
 * {{1}} is the first name, {{2}} the event, {{3}} when and {{4}} where. Each
 * has one URL button, "Ver mi entrada", to `<SITE_URL>/ticket/{{1}}`, whose
 * parameter is the ticket token.
 */
export const templates: Record<MessageKind, { name: string; body: string }> = {
  going: {
    name: "up_going",
    body: "Hola, {{1}}. Tu cupo en {{2}} está confirmado.\n\n{{3}}\n{{4}}\n\n¿Ya no puedes ir? Cancela desde tu entrada y tu cupo pasa a otra persona.",
  },
  waitlist: {
    name: "up_waitlist",
    body: "Hola, {{1}}. Los cupos de {{2}} se llenaron y quedaste en la lista de espera. Si alguien cancela, te damos su cupo y te avisamos.\n\n{{3}}\n{{4}}",
  },
  promoted: {
    name: "up_promoted",
    body: "Hola, {{1}}. Se liberó un cupo en {{2}} y ahora es tuyo.\n\n{{3}}\n{{4}}\n\n¿Ya no puedes ir? Cancela desde tu entrada y tu cupo pasa a otra persona.",
  },
  reminder: {
    name: "up_reminder",
    body: "Hola, {{1}}. {{2}} empieza en menos de un día. Te esperamos.\n\n{{3}}\n{{4}}",
  },
};

export type Message = {
  kind: MessageKind;
  /** E.164. */
  to: string;
  params: string[];
  /** The ticket token: the button's parameter. */
  token: string;
};

export function ticketMessage(
  kind: MessageKind,
  event: EventMeta,
  ticket: Pick<Ticket, "token" | "name" | "phone" | "status">,
): Message {
  const [when, where] = details(event, ticket.status === "going");
  return {
    kind,
    to: ticket.phone,
    params: [
      ticket.name.split(/\s+/)[0] ?? ticket.name,
      event.title,
      when,
      where,
    ],
    token: ticket.token,
  };
}

/** The request body of the Cloud API's send-message call. */
export function cloudPayload(message: Message) {
  const text = (value: string) => ({ type: "text", text: value });
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: message.to.replace(/^\+/, ""),
    type: "template",
    template: {
      name: templates[message.kind].name,
      language: { code: "es" },
      components: [
        { type: "body", parameters: message.params.map(text) },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [text(message.token)],
        },
      ],
    },
  };
}

/** The body as the phone shows it. */
export function render(message: Message): string {
  return templates[message.kind].body.replace(
    /\{\{(\d)\}\}/g,
    (_, n: string) => message.params[Number(n) - 1] ?? "",
  );
}

export type WhatsAppEnv = {
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_TOKEN?: string;
};

export type WhatsAppMode = "off" | "mock" | "live";

/** What sendWhatsApp does with this env: send nothing, log, or call Meta. */
export function whatsappMode(env: WhatsAppEnv): WhatsAppMode {
  const id = env.WHATSAPP_PHONE_NUMBER_ID;
  if (id === "mock") return "mock";
  return id && env.WHATSAPP_TOKEN ? "live" : "off";
}

/**
 * Sends one template message. Without a phone number id nothing is sent. The
 * id `mock` logs the message instead, with the phone masked and without the
 * ticket token, which is the holder's only key. A failure is logged and
 * returns false, as with email.
 */
export async function sendWhatsApp(
  env: WhatsAppEnv,
  fetcher: Fetch,
  message: Message,
): Promise<boolean> {
  const id = env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) return false;

  if (id === "mock") {
    const to = `${message.to.slice(0, 3)}…${message.to.slice(-3)}`;
    console.log(
      `whatsapp mock: ${templates[message.kind].name} to ${to}\n${render(message)}`,
    );
    return true;
  }

  if (!env.WHATSAPP_TOKEN) {
    console.error("whatsapp: WHATSAPP_TOKEN is not set");
    return false;
  }

  try {
    const res = await fetcher(`${GRAPH}/${id}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(cloudPayload(message)),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return true;
    console.error(`whatsapp: Cloud API ${res.status}`, await res.text());
    return false;
  } catch (error) {
    console.error("whatsapp: Cloud API unreachable", error);
    return false;
  }
}
