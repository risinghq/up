import { Lockup, SchemeToggle } from "../Brand";

/** The admin header. Without `name` (signed out), it holds the logo only. */
export type AdminShell = {
  name: string;
  /** The current admin section, marked in the nav. */
  section?: "events" | "settings";
};

const current = (shell: AdminShell, section: AdminShell["section"]) =>
  shell.section === section ? ("page" as const) : undefined;

/** The account menu, behind the admin's initial. On a phone it also holds the
    sections. A <details> opens it without script. */
function AdminMenu({ shell, name }: { shell: AdminShell; name: string }) {
  return (
    <details class="admin-menu">
      <summary aria-label={`Cuenta de ${name}`}>
        <span class="avatar" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
      </summary>
      <nav aria-label="Cuenta">
        <p class="admin-menu-name">{name}</p>
        <a
          class="admin-narrow"
          href="/admin"
          aria-current={current(shell, "events")}
        >
          Eventos
        </a>
        <a
          class="admin-narrow"
          href="/admin/settings"
          aria-current={current(shell, "settings")}
        >
          Ajustes
        </a>
        <a href="/account">Mi cuenta</a>
        <a href="/">Ver sitio</a>
        <SchemeToggle labeled />
        <form method="post" action="/sign-out">
          <button type="submit">Salir</button>
        </form>
      </nav>
    </details>
  );
}

export function AdminHeader({ shell }: { shell: AdminShell }) {
  return (
    <header class="site-nav sticky admin-nav">
      <a
        class="site-logo"
        href="/admin"
        aria-label="up.rising.sh admin, inicio"
      >
        <Lockup /> <span class="admin-badge">admin</span>
      </a>
      <nav class="admin-sections" aria-label="Admin">
        <a href="/admin" aria-current={current(shell, "events")}>
          Eventos
        </a>
        <a href="/admin/settings" aria-current={current(shell, "settings")}>
          Ajustes
        </a>
      </nav>
      <div class="site-links">
        <a
          class="button button-light button-small button-round"
          href="/admin/events/new"
        >
          Crear<span class="admin-wide"> evento</span>
        </a>
        <AdminMenu shell={shell} name={shell.name} />
      </div>
    </header>
  );
}
