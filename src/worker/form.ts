import type { EventMeta } from "./events";

export type Registration = {
  name: string;
  email: string;
  phone: string;
  newsOptIn: boolean;
  answers: Record<string, string>;
};

/** What the form shows again after a refused post: the values and one message per field. */
export type FormState = {
  values: Record<string, string>;
  errors: Record<string, string>;
};

export type Parsed =
  | { ok: true; value: Registration }
  | ({ ok: false } & FormState);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Turns what a person typed into E.164. A bare nine-digit number starting
 * with 9 is a Peruvian mobile; anything else needs its country code.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, "");
  if (/^9\d{8}$/.test(digits)) return `+51${digits}`;
  if (/^51 ?9\d{8}$/.test(digits)) return `+${digits}`;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^00\d{8,15}$/.test(digits)) return `+${digits.slice(2)}`;
  return null;
}

export function parseRegistration(form: FormData, event: EventMeta): Parsed {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const name = text("name");
  const email = text("email").toLowerCase();
  const news = form.get("news") ? "on" : "";
  const privacy = form.get("privacy") ? "on" : "";
  const values: Record<string, string> = {
    name,
    email,
    phone: text("phone"),
    news,
    privacy,
  };
  const errors: Record<string, string> = {};

  if (name.length < 2) errors.name = "Escribe tu nombre.";
  else if (name.length > 120) errors.name = "El nombre es demasiado largo.";
  if (!emailPattern.test(email) || email.length > 254)
    errors.email = "Escribe un correo válido.";
  const phone = normalizePhone(text("phone"));
  if (!phone)
    errors.phone = "Escribe un número de WhatsApp, por ejemplo 987 654 321.";
  if (!privacy) errors.privacy = "Necesitamos tu aceptación para inscribirte.";

  const answers: Record<string, string> = {};
  for (const q of event.questions) {
    const answer = text(`q_${q.id}`).slice(0, 500);
    values[`q_${q.id}`] = answer;
    if (q.required && !answer) errors[`q_${q.id}`] = "Responde esta pregunta.";
    else if (q.options && answer && !q.options.includes(answer))
      errors[`q_${q.id}`] = "Elige una de las opciones.";
    if (answer) answers[q.id] = answer;
  }

  if (Object.keys(errors).length || !phone)
    return { ok: false, values, errors };
  return {
    ok: true,
    value: {
      name,
      email,
      phone,
      newsOptIn: news === "on",
      answers,
    },
  };
}
