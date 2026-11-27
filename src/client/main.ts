import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/geist-pixel/latin-400.css";
import "@fontsource/instrument-serif/latin-400.css";
import "./global.css";
import "../pages/Layout.css";
import "../pages/Brand.css";
import "../pages/Home.css";
import "../pages/EventCard.css";
import "../pages/Going.css";
import "../pages/Event.css";
import "../pages/Ticket.css";
import "../pages/Profile.css";
import "../pages/Certificate.css";
import "../pages/FormFields.css";
import "../pages/Account.css";
import "./scheme";
import { showTurnstile } from "./turnstile";

// Every page but registration works without this script. It stops a double
// submit, confirms a cancellation, copies the ticket link, prints a
// certificate, marks a scrolled
// nav, closes the admin's menu, runs the scheme toggle, renders the register
// form's Turnstile, draws a venue's map, hangs a ticket's credential, and
// runs the event editor's color chips and cover drop.

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

// three.js is the credential's whole weight, so it loads only where a ticket
// has a seat, WebGL runs and motion is welcome.
const credential = document.querySelector<HTMLElement>(".credential");
if (
  credential &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches &&
  document.createElement("canvas").getContext("webgl2")
)
  void import("./credential").then((m) => m.showCredential(credential));

const editor = document.querySelector<HTMLFormElement>("form.editor");
if (editor)
  void import("./editor").then((m) => {
    const chips = editor.querySelector<HTMLElement>(".accent-picker");
    const cover = editor.querySelector<HTMLElement>(".cover-drop");
    if (chips) m.showAccentChips(chips);
    if (cover) m.showCoverDrop(cover);
    m.showPreview(editor);
    m.followStart(editor);
  });

const place = document.querySelector<HTMLElement>(".place-picker");
if (place) void import("./picker").then((m) => m.showPicker(place));

const signup = document.querySelector<HTMLDetailsElement>("#register");
if (signup) {
  // Turnstile loads only once a visitor opens the form.
  const human = signup.querySelector<HTMLElement>(".turnstile");
  if (human && signup.open) showTurnstile(human);
  // A link to #register, as the home spotlight's, arrives with it open.
  if (location.hash === "#register") signup.open = true;
  signup.addEventListener("toggle", () => {
    if (!signup.open) return;
    if (human) showTurnstile(human);
    if (!signup.querySelector("[aria-invalid]"))
      signup.querySelector<HTMLInputElement>("input")?.focus();
  });
}

for (const human of document.querySelectorAll<HTMLElement>(".turnstile"))
  if (!human.closest("#register")) showTurnstile(human);

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

const menu = document.querySelector<HTMLDetailsElement>(".admin-menu");
if (menu) {
  // A <details> only closes from its summary; a menu closes on any click
  // outside it and on Escape.
  addEventListener("click", (event) => {
    if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
  });
  addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary")?.focus();
  });
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
  "[data-print]",
)) {
  button.hidden = false;
  button.addEventListener("click", () => print());
}

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
