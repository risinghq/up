import { Hono } from "hono";
import type { AppEnv } from "../web";

/**
 * Spanish paths that left the site in sent emails, shared links and the
 * Google consent screen. Each moves permanently to its English path.
 */
export function legacyRoutes() {
  const routes = new Hono<AppEnv>();

  routes.get("/entrada/:token", (c) =>
    c.redirect(`/ticket/${c.req.param("token")}`, 301),
  );

  routes.get("/privacidad", (c) => c.redirect("/privacy", 301));

  routes.get("/:slug/voy/:rest", (c) =>
    c.redirect(`/${c.req.param("slug")}/going/${c.req.param("rest")}`, 301),
  );

  return routes;
}
