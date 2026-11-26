import { kindLabel } from "../worker/events";
import { Lockup, Mark } from "./Brand";
import type { CertificateView } from "./Certificate.view";

/**
 * A certificate, laid out as one landscape A4 sheet: a band in the event's
 * color and backdrop, then who, what they did, which event, when and where.
 * The printed address lets a reader of the paper check it here.
 */
export function CertificatePage(view: CertificateView) {
  const { event } = view;
  const address = view.url.replace(/^https?:\/\//, "");

  return (
    <article class="certificate-page">
      <section class="certificate" aria-labelledby="certificate-name">
        <div class="certificate-band" aria-hidden="true">
          <Mark />
        </div>
        <div class="certificate-body">
          <p class="certificate-kicker">
            Certificado · {kindLabel[event.theme.kind]}
          </p>
          <h1 class="certificate-name" id="certificate-name">
            {view.name}
          </h1>
          <p class="certificate-verb">{view.verb}</p>
          <p class="certificate-event">
            <a href={`/${event.slug}`}>{event.title}</a>
          </p>
          <p class="certificate-when">
            {view.date} · {view.place}
          </p>
          <footer class="certificate-foot">
            <Lockup />
            <span>
              Verifica este certificado en <a href={view.url}>{address}</a>
            </span>
          </footer>
        </div>
      </section>

      <p class="certificate-actions">
        <button class="button button-primary" type="button" data-print hidden>
          Imprimir o guardar PDF
        </button>
      </p>
    </article>
  );
}
