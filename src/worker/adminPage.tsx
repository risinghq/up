import type { ComponentChildren } from "preact";
import type { AdminShell } from "../pages/Layout";
import { findEvent, type EventMeta } from "./events";
import { notFound, page, site, type Ctx } from "./web";

/** An admin page. The header names the signed-in admin and marks `section`. */
export function adminPage(
  c: Ctx,
  title: string,
  body: ComponentChildren,
  options: {
    status?: number;
    passkeys?: boolean;
    section?: AdminShell["section"];
  } = {},
) {
  c.header("Cache-Control", "no-store");
  return page(
    c,
    {
      title,
      description: "Administración de up.",
      url: `${site(c)}${c.req.path}`,
      noindex: true,
    },
    body,
    options.status,
    {
      passkeys: options.passkeys,
      shell: {
        name: c.get("admin")?.name,
        section: options.section ?? "eventos",
      },
    },
  );
}

/** Loads the event in the path or answers 404. */
export const withEvent =
  (handler: (c: Ctx, event: EventMeta) => Promise<Response> | Response) =>
  async (c: Ctx) => {
    const event = await findEvent(c.env.DB, c.req.param("slug") ?? "");
    return event ? handler(c, event) : notFound(c);
  };
