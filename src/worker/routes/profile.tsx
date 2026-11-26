import { Hono } from "hono";
import { ProfilePage } from "../../pages/Profile";
import { profileView } from "../../pages/Profile.view";
import { listEvents } from "../events";
import { findProfile } from "../profiles";
import { notFound, page, site, type AppEnv } from "../web";

/** A person's public profile. */
export function profileRoutes() {
  const routes = new Hono<AppEnv>();

  routes.get("/:profileId", async (c) => {
    const profileId = c.req.param("profileId");
    const profile = await findProfile(c.env.DB, profileId);
    if (!profile) return notFound(c);

    const view = profileView(profile, await listEvents(c.env.DB));
    c.header("Cache-Control", "no-store");
    return page(
      c,
      {
        title: `${view.firstName} en up.rising.sh`,
        description: view.description,
        url: `${site(c)}/p/${profileId}`,
        noindex: true,
      },
      <ProfilePage {...view} />,
    );
  });

  return routes;
}
