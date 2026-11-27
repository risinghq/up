import { Hono } from "hono";
import { CertificatePage } from "../../pages/Certificate";
import { certificateView } from "../../pages/Certificate.view";
import { findCertificate, issuesCertificates } from "../certificates";
import { findEvent } from "../events";
import { notFound, page, viewContext, type AppEnv, type Deps } from "../web";

/** A certificate's public page, once its event issues them. */
export function certificateRoutes({ now }: Deps) {
  const routes = new Hono<AppEnv>();

  routes.get("/:id", async (c) => {
    const certificate = await findCertificate(c.var.db, c.req.param("id"));
    const event =
      certificate && (await findEvent(c.var.db, certificate.eventSlug));
    if (!certificate || !event || !issuesCertificates(event, now()))
      return notFound(c);

    const view = certificateView(viewContext(c, now()), certificate, event);
    c.header("Cache-Control", "no-store");
    return page(
      c,
      {
        title: `Certificado: ${view.name}`,
        description: `${view.name} ${view.verb} ${event.title}.`,
        url: view.url,
        noindex: true,
        theme: event.theme,
      },
      <CertificatePage {...view} />,
    );
  });

  return routes;
}
