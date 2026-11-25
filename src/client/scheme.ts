// The color scheme: a stored choice, else the system setting. The head script
// in src/pages/Layout.tsx applies it before paint; this module applies it
// again when the toggle or the system setting changes.

type Choice = "light" | "dark";

const key = "theme";
const system = matchMedia("(prefers-color-scheme: dark)");
const toggles = document.querySelectorAll<HTMLButtonElement>(".theme-toggle");

function stored(): Choice | null {
  try {
    const value = localStorage.getItem(key);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function store(choice: Choice | null) {
  try {
    if (choice) localStorage.setItem(key, choice);
    else localStorage.removeItem(key);
  } catch {
    // Without storage the choice lasts until the page changes.
  }
}

function apply(choice: Choice | null) {
  const dark = choice ? choice === "dark" : system.matches;
  document.documentElement.classList.toggle("dark", dark);
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    "meta[name=theme-color]",
  )) {
    const scheme = meta.dataset.scheme;
    meta.media = choice
      ? scheme === choice
        ? "all"
        : "not all"
      : `(prefers-color-scheme: ${scheme})`;
  }
  // A labeled toggle names the scheme it switches to, so only the icon
  // toggle carries a pressed state.
  for (const toggle of toggles) {
    if (toggle.hasAttribute("aria-pressed"))
      toggle.setAttribute("aria-pressed", String(dark));
  }
}

/** Flips the scheme. A choice that matches the system is forgotten, so the
    page follows the system again. */
function flip() {
  const next: Choice = document.documentElement.classList.contains("dark")
    ? "light"
    : "dark";
  const choice = (next === "dark") === system.matches ? null : next;
  store(choice);
  apply(choice);
}

for (const toggle of toggles) {
  toggle.hidden = false;
  toggle.addEventListener("click", flip);
}
apply(stored());
system.addEventListener("change", () => apply(stored()));
