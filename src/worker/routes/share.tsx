import { Hono } from "hono";
import { Voy } from "../../pages/Voy";
import { renderCard } from "../card";
import { eventUrl, hasEnded } from "../events";
import { findShare } from "../shares";
import { notFound, page, site, type AppEnv, type Ctx, type Deps } from "../web";
import { visibleEvent } from "./event";

/** A holder's public "voy" page and its preview card. */
export function shareRoutes({ now, card }: Deps) {
  const routes = new Hono<AppEnv>();

  /** A share link's event, when the link is live and the event visible. */
  const sharedEvent = async (c: Ctx, slug: string, shareId: string) => {
    const share = await findShare(c.var.db, shareId);
    const event = share?.eventSlug === slug && (await visibleEvent(c, slug));
    return share && event ? { share, event } : null;
  };

  routes.get("/:slug/voy/:file{[A-Za-z0-9_-]+\\.png}", async (c) => {
    const shareId = c.req.param("file").slice(0, -".png".length);
    const found = await sharedEvent(c, c.req.param("slug"), shareId);
    if (!found || !card) return notFound(c);

    const png = await renderCard(
      card,
      found.share.firstName,
      found.event,
      hasEnded(found.event, now()),
    );
    return c.body(new Uint8Array(png), 200, {
      "Content-Type": "image/png",
      // The title or date may change, so a crawler refetches within the hour.
      "Cache-Control": "public, max-age=3600",
    });
  });

  routes.get("/:slug/voy/:shareId", async (c) => {
    const shareId = c.req.param("shareId");
    const found = await sharedEvent(c, c.req.param("slug"), shareId);
    if (!found) return notFound(c);

    const { share, event } = found;
    const ended = hasEnded(event, now());
    const url = `${eventUrl(site(c), event)}/voy/${shareId}`;
    return page(
      c,
      {
        title: `${share.firstName} ${ended ? "fue a" : "va a"} ${event.title}`,
        description: event.summary,
        url,
        image: card && `${url}.png`,
        noindex: true,
        theme: event.theme,
      },
      <Voy firstName={share.firstName} event={event} ended={ended} />,
    );
  });

  return routes;
}
