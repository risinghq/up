import { Fragment } from "preact";
import { kindLabel, type EventMeta } from "../worker/events";
import type { Ticket } from "../worker/registrations";
import { clock, shortDate } from "../worker/time";
import type { Standing, TicketView } from "../worker/views";
import { DateRow, PlaceRow, VenueCard } from "./EventCard";
import { cardColors } from "./theme";

const standingText: Record<Standing, string> = {
  going: "Tienes un cupo",
  waitlist: "Estás en la lista de espera",
  cancelled: "Cancelaste tu inscripción",
  attended: "Asististe",
  missed: "El evento terminó",
};

const doorText = {
  going: "Tiene cupo",
  waitlist: "Está en lista de espera",
  cancelled: "Canceló su inscripción",
} as const;

function DoorPanel({ ticket }: { ticket: Ticket }) {
  const action = `/puerta/${ticket.eventSlug}/ingreso/${ticket.token}`;
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

function CertificatePanel({ url }: { url: string }) {
  return (
    <section class="content-card" aria-labelledby="certificate-title">
      <h2 class="card-title" id="certificate-title">
        Tu certificado
      </h2>
      <div class="ticket-actions">
        <p class="ticket-note">
          Gracias por venir. Tu certificado tiene un enlace propio: compártelo o
          guárdalo como PDF.
        </p>
        <a class="button button-primary button-full" href={url}>
          Ver mi certificado
        </a>
      </div>
    </section>
  );
}

/** Opens, shows or hides the holder's public profile of badges. */
function ProfilePanel(props: {
  token: string;
  url?: string;
  primary: boolean;
  hasRole: boolean;
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
            {props.hasRole
              ? "Crea una página pública con tu nombre, los eventos en los que participas y una insignia por cada evento al que entras."
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
 * community are left.
 */
function NextSteps(props: {
  token: string;
  slug: string;
  next: TicketView["next"];
}) {
  const { next } = props;
  const communityWeight = next.communityPrimary
    ? "button-primary"
    : "button-light";
  return (
    <section class="content-card" aria-labelledby="next-title">
      <h2 class="card-title" id="next-title">
        {next.inside ? "Durante el evento" : "Antes del evento"}
      </h2>
      <div class="ticket-actions">
        {next.meetUrl && (
          <a
            class="button button-primary button-full"
            href={next.meetUrl}
            rel="noopener"
          >
            Entrar a la llamada en Google Meet
          </a>
        )}
        {!next.inside && (
          <div class="row">
            <a
              class="button button-light button-small button-round"
              href={next.calendarUrl}
            >
              Agregar a Google Calendar
            </a>
            <a
              class="button button-light button-small button-round"
              href={`/${props.slug}/calendario.ics`}
            >
              Descargar .ics
            </a>
          </div>
        )}
        {next.whatsapp && (
          <a
            class={`button button-full ${communityWeight}`}
            href={next.whatsapp}
          >
            Únete a la comunidad
          </a>
        )}
        {!next.inside && (
          <form
            method="post"
            action={`/entrada/${props.token}/cancelar`}
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

  const panels = {
    certificate: view.certificateUrl && (
      <CertificatePanel url={view.certificateUrl} />
    ),
    next: <NextSteps token={ticket.token} slug={event.slug} next={view.next} />,
    venue: <VenueCard event={event} />,
    share: (
      <SharePanel
        token={ticket.token}
        title={event.title}
        url={view.shareUrl}
      />
    ),
    profile: <ProfilePanel token={ticket.token} {...view.profile} />,
  };

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
        class={`register ticket ticket-${view.standing}`}
        aria-labelledby="ticket-title"
      >
        <p class="register-header ticket-status">
          <span class="status-dot" aria-hidden="true" />
          {standingText[view.standing]}
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
          {view.qr && (
            <figure class="ticket-qr">
              {/* The SVG is uqr's output for our own URL; it holds no
                  user text. */}
              <div dangerouslySetInnerHTML={{ __html: view.qr }} />
              <figcaption>Muestra este código en la entrada</figcaption>
            </figure>
          )}
          {view.standing === "waitlist" && (
            <p class="ticket-note">
              Si se libera un cupo, pasa a la primera persona en espera. Vuelve
              a este enlace para ver si ya tienes el tuyo.
            </p>
          )}
        </div>
      </section>

      {view.panels.map((panel) => (
        <Fragment key={panel}>{panels[panel]}</Fragment>
      ))}

      {view.credential && <Credential ticket={ticket} event={event} />}

      {view.rejoin && (
        <p class="ticket-note">
          ¿Cambiaste de idea? <a href={`/${event.slug}`}>Inscríbete otra vez</a>
          .
        </p>
      )}
    </article>
  );
}
