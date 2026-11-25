import type { ComponentChildren } from "preact";
import type { Theme } from "../worker/events";
import { palette, themeClass, themeStyle } from "./theme";

export type Head = {
  title: string;
  description: string;
  /** Absolute URL of this page. */
  url: string;
  /** Absolute URL of a 1200x630 image. */
  image?: string;
  /** Keeps private pages, such as a ticket, out of search engines. */
  noindex?: boolean;
  /** An event's page takes the event's palette and title font. */
  theme?: Theme;
};

export type Community = { whatsapp: string; instagram: string };

/** The admin header. Without `name` (signed out), it holds the logo only. */
export type AdminShell = {
  name?: string;
  /** The current admin section, marked in the nav. */
  section?: "eventos" | "ajustes";
};

// Vite serves the client entry in dev; the build writes it under fixed names.
const dev = Boolean(import.meta.env?.DEV);

/** The page background of the neutral palette, Luma's brand-10. */
const neutralBg = "#f2f2f2";

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

function SiteHeader(props: {
  community: Community;
  admin: boolean;
  sticky: boolean;
}) {
  const { community } = props;
  return (
    <header class={props.sticky ? "site-nav sticky" : "site-nav"}>
      <a class="site-logo" href="/" aria-label="up.rising.sh, inicio">
        <Lockup />
      </a>
      <nav class="site-links" aria-label="Principal">
        <a class="home-link" href="/">
          Eventos
        </a>
        {props.admin && <a href="/admin">Admin</a>}
        {community.instagram && <a href={community.instagram}>Instagram</a>}
        {community.whatsapp && (
          <a
            class="button button-light button-small button-round"
            href={community.whatsapp}
          >
            Únete por WhatsApp
          </a>
        )}
      </nav>
    </header>
  );
}

function AdminHeader({ shell }: { shell: AdminShell }) {
  const current = (section: AdminShell["section"]) =>
    shell.section === section ? ("page" as const) : undefined;
  return (
    <header class="site-nav sticky admin-nav">
      <a
        class="site-logo"
        href={shell.name ? "/admin" : "/"}
        aria-label="Admin de up.rising.sh"
      >
        <Lockup />
        <span class="admin-badge">admin</span>
      </a>
      {shell.name ? (
        <>
          <nav class="admin-sections" aria-label="Admin">
            <a href="/admin" aria-current={current("eventos")}>
              Eventos
            </a>
            <a href="/admin/ajustes" aria-current={current("ajustes")}>
              Ajustes
            </a>
          </nav>
          <div class="site-links">
            <a href="/">Ver sitio</a>
            <a
              class="button button-light button-small button-round"
              href="/admin/eventos/nuevo"
            >
              Crear evento
            </a>
            <form method="post" action="/admin/salir" class="admin-who">
              <span>{shell.name}</span>
              <button class="link-button" type="submit">
                Salir
              </button>
            </form>
          </div>
        </>
      ) : (
        <nav class="site-links" aria-label="Sitio">
          <a href="/">Volver al sitio</a>
        </nav>
      )}
    </header>
  );
}

export function Layout(props: {
  head: Head;
  community: Community;
  /** A signed-in admin gets a link to the admin on public pages. */
  admin: boolean;
  /** Loads the passkey script for the admin sign-in and invite pages. */
  passkeys: boolean;
  /** An admin page: the admin header and no public footer. */
  shell?: AdminShell;
  children: ComponentChildren;
}) {
  const { head, community } = props;
  const theme = head.theme;
  const title = head.title === "up" ? "up.rising.sh" : `${head.title} · up`;
  const background = (theme && palette(theme.accent)?.brand[10]) ?? neutralBg;
  return (
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={head.description} />
        {head.noindex && <meta name="robots" content="noindex" />}
        <link rel="canonical" href={head.url} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="up.rising.sh" />
        <meta property="og:locale" content="es_PE" />
        <meta property="og:title" content={head.title} />
        <meta property="og:description" content={head.description} />
        <meta property="og:url" content={head.url} />
        {head.image && <meta property="og:image" content={head.image} />}
        <meta
          name="twitter:card"
          content={head.image ? "summary_large_image" : "summary"}
        />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content={background} />
        {dev ? (
          <>
            <script type="module" src="/@vite/client" />
            <script type="module" src="/src/client/main.ts" />
            {props.passkeys && (
              <script type="module" src="/src/client/admin.ts" />
            )}
          </>
        ) : (
          <>
            <link
              rel="preload"
              href="/assets/geist-latin-wght-normal.woff2"
              as="font"
              type="font/woff2"
              crossorigin="anonymous"
            />
            <link rel="stylesheet" href="/assets/client.css" />
            <script type="module" src="/assets/client.js" />
            {props.passkeys && <script type="module" src="/assets/admin.js" />}
          </>
        )}
      </head>
      <body
        class={theme ? `tint ${themeClass(theme)}` : "tint"}
        style={theme ? themeStyle(theme) : undefined}
      >
        <a class="skip" href="#main">
          Saltar al contenido
        </a>
        {props.shell ? (
          <AdminHeader shell={props.shell} />
        ) : (
          <SiteHeader
            community={community}
            admin={props.admin}
            sticky={!theme}
          />
        )}
        <main id="main">{props.children}</main>
        {!props.shell && (
          <footer class="site-footer">
            <div class="site-footer-content">
              <p>
                <a href="/">up.rising.sh</a> es la agenda de eventos de{" "}
                <a href="https://rising.sh">rising.sh</a>.
              </p>
              <nav aria-label="Legal">
                <a href="/privacidad">Privacidad</a>
              </nav>
            </div>
          </footer>
        )}
      </body>
    </html>
  );
}
