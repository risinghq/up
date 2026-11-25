import type { EventMeta } from "./events";
import { parseRegistration, type FormState } from "./form";
import type { Fetch } from "./google";
import { claimResend, register } from "./registrations";
import { TOKEN_FIELD, verifyHuman } from "./turnstile";

export type SignupDeps = {
  db: D1Database;
  fetch: Fetch;
  now: Date;
  /** The Turnstile secret; without it no check runs. */
  turnstileSecret: string | null;
};

/**
 * What a register post came to. `notify` names the message the holder is
 * owed, or null when none is: a repeat inside the resend cooldown.
 */
export type SignupOutcome =
  | { kind: "trapped" }
  | { kind: "refused"; form: FormState }
  | { kind: "created"; token: string; notify: "going" | "waitlist" }
  | { kind: "exists"; token: string; notify: "again" | null };

const humanErrors = {
  missing:
    "No pudimos confirmar que eres una persona. Activa JavaScript o recarga la página.",
  refused: "No pudimos confirmar que eres una persona. Inténtalo otra vez.",
};

/** Takes a register form through the bot checks to a stored registration. */
export async function signUp(
  deps: SignupDeps,
  event: EventMeta,
  form: FormData,
  ip: string | null,
): Promise<SignupOutcome> {
  // A person never sees the trap field; a bot that fills it gets the page back.
  if (String(form.get("website") ?? "")) return { kind: "trapped" };

  const parsed = parseRegistration(form, event);
  if (!parsed.ok) return { kind: "refused", form: parsed };

  if (deps.turnstileSecret) {
    const verdict = await verifyHuman(
      deps.fetch,
      deps.turnstileSecret,
      String(form.get(TOKEN_FIELD) ?? ""),
      ip,
    );
    if (verdict !== "human")
      return {
        kind: "refused",
        form: {
          values: parsed.values,
          errors: { human: humanErrors[verdict] },
        },
      };
  }

  const result = await register(
    deps.db,
    event,
    parsed.value,
    deps.now.toISOString(),
  );
  if (result.kind === "created")
    return { kind: "created", token: result.token, notify: result.status };

  const resend = await claimResend(deps.db, result.token, deps.now);
  return {
    kind: "exists",
    token: result.token,
    notify: resend ? "again" : null,
  };
}
