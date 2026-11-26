import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { sessionAccount } from "./auth";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { certificateRoutes } from "./routes/certificate";
import { doorRoutes } from "./routes/door";
import { eventRoutes } from "./routes/event";
import { profileRoutes } from "./routes/profile";
import { shareRoutes } from "./routes/share";
import { signinRoutes } from "./routes/signin";
import { siteRoutes } from "./routes/site";
import { ticketRoutes } from "./routes/ticket";
import { SESSION_COOKIE } from "./session";
import { notFound, type AppEnv, type Deps } from "./web";

export type { Env } from "./web";

export type AppOptions = Partial<Deps>;

export function createApp(options: AppOptions = {}) {
  const deps: Deps = {
    now: options.now ?? (() => new Date()),
    fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    card: options.card,
  };
  const app = new Hono<AppEnv>();

  app.use(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const account = token
      ? await sessionAccount(c.env.DB, token, deps.now().toISOString())
      : null;
    c.set("account", account);
    c.set("admin", account?.admin ? account : null);

    await next();

    c.header("X-Content-Type-Options", "nosniff");
    // A ticket URL is a secret; no page leaks its own path to another site.
    c.header("Referrer-Policy", "strict-origin");
  });

  app.route("/admin", adminRoutes(deps));
  app.route("/puerta", doorRoutes(deps));
  app.route("/", signinRoutes(deps));
  app.route("/", accountRoutes(deps));
  app.route("/", siteRoutes(deps));
  app.route("/entrada", ticketRoutes(deps));
  app.route("/p", profileRoutes());
  app.route("/c", certificateRoutes(deps));
  // Event slugs take any first segment, so these mount last.
  app.route("/", shareRoutes(deps));
  app.route("/", eventRoutes(deps));

  app.notFound((c) => notFound(c));

  return app;
}
