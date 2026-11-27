import { Hono } from "hono";
import { Home, type Tab } from "../../pages/Home";
import { Privacy } from "../../pages/Privacy";
import { hasEnded, listEvents } from "../events";
import {
  description,
  notFound,
  page,
  site,
  type AppEnv,
  type Deps,
} from "../web";

/** The home page, the privacy page and the covers. */
export function siteRoutes({ now }: Deps) {
  const routes = new Hono<AppEnv>();

  routes.get("/", async (c) => {
    const tab: Tab = c.req.query("period") === "past" ? "past" : "upcoming";
    const admin = Boolean(c.get("admin"));
    const all = (await listEvents(c.var.db)).filter(
      (e) => admin || e.status === "published",
    );
    if (admin) c.header("Cache-Control", "no-store");

    const ended = (e: (typeof all)[number]) => hasEnded(e, now());
    const upcoming = all.filter((e) => !ended(e));
    const past = all.filter(ended).reverse();
    return page(
      c,
      { title: "up", description, url: `${site(c)}/` },
      <Home
        upcoming={upcoming}
        past={past}
        tab={tab}
        community={{
          whatsapp: c.env.WHATSAPP_COMMUNITY_URL,
          instagram: c.env.INSTAGRAM_URL,
        }}
      />,
    );
  });

  routes.get("/privacy", (c) =>
    page(
      c,
      {
        title: "Privacidad",
        description: "Qué datos pide up.rising.sh y para qué.",
        url: `${site(c)}/privacy`,
      },
      <Privacy />,
    ),
  );

  // Cover keys carry a random part and never change content, so a browser
  // may keep one for a year.
  routes.get("/media/:key{.+}", async (c) => {
    const object = await c.env.MEDIA.get(c.req.param("key"));
    if (!object) return notFound(c);

    return c.body(object.body, 200, {
      "Content-Type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: object.httpEtag,
    });
  });

  return routes;
}
