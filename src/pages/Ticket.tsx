import { kindLabel, type EventMeta } from "../worker/events";
import type { Ticket } from "../worker/registrations";
import { clock, shortDate } from "../worker/time";
import { DateRow, PlaceRow, VenueCard } from "./EventCard";
import { cardColors } from "./theme";

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
  /** SVG of a QR code of the ticket's link, shown at the venue's door. */
  qr?: string;
  /** True when an admin opens the ticket, as at the door after a scan. */
  door: boolean;
  /** The public "voy" link, once the holder made one. */
  shareUrl?: string;
  /** The holder's public profile, once they opened it. */
  profileUrl?: string;
  /** True when a published event lists the holder as a host. */
  hosts: boolean;
};

const statusText = {
  going: "Tienes un cupo",
  waitlist: "Estás en la lista de espera",
  cancelled: "Cancelaste tu inscripción",
} as const;

const doorText = {
  going: "Tiene cupo",
  waitlist: "Está en lista de espera",
  cancelled: "Canceló su inscripción",
} as const;

function DoorPanel({ ticket }: { ticket: Ticket }) {
  const action = `/admin/entrada/${ticket.token}/ingreso`;
  return (
    <section class="content-card door" aria-labelledby="door-title">
      <h2 class="card-title" id="door-title">
        Puerta
      </h2>
      <p class="door-who">
        #{ticket.number} {ticket.name} · {doorText[ticket.status]}
      </p>
      {ticket.checkedInAt ? (
        <form method="post" action={`${action}/deshacer`} class="door-done">
          <p role="status">Ingresó a las {clock(ticket.checkedInAt)}</p>
          <button class="link-button" type="submit">
            Deshacer
          </button>
        </form>
      ) : (
        ticket.status !== "cancelled" && (
          <form method="post" action={action}>
            <button class="button button-primary button-full" type="submit">
              Registrar ingreso
            </button>
          </form>
        )
      )}
    </section>
  );
}

/**
 * The data the client draws the 3D credential from. It stays hidden, and
 * empty, until the script shows it; the ticket above says the same in text.
 */
function Credential({ ticket, event }: { ticket: Ticket; event: EventMeta }) {
  const colors = cardColors(event.theme);
  return (
    <div
      class="credential"
      hidden
      data-name={ticket.name}
      data-number={ticket.number}
      data-title={event.title}
      data-kind={kindLabel[event.theme.kind]}
      data-date={shortDate(event.start)}
      data-ground={colors.ground}
      data-text={colors.text}
      data-soft={colors.soft}
      data-strap={colors.strap}
    />
  );
}

/** Makes or shows the public link that says the holder is going. */
function SharePanel(props: { token: string; title: string; url?: string }) {
  return (
    <section class="content-card" id="compartir" aria-labelledby="share-title">
      <h2 class="card-title" id="share-title">
        Cuéntale a tus amigos
      </h2>
      {props.url ? (
        <div class="ticket-actions">
          <a
            class="button button-light button-full"
            href={`https://wa.me/?text=${encodeURIComponent(`Voy a ${props.title}: ${props.url}`)}`}
          >
            Compartir por WhatsApp
          </a>
          <button
            class="button button-light button-full"
            type="button"
            data-copy={props.url}
            hidden
          >
            Copiar el enlace
          </button>
        </div>
      ) : (
        <form
          method="post"
          action={`/entrada/${props.token}/compartir`}
          class="ticket-actions"
        >
          <p class="ticket-note">
            Crea un enlace público con tu nombre y el evento. No abre tu
            entrada.
          </p>
          <button class="button button-light button-full" type="submit">
            Compartir que voy
          </button>
        </form>
      )}
    </section>
  );
}

/** Opens, shows or hides the holder's public profile of badges. */
function ProfilePanel(props: {
  token: string;
  url?: string;
  primary: boolean;
  hosts: boolean;
}) {
  const action = `/entrada/${props.token}/perfil`;
  const weight = props.primary ? "button-primary" : "button-light";
  return (
    <section class="content-card" id="perfil" aria-labelledby="profile-title">
      <h2 class="card-title" id="profile-title">
        Tus insignias
      </h2>
      {props.url ? (
        <div class="ticket-actions">
          <a class={`button ${weight} button-full`} href={props.url}>
            Ver mi perfil
          </a>
          <form method="post" action={`${action}/ocultar`} class="cancel">
            <button class="link-button" type="submit">
              Ocultar mi perfil
            </button>
          </form>
        </div>
      ) : (
        <form method="post" action={action} class="ticket-actions">
          <p class="ticket-note">
            {props.hosts
              ? "Crea una página pública con tu nombre, los eventos que organizas y una insignia por cada evento al que entras."
              : "Cada evento al que entras te da una insignia. Crea una página pública con tu nombre y tus insignias."}
          </p>
          <button class={`button ${weight} button-full`} type="submit">
            Crear mi perfil
          </button>
        </form>
      )}
    </section>
  );
}

/**
 * What to do before the event: join the call, save the date, join the
 * community, or give the seat back. Once inside, only the call and the
 * community are left, and the profile is the primary action.
 */
function NextSteps({ view }: { view: TicketView }) {
  const { ticket, event } = view;
  const inside = Boolean(ticket.checkedInAt);
  if (inside && !view.meetUrl && !view.whatsapp) return null;

  const communityWeight =
    view.meetUrl || inside ? "button-light" : "button-primary";
  return (
    <section class="content-card" aria-labelledby="next-title">
      <h2 class="card-title" id="next-title">
        {inside ? "Durante el evento" : "Antes del evento"}
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
        {!inside && (
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
        )}
        {view.whatsapp && (
          <a
            class={`button button-full ${communityWeight}`}
            href={view.whatsapp}
          >
            Únete a la comunidad
          </a>
        )}
        {!inside && (
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
        )}
      </div>
    </section>
  );
}

export function TicketPage(view: TicketView) {
  const { ticket, event } = view;
  const live = ticket.status !== "cancelled" && !view.ended;
  const checkedIn = Boolean(ticket.checkedInAt);

  const next = live && <NextSteps view={view} />;
  const share = live && (
    <SharePanel token={ticket.token} title={event.title} url={view.shareUrl} />
  );
  const profile = (checkedIn || view.profileUrl || view.hosts) && (
    <ProfilePanel
      token={ticket.token}
      url={view.profileUrl}
      primary={checkedIn}
      hosts={view.hosts}
    />
  );

  return (
    <article class="ticket-page">
      {view.door && <DoorPanel ticket={ticket} />}
      {view.fresh && (
        <div class="notice notice-fresh" role="status">
          <p>
            ¡Listo, {ticket.name.split(" ")[0]}! Esta página es tu entrada.
            Guarda su enlace: también te lo enviamos por correo.
          </p>
          <button
            class="button button-light button-small"
            type="button"
            data-copy={view.ticketUrl}
            hidden
          >
            Copiar el enlace
          </button>
        </div>
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
          {ticket.checkedInAt && (
            <p class="ticket-checked">
              Ingresaste a las {clock(ticket.checkedInAt)}
            </p>
          )}
          {live && view.qr && !ticket.checkedInAt && (
            <figure class="ticket-qr">
              {/* The SVG is uqr's output for our own URL; it holds no
                  user text. */}
              <div dangerouslySetInnerHTML={{ __html: view.qr }} />
              <figcaption>Muestra este código en la entrada</figcaption>
            </figure>
          )}
          {ticket.status === "waitlist" && (
            <p class="ticket-note">
              Si se libera un cupo, pasa a la primera persona en espera. Vuelve
              a este enlace para ver si ya tienes el tuyo.
            </p>
          )}
        </div>
      </section>

      {checkedIn ? (
        <>
          {profile}
          {next}
          {share}
        </>
      ) : (
        <>
          {next}
          {live && <VenueCard event={event} />}
          {share}
          {profile}
        </>
      )}

      {ticket.status === "going" && (
        <Credential ticket={ticket} event={event} />
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
