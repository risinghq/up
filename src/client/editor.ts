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
    picker
      .closest("fieldset")
      ?.style.setProperty("--accent-preview", input.value);
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
    show();
  });
}
