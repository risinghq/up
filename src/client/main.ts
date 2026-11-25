import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/geist-pixel/latin-400.css";
import "@fontsource/instrument-serif/latin-400.css";
import "./styles.css";
import "./admin.css";
import "./scheme";

// Every page works without this script. It only stops a double submit,
// confirms a cancellation, copies the ticket link, marks a scrolled nav, runs
// the scheme toggle and draws a venue's map.

// MapLibre is most of the script's weight, so it loads only when the venue's
// map nears the viewport.
const venue = document.querySelector<HTMLElement>(".venue-map");
if (venue) {
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      near.disconnect();
      void import("./map").then((m) => m.showMap(venue));
    },
    { rootMargin: "400px" },
  );
  near.observe(venue);
}

const signup = document.querySelector<HTMLDetailsElement>("#inscripcion");
if (signup) {
  // A link to #inscripcion, as the home spotlight's, arrives with it open.
  if (location.hash === "#inscripcion") signup.open = true;
  signup.addEventListener("toggle", () => {
    if (signup.open && !signup.querySelector("[aria-invalid]"))
      signup.querySelector<HTMLInputElement>("input")?.focus();
  });
}

const nav = document.querySelector<HTMLElement>(".site-nav.sticky");
if (nav) {
  // Luma shows the divider past 1.5 root font sizes of scroll.
  const mark = () => {
    const root = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    nav.toggleAttribute("data-scrolled", scrollY > 1.5 * root);
  };
  mark();
  addEventListener("scroll", mark, { passive: true });
}

for (const form of document.querySelectorAll<HTMLFormElement>("form")) {
  form.addEventListener("submit", (event) => {
    const question = form.dataset.confirm;
    if (question && !confirm(question)) {
      event.preventDefault();
      return;
    }
    for (const button of form.querySelectorAll<HTMLButtonElement>(
      "button[type=submit]",
    )) {
      button.disabled = true;
    }
  });
}

// A page restored from the back/forward cache keeps its disabled buttons.
addEventListener("pageshow", () => {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "button[type=submit]",
  )) {
    button.disabled = false;
  }
});

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-copy]",
)) {
  if (!navigator.clipboard) continue;
  button.hidden = false;
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(button.dataset.copy ?? "");
    button.textContent = "Copiado";
  });
}
