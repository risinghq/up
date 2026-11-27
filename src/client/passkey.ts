import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

// Runs the passkey ceremony behind the sign-in and add-passkey buttons. The
// server stores each challenge and answers with JSON: { redirect } or { error }.

type Answer = { redirect?: string; error?: string };

async function post<T>(path: string, body: unknown): Promise<T & Answer> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer = (await res.json().catch(() => ({}))) as T & Answer;
  if (!res.ok && !answer.error)
    answer.error = "Algo falló. Inténtalo de nuevo.";
  return answer;
}

type Options<O> = { challengeId: string; options: O };

async function signIn(next: string): Promise<Answer> {
  const start = await post<
    Options<Parameters<typeof startAuthentication>[0]["optionsJSON"]>
  >("/sign-in/passkey/options", {});
  if (start.error) return start;

  const response = await startAuthentication({ optionsJSON: start.options });
  return post("/sign-in/passkey", {
    challengeId: start.challengeId,
    response,
    next,
  });
}

async function add(): Promise<Answer> {
  const start = await post<
    Options<Parameters<typeof startRegistration>[0]["optionsJSON"]>
  >("/account/passkeys/options", {});
  if (start.error) return start;

  const response = await startRegistration({ optionsJSON: start.options });
  return post("/account/passkeys", {
    challengeId: start.challengeId,
    response,
  });
}

/** The browser's reason, in words a person can act on. */
function explain(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError")
    return "Cancelaste o se acabó el tiempo. Inténtalo de nuevo.";
  if (name === "InvalidStateError")
    return "Este dispositivo ya tiene una passkey para tu cuenta.";
  return "Tu navegador no pudo usar la passkey.";
}

const status = document.querySelector<HTMLElement>("[data-passkey-status]");
const say = (text: string) => {
  if (status) status.textContent = text;
};

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-passkey]",
)) {
  if (!browserSupportsWebAuthn()) {
    say("Este navegador no admite passkeys. Usa el código por correo.");
    continue;
  }

  button.disabled = false;
  button.addEventListener("click", async () => {
    button.disabled = true;
    say("Esperando tu passkey…");
    try {
      const answer =
        button.dataset.passkey === "add"
          ? await add()
          : await signIn(button.dataset.next ?? "");
      if (answer.redirect) {
        say("Listo.");
        location.assign(answer.redirect);
        return;
      }
      say(answer.error ?? "Algo falló. Inténtalo de nuevo.");
    } catch (error) {
      say(explain(error));
    }
    button.disabled = false;
  });
}
