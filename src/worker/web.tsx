import type { Context } from "hono";
import type { ComponentChildren } from "preact";
import { renderToString } from "preact-render-to-string";
import { Layout, type Community, type Head } from "../pages/Layout";
import { NotFound } from "../pages/NotFound";
import type { Admin } from "./auth";

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Event covers, served at /media/<key>. */
  MEDIA: R2Bucket;
  /** Origin used in link previews, calendar entries, ticket links and passkeys. */
  SITE_URL: string;
  WHATSAPP_COMMUNITY_URL: string;
  INSTAGRAM_URL: string;
};

export type AppEnv = {
  Bindings: Env;
  /** The admin whose session cookie came with the request, or null. */
  Variables: { admin: Admin | null };
};

export type Ctx = Context<AppEnv>;

export const description =
  "Eventos de rising.sh en Lima: mini hackathons, talleres y charlas. Inscríbete y únete a la comunidad.";

export const site = (c: Ctx) => c.env.SITE_URL.replace(/\/$/, "");

const community = (c: Ctx): Community => ({
  whatsapp: c.env.WHATSAPP_COMMUNITY_URL,
  instagram: c.env.INSTAGRAM_URL,
});

/** Renders a page inside the layout. `passkeys` loads the admin script. */
export function page(
  c: Ctx,
  head: Head,
  body: ComponentChildren,
  status = 200,
  passkeys = false,
) {
  const html = renderToString(
    <Layout
      head={head}
      community={community(c)}
      admin={Boolean(c.get("admin"))}
      passkeys={passkeys}
    >
      {body}
    </Layout>,
  );
  return c.html(`<!doctype html>${html}`, status as 200);
}

export const notFound = (c: Ctx, what: "page" | "ticket" = "page") =>
  page(
    c,
    {
      title: "No encontrado",
      description,
      url: `${site(c)}${c.req.path}`,
      noindex: true,
    },
    <NotFound what={what} />,
    404,
  );
