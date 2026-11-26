/** Switches the scheme; src/client/scheme.ts shows it and wires it. The
    labeled form is a full-width row in the admin's phone menu. */
export const SchemeToggle = ({ labeled = false }: { labeled?: boolean }) => (
  <button
    class={labeled ? "theme-toggle theme-toggle-row" : "theme-toggle"}
    type="button"
    aria-label={labeled ? undefined : "Modo oscuro"}
    aria-pressed={labeled ? undefined : "false"}
    hidden
  >
    {labeled && <span class="label-dark">Modo oscuro</span>}
    {labeled && <span class="label-light">Modo claro</span>}
    <svg
      class="icon-moon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
    <svg
      class="icon-sun"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
    </svg>
  </button>
);

export const Mark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      fill-rule="evenodd"
      d="M12 22A7 7 0 0 1 5 15A8 8 0 0 1 8 8A6 6 0 0 0 10 1A15 15 0 0 1 19 15A7 7 0 0 1 12 22ZM9 16a3 3 0 1 0 6 0a3 3 0 1 0-6 0Z"
    />
  </svg>
);

/** "up.rising.sh" set so that it reads as "uprising". */
export const Lockup = () => (
  <span class="lockup">
    <Mark />
    <span class="lockup-up">up</span>
    <span class="lockup-domain">.rising.sh</span>
  </span>
);
