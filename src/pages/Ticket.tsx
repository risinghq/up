import type { EventMeta } from "../worker/events";
import type { Ticket } from "../worker/registrations";
import { DateRow, PlaceRow } from "./EventCard";

export type TicketView = {
  ticket: Ticket;
  event: EventMeta;
  ended: boolean;
  /** True on the redirect right after registering. */
  fresh: boolean;
  ticketUrl: string;
  calendarUrl: string;
  /** The event's Google Meet call; only a ticket with a seat gets it. */
  meetUrl?: string;
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
        class={`register ticket ticket-${ticket.status}`}
        aria-labelledby="ticket-title"
      >
        <p class="register-header ticket-status">
          <span class="status-dot" aria-hidden="true" />
          {statusText[ticket.status]}
        </p>
        <div class="register-content">
          <h1 class="ticket-title" id="ticket-title">
            <a href={`/${event.slug}`}>{event.title}</a>
          </h1>
          <div class="meta">
            <DateRow event={event} />
            <PlaceRow event={event} />
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
          </dl>
          {ticket.status === "waitlist" && (
            <p class="ticket-note">
              Si se libera un cupo, pasa a la primera persona en espera. Vuelve
              a este enlace para ver si ya tienes el tuyo.
            </p>
          )}
        </div>
      </section>

      {live && (
        <section class="content-card" aria-labelledby="next-title">
          <h2 class="card-title" id="next-title">
            Qué hacer ahora
          </h2>
          <div class="ticket-actions">
            {view.meetUrl && (
              <a
                class="button button-primary button-full"
                href={view.meetUrl}
                rel="noopener"
              >
                Entrar a la llamada en Google Meet
              </a>
            )}
            <div class="copy-row">
              <input
                class="copy-input"
                readOnly
                value={view.ticketUrl}
                aria-label="Enlace de tu entrada"
              />
              <button
                class="button button-light"
                type="button"
                data-copy={view.ticketUrl}
                hidden
              >
                Copiar
              </button>
            </div>
            <div class="row">
              <a
                class="button button-light button-small button-round"
                href={view.calendarUrl}
              >
                Agregar a Google Calendar
              </a>
              <a
                class="button button-light button-small button-round"
                href={`/${event.slug}/calendario.ics`}
              >
                Descargar .ics
              </a>
            </div>
            {view.whatsapp && (
              <a
                class={`button button-full ${view.meetUrl ? "button-light" : "button-primary"}`}
                href={view.whatsapp}
              >
                Únete a la comunidad
              </a>
            )}
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
          </div>
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
