import type { Context } from "hono";
import type { ComponentChildren } from "preact";
import { renderToString } from "preact-render-to-string";
import type { AdminShell } from "../pages/admin/Shell";
import { Layout, type Community, type Head } from "../pages/Layout";
import { NotFound } from "../pages/NotFound";
import type { Account } from "./accounts";
import type { WhatsAppEnv } from "./whatsapp";

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Event covers, served at /media/<key>. */
  MEDIA: R2Bucket;
  /** Origin used in link previews, calendar entries, ticket links and passkeys. */
  SITE_URL: string;
  WHATSAPP_COMMUNITY_URL: string;
  INSTAGRAM_URL: string;
  /** The OAuth client that links Google Calendar. Without both, the admin hides it. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** The Turnstile widget on the register form. Without both, as in tests, no check runs. */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Cloudflare Email Service. Without it, as in tests, no email is sent. */
  EMAIL?: SendEmail;
} & WhatsAppEnv;

export type AppEnv = {
  Bindings: Env;
  Variables: {
    /** The person whose session cookie came with the request, or null. */
    account: Account | null;
    /** The same person when they are an admin, or null. */
    admin: Account | null;
    /** The slug of the event whose door the request's door cookie opens, or null. */
    door: string | null;
  };
};

export type Ctx = Context<AppEnv>;

export const description =
  "Eventos de rising.sh en Lima: mini hackathons, talleres y charlas. Inscríbete y únete a la comunidad.";

export const site = (c: Ctx) => c.env.SITE_URL.replace(/\/$/, "");

/** The Turnstile keys, when both are set. */
export function humanCheck(c: Ctx) {
  const siteKey = c.env.TURNSTILE_SITE_KEY;
  const secret = c.env.TURNSTILE_SECRET_KEY;
  return siteKey && secret ? { siteKey, secret } : null;
}

/**
 * Finishes `work` after the response is sent. A request without an execution
 * context, as in tests, waits for it instead.
 */
export async function after(c: Ctx, work: Promise<unknown>): Promise<void> {
  let ctx: Pick<ExecutionContext, "waitUntil"> | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    // Hono throws when the request came without a context.
  }
  if (ctx) ctx.waitUntil(work);
  else await work;
}

const community = (c: Ctx): Community => ({
  whatsapp: c.env.WHATSAPP_COMMUNITY_URL,
  instagram: c.env.INSTAGRAM_URL,
});

export type PageOptions = {
  /** Loads the passkey script. */
  passkeys?: boolean;
  /** Renders the admin header in place of the public one. */
  shell?: AdminShell;
};

/** Renders a page inside the layout. */
export function page(
  c: Ctx,
  head: Head,
  body: ComponentChildren,
  status = 200,
  options: PageOptions = {},
) {
  const html = renderToString(
    <Layout
      head={head}
      community={community(c)}
      admin={Boolean(c.get("admin"))}
      signedIn={Boolean(c.get("account"))}
      passkeys={options.passkeys ?? false}
      shell={options.shell}
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
