import { palette, themeClass, themeStyle } from "../pages/theme";
import type { Theme } from "../worker/events";

const accepted = ["image/jpeg", "image/png", "image/webp"];

/** Palette chips set the native color input and mirror its value. */
export function showAccentChips(picker: HTMLElement) {
  const input = picker.querySelector<HTMLInputElement>("input[type=color]");
  const value = picker.querySelector("output");
  if (!input) return;

  const chips = [
    ...picker.querySelectorAll<HTMLButtonElement>("[data-accent]"),
  ];

  const mark = () => {
    for (const chip of chips)
      chip.setAttribute(
        "aria-pressed",
        String(chip.dataset.accent === input.value),
      );
    if (value) value.textContent = input.value;
    picker.closest("form")?.style.setProperty("--accent-preview", input.value);
  };

  for (const chip of chips) {
    chip.hidden = false;
    chip.addEventListener("click", () => {
      input.value = chip.dataset.accent ?? input.value;
      mark();
    });
  }

  input.addEventListener("input", mark);
  mark();
}

/** The cover tile takes a dropped image and previews the chosen file. */
export function showCoverDrop(tile: HTMLElement) {
  const input = tile.querySelector<HTMLInputElement>("input[type=file]");
  const img = tile.querySelector("img");
  const name = tile
    .closest(".cover-field")
    ?.querySelector<HTMLElement>(".cover-name");
  if (!input || !img) return;

  const original = img.getAttribute("src");
  let preview: string | undefined;

  const show = () => {
    if (preview) URL.revokeObjectURL(preview);
    preview = undefined;

    const file = input.files?.[0];
    if (file) {
      preview = URL.createObjectURL(file);
      img.src = preview;
    } else if (original) {
      img.src = original;
    }

    const filled = Boolean(file || original);
    img.hidden = !filled;
    tile.toggleAttribute("data-filled", filled);

    if (name) {
      name.textContent = file?.name ?? "";
      name.hidden = !file;
    }
  };

  input.addEventListener("change", show);

  tile.addEventListener("dragover", (event) => {
    event.preventDefault();
    tile.toggleAttribute("data-drag", true);
  });

  for (const type of ["dragleave", "dragend"])
    tile.addEventListener(type, () => tile.removeAttribute("data-drag"));

  tile.addEventListener("drop", (event) => {
    event.preventDefault();
    tile.removeAttribute("data-drag");

    const file = event.dataTransfer?.files[0];
    if (!file || !accepted.includes(file.type)) return;

    const one = new DataTransfer();
    one.items.add(file);
    input.files = one.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const fieldValue = (form: HTMLFormElement, name: string) => {
  const field = form.elements.namedItem(name) as
    | HTMLInputElement
    | RadioNodeList
    | null;
  return field?.value ?? "";
};

/** The look's card repaints from the form on every change. */
export function showPreview(form: HTMLFormElement) {
  const card = form.querySelector<HTMLElement>(".look-card");
  if (!card) return;

  const kind = card.querySelector(".look-kind > span:last-child");
  const title = card.querySelector(".look-title");
  const summary = card.querySelector(".look-summary");
  const image = card.querySelector<HTMLImageElement>(".look-cover img");
  const blank = card.querySelector<HTMLElement>(".look-cover .cover-blank");
  const drop = form.querySelector<HTMLImageElement>(".cover-drop img");

  const paint = () => {
    const chosen = fieldValue(form, "accent");
    const theme = {
      kind: fieldValue(form, "kind"),
      accent: /^#[0-9a-f]{6}$/i.test(chosen) ? chosen : "#2563eb",
      backdrop: fieldValue(form, "backdrop"),
      font: fieldValue(form, "font"),
    } as Theme;
    const tinted = palette(theme.accent) ? " tinted" : "";
    card.className = `look-card tint ${themeClass(theme)}${tinted}`;
    card.style.cssText = themeStyle(theme);

    if (kind)
      kind.textContent =
        form.querySelector("input[name=kind]:checked")?.closest("label")
          ?.textContent ?? "";
    if (title)
      title.textContent =
        fieldValue(form, "title").trim() || "Título del evento";
    if (summary) summary.textContent = fieldValue(form, "summary");

    const removed = form.querySelector("#a-remove-cover:checked");
    const shown = Boolean(drop && !drop.hidden && drop.src && !removed);
    if (image && drop) {
      image.hidden = !shown;
      if (shown) image.src = drop.src;
    }
    if (blank) blank.hidden = shown;
  };

  form.addEventListener("input", paint);
  form.addEventListener("change", paint);
}

/** An end left empty or before a new start moves to two hours after it. */
export function followStart(form: HTMLFormElement) {
  const start = form.elements.namedItem("start") as HTMLInputElement | null;
  const end = form.elements.namedItem("end") as HTMLInputElement | null;
  if (!start || !end) return;

  start.addEventListener("change", () => {
    if (!start.value || (end.value && end.value > start.value)) return;
    const at = new Date(`${start.value}:00Z`);
    if (Number.isNaN(at.getTime())) return;
    at.setUTCHours(at.getUTCHours() + 2);
    end.value = at.toISOString().slice(0, 16);
  });
}
