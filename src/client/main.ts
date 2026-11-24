import "@fontsource-variable/geist";
import "./styles.css";

// Every page works without this script. It only stops a double submit,
// confirms a cancellation and copies the ticket link.

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
