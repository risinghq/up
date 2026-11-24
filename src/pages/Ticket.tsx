import type { EventMeta } from "../worker/events";
import type { Ticket } from "../worker/registrations";
import { clock, longDate } from "../worker/time";
import { DateTile } from "./EventCard";

export type TicketView = {
  ticket: Ticket;
  event: EventMeta;
  ended: boolean;
  /** True on the redirect right after registering. */
  fresh: boolean;
  ticketUrl: string;
  calendarUrl: string;
  whatsapp: string;
};

const statusText = {
  going: "Tienes un cupo",
  waitlist: "Estás en la lista de espera",
  cancelled: "Cancelaste tu inscripción",
} as const;

export function TicketPage(view: TicketView) {
  const { ticket, event } = view;
  const live = ticket.status !== "cancelled" && !view.ended;
  return (
    <article class="ticket-page">
      {view.fresh && (
        <p class="notice" role="status">
          ¡Listo, {ticket.name.split(" ")[0]}! Guarda este enlace: es tu entrada
          y la única forma de volver a ella.
        </p>
      )}
      <section
        class={`card ticket ticket-${ticket.status}`}
        aria-labelledby="ticket-title"
      >
        <p class="ticket-status">{statusText[ticket.status]}</p>
        <h1 id="ticket-title">
          <a href={`/${event.slug}`}>{event.title}</a>
        </h1>
        <div class="ticket-when">
          <DateTile iso={event.start} />
          <div>
            <p class="fact-title">{longDate(event.start)}</p>
            <p>
              {clock(event.start)} a {clock(event.end)}
            </p>
          </div>
        </div>
        <dl class="ticket-facts">
          <div>
            <dt>Nombre</dt>
            <dd>{ticket.name}</dd>
          </div>
          <div>
            <dt>Entrada</dt>
            <dd>#{ticket.number}</dd>
          </div>
          <div>
            <dt>Lugar</dt>
            <dd>
              {event.place.kind === "venue" ? (
                <>
                  {event.place.mapUrl ? (
                    <a href={event.place.mapUrl}>{event.place.name}</a>
                  ) : (
                    event.place.name
                  )}
                  <br />
                  {event.place.address}
                </>
              ) : (
                `En línea, por ${event.place.platform}`
              )}
            </dd>
          </div>
        </dl>
        {ticket.status === "waitlist" && (
          <p class="ticket-note">
            Si se libera un cupo, pasa a la primera persona en espera. Vuelve a
            este enlace para ver si ya tienes el tuyo.
          </p>
        )}
      </section>

      {live && (
        <section class="ticket-actions" aria-label="Qué hacer ahora">
          <div class="copy-row">
            <input
              class="copy-input"
              readOnly
              value={view.ticketUrl}
              aria-label="Enlace de tu entrada"
            />
            <button
              class="button button-quiet"
              type="button"
              data-copy={view.ticketUrl}
              hidden
            >
              Copiar
            </button>
          </div>
          <div class="row">
            <a class="button button-quiet" href={view.calendarUrl}>
              Agregar a Google Calendar
            </a>
            <a
              class="button button-quiet"
              href={`/${event.slug}/calendario.ics`}
            >
              Descargar .ics
            </a>
            {view.whatsapp && (
              <a class="button" href={view.whatsapp}>
                Únete a la comunidad
              </a>
            )}
          </div>
          <form
            method="post"
            action={`/entrada/${ticket.token}/cancelar`}
            class="cancel"
            data-confirm="¿Seguro que quieres cancelar tu inscripción?"
          >
            <button class="link-button" type="submit">
              Ya no puedo ir: cancelar mi inscripción
            </button>
          </form>
        </section>
      )}

      {ticket.status === "cancelled" && !view.ended && (
        <p class="ticket-note">
          ¿Cambiaste de idea? <a href={`/${event.slug}`}>Inscríbete otra vez</a>
          .
        </p>
      )}
    </article>
  );
}
