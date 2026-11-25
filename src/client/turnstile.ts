// Cloudflare serves this script and changes it without notice, so it is never
// bundled or proxied.
const SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render(box: HTMLElement, options: Record<string, unknown>): string;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

function load(): Promise<Turnstile> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("turnstile missing"));
    script.onerror = () => reject(new Error("turnstile did not load"));
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Renders the widget into `box` once. The form's submit waits for the token;
 * if the widget fails, it opens again and the server explains the refusal.
 */
export function showTurnstile(box: HTMLElement) {
  if (box.dataset.rendered) return;
  box.dataset.rendered = "true";

  const submit = box
    .closest("form")
    ?.querySelector<HTMLButtonElement>("button[type=submit]");
  const ready = (on: boolean) => {
    if (submit) submit.disabled = !on;
  };
  ready(false);

  load()
    .then((turnstile) =>
      turnstile.render(box, {
        sitekey: box.dataset.sitekey,
        language: "es",
        appearance: "interaction-only",
        size: "flexible",
        theme: document.documentElement.classList.contains("dark")
          ? "dark"
          : "light",
        callback: () => ready(true),
        "expired-callback": () => ready(false),
        "error-callback": () => ready(true),
      }),
    )
    .catch((error: unknown) => {
      console.error(error);
      ready(true);
    });
}
