import type { ComponentChildren } from "preact";
import type { Theme } from "../worker/events";
import { AdminHeader, type AdminShell } from "./admin/Shell";
import { Lockup, SchemeToggle } from "./Brand";
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

// Vite serves the client entry in dev; the build names it after BUILD_ID.
const dev = Boolean(import.meta.env?.DEV);
const build = import.meta.env?.BUILD_ID ?? "test";
const asset = (file: string, ext: string) => `/assets/${file}-${build}${ext}`;

/**
 * Prerenders a same-site page once a visitor hovers or presses its link, so
 * the page is ready when the click lands. Every GET here only reads; the
 * exclusions are downloads and the Google sign-in hop.
 */
const speculation = JSON.stringify({
  prerender: [
    {
      where: {
        and: [
          { href_matches: "/*" },
          {
            not: {
              href_matches: [
                "/admin/google/*",
                "/media/*",
                "/*.ics",
                "/*.csv",
                "/*.png",
              ],
            },
          },
        ],
      },
      eagerness: "moderate",
    },
  ],
});

/** The neutral page background in each scheme, as global.css sets it. */
const neutralBg = { light: "#f2f2f2", dark: "#141414" };

/**
 * Sets the stored scheme, else the system's, before the first paint, and
 * points theme-color at it. src/client/scheme.ts keeps both in step after
 * load and owns the "theme" storage key.
 */
const schemeScript = `(function(){var s;try{s=localStorage.getItem("theme")}catch(e){}var d=s?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);if(s)document.querySelectorAll("meta[name=theme-color]").forEach(function(m){m.media=m.dataset.scheme===s?"all":"not all"})})()`;

/**
 * Opts every page into cross-document view transitions, so opening an event
 * moves its cover into the event page's cover: Cover names itself after its
 * event, so only the same event's covers pair. Chrome reads the new page's
 * opt-in before the linked stylesheet always applies, and skips the
 * transition when it finds none, so the rule is inline at the top of <head>.
 */
const transitionOptIn =
  "@media (prefers-reduced-motion: no-preference){@view-transition{navigation:auto}}";

function SiteHeader(props: {
  community: Community;
  admin: boolean;
  signedIn: boolean;
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
        {props.signedIn ? (
          <a href="/account">Cuenta</a>
        ) : (
          <a href="/sign-in">Entrar</a>
        )}
        <SchemeToggle />
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

export function Layout(props: {
  head: Head;
  community: Community;
  /** A signed-in admin gets a link to the admin on public pages. */
  admin: boolean;
  /** Shows Cuenta in place of Entrar. */
  signedIn: boolean;
  /** Loads the passkey script for the sign-in and account pages. */
  passkeys: boolean;
  /** An admin page: the admin header and stylesheet, and no public footer. */
  shell?: AdminShell;
  children: ComponentChildren;
}) {
  const { head, community } = props;
  const theme = head.theme;
  const title = head.title === "up" ? "up.rising.sh" : `${head.title} · up`;
  const tint = theme && palette(theme.accent);
  const background = tint
    ? { light: tint.brand[10], dark: tint.brand[80] }
    : neutralBg;
  const bodyClass = theme
    ? `tint ${themeClass(theme)}${tint ? " tinted" : ""}`
    : "tint";
  return (
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: transitionOptIn }} />
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
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          data-scheme="light"
          content={background.light}
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          data-scheme="dark"
          content={background.dark}
        />
        <script dangerouslySetInnerHTML={{ __html: schemeScript }} />
        {dev ? (
          <>
            <script type="module" src="/@vite/client" />
            <script type="module" src="/src/client/main.ts" />
            {props.shell && <script type="module" src="/src/client/admin.ts" />}
            {props.passkeys && (
              <script type="module" src="/src/client/passkey.ts" />
            )}
          </>
        ) : (
          <>
            <link
              rel="preload"
              href={asset("geist-latin-wght-normal", ".woff2")}
              as="font"
              type="font/woff2"
              crossorigin="anonymous"
            />
            <link rel="stylesheet" href={asset("client", ".css")} />
            {props.shell && (
              <link rel="stylesheet" href={asset("admin", ".css")} />
            )}
            <script type="module" src={asset("client", ".js")} />
            {props.passkeys && (
              <script type="module" src={asset("passkey", ".js")} />
            )}
          </>
        )}
        <script
          type="speculationrules"
          dangerouslySetInnerHTML={{ __html: speculation }}
        />
      </head>
      <body class={bodyClass} style={theme ? themeStyle(theme) : undefined}>
        <a class="skip" href="#main">
          Saltar al contenido
        </a>
        {props.shell ? (
          <AdminHeader shell={props.shell} />
        ) : (
          <SiteHeader
            community={community}
            admin={props.admin}
            signedIn={props.signedIn}
            sticky={!theme}
          />
        )}
        <main id="main">{props.children}</main>
        {!props.shell && (
          <footer class="site-footer">
            <div class="site-footer-content">
              <p class="links">
                <a href="/">up.rising.sh</a> es la agenda de eventos de{" "}
                <a href="https://rising.sh">rising.sh</a>.
              </p>
              <nav aria-label="Legal">
                <a href="/privacy">Privacidad</a>
              </nav>
            </div>
          </footer>
        )}
      </body>
    </html>
  );
}
