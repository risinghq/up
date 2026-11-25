import type { ComponentChildren } from "preact";
import type { CalendarLink, EventMeta } from "../../worker/events";
import { ArrowIcon, DateRow, PlaceRow } from "../EventCard";
import { StatusPill } from "./Events";

export type ManageTab = "resumen" | "inscritos" | "editar" | "mas";

const tabs: [ManageTab, string, string][] = [
  ["resumen", "Resumen", ""],
  ["inscritos", "Inscritos", "/inscritos"],
  ["editar", "Editar", "/editar"],
  ["mas", "Más", "/mas"],
];

/** The frame of every page of one event: its title, its page link and the tabs. */
export function ManageFrame(props: {
  slug: string;
  title: string;
  tab: ManageTab;
  children: ComponentChildren;
}) {
  const base = `/admin/eventos/${props.slug}`;
  return (
    <div class="admin">
      <div class="manage-head">
        <p class="crumbs">
          <a href="/admin">Eventos</a> ›
        </p>
        <div class="admin-head">
          <h1>{props.title}</h1>
          <a
            class="button button-light button-small"
            href={`/${props.slug}`}
            rel="noopener"
          >
            Página del evento <ArrowIcon />
          </a>
        </div>
        <nav class="manage-tabs" aria-label="Gestionar evento">
          {tabs.map(([tab, label, path]) => (
            <a
              key={tab}
              href={`${base}${path}`}
              aria-current={props.tab === tab ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
      {props.children}
    </div>
  );
}

/** The Google Calendar panel of one event. Absent when the site has no OAuth client. */
export type CalendarPanel = {
  /** The connected Google account's email; absent when none is connected. */
  account?: string;
  link?: CalendarLink;
  notice?: "listo" | "error" | "quitado";
};

export const calendarNotice = {
  listo: "El evento está en Google Calendar.",
  error:
    "Google no respondió bien; el evento en el calendario no cambió. Sincroniza otra vez.",
  quitado: "El evento salió de Google Calendar.",
} as const;

function CalendarCard({
  slug,
  calendar,
}: {
  slug: string;
  calendar: CalendarPanel;
}) {
  const { link, notice } = calendar;
  const action = `/admin/eventos/${slug}/calendario`;
  return (
    <section class="manage-card" aria-labelledby="calendar-title">
      <h2 id="calendar-title">Google Calendar y Meet</h2>
      {notice && (
        <p
          class={`notice${notice === "error" ? " notice-error" : ""}`}
          role={notice === "error" ? "alert" : "status"}
        >
          {calendarNotice[notice]}
        </p>
      )}
      {!calendar.account ? (
        <p>
          <a href="/admin/ajustes">Conecta Google</a> en Ajustes para crear este
          evento en tu calendario con una llamada de Meet.
        </p>
      ) : link ? (
        <>
          <dl class="calendar-links">
            <div>
              <dt>Meet</dt>
              <dd>
                {link.meetUrl ? (
                  <a href={link.meetUrl} rel="noopener">
                    {link.meetUrl.replace(/^https:\/\//, "")}
                  </a>
                ) : (
                  "Google aún prepara la llamada. Sincroniza en un momento."
                )}
              </dd>
            </div>
            <div>
              <dt>Calendario</dt>
              <dd>
                <a href={link.htmlUrl} rel="noopener">
                  Abrir en Google Calendar
                </a>
              </dd>
            </div>
          </dl>
          <p class="hint">
            Guardar el evento actualiza el calendario. Quien tenga cupo ve el
            enlace de Meet en su entrada.
          </p>
          <div class="row">
            <form method="post" action={action}>
              <button class="button button-small button-quiet" type="submit">
                Sincronizar
              </button>
            </form>
            <form
              method="post"
              action={`${action}/quitar`}
              data-confirm="¿Quitar el evento de Google Calendar? La llamada de Meet deja de existir."
            >
              <button class="button button-small button-quiet" type="submit">
                Quitar del calendario
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <p>
            Crea el evento en el calendario de{" "}
            <strong>{calendar.account}</strong> con una llamada de Meet. No se
            invita a nadie: quien tenga cupo ve el enlace en su entrada.
          </p>
          <form method="post" action={action}>
            <button class="button button-small" type="submit">
              Crear en Google Calendar con Meet
            </button>
          </form>
        </>
      )}
    </section>
  );
}

export type Counts = { going: number; waitlist: number; cancelled: number };

export function Overview(props: {
  event: EventMeta;
  url: string;
  counts: Counts;
  created: boolean;
  calendar?: CalendarPanel;
}) {
  const { event, counts } = props;
  const base = `/admin/eventos/${event.slug}`;
  const filled =
    event.capacity && Math.min(100, (counts.going / event.capacity) * 100);
  return (
    <ManageFrame slug={event.slug} title={event.title} tab="resumen">
      {props.created && (
        <p class="notice" role="status">
          Evento creado.{" "}
          {event.status === "draft" &&
            "Está en borrador: publícalo desde Editar cuando esté listo."}
        </p>
      )}
      <div class="manage-grid">
        <section class="manage-card" aria-labelledby="when-title">
          <div class="manage-card-head">
            <h2 id="when-title">Cuándo y dónde</h2>
            <StatusPill event={event} />
          </div>
          <div class="meta">
            <DateRow event={event} />
            <PlaceRow event={event} />
          </div>
          <a class="button button-light button-small" href={`${base}/editar`}>
            Editar evento
          </a>
        </section>

        <section class="manage-card" aria-labelledby="share-title">
          <h2 id="share-title">Compartir</h2>
          <p>
            Envía este enlace por WhatsApp o Instagram para que se inscriban.
          </p>
          <p class="invite-url">
            <code>{props.url}</code>
            <button
              class="button button-small button-quiet"
              type="button"
              data-copy={props.url}
              hidden
            >
              Copiar
            </button>
          </p>
        </section>

        <section class="manage-card" aria-labelledby="guests-title">
          <div class="manage-card-head">
            <h2 id="guests-title">Inscritos</h2>
            <a href={`${base}/inscritos`}>Ver lista</a>
          </div>
          <p class="stat">
            <strong>
              {counts.going}
              {event.capacity !== undefined && <span> / {event.capacity}</span>}
            </strong>{" "}
            con cupo
          </p>
          {filled !== undefined && (
            <div class="meter" aria-hidden="true">
              <span style={{ width: `${filled}%` }} />
            </div>
          )}
          <p class="hint">
            {counts.waitlist} en espera · {counts.cancelled} cancelaron
          </p>
        </section>

        {props.calendar && (
          <CalendarCard slug={event.slug} calendar={props.calendar} />
        )}
      </div>
    </ManageFrame>
  );
}

export function More(props: {
  event: EventMeta;
  registrations: number;
  deleteError?: string;
}) {
  const { event } = props;
  return (
    <ManageFrame slug={event.slug} title={event.title} tab="mas">
      <section class="danger" aria-labelledby="delete-title">
        <h2 id="delete-title">Eliminar evento</h2>
        {props.registrations ? (
          <p>
            Este evento tiene inscripciones, así que no se puede eliminar.
            Déjalo en borrador desde Editar para ocultarlo.
          </p>
        ) : (
          <>
            <p>
              Borra el evento, su portada y su copia en Google Calendar. No se
              puede deshacer.
            </p>
            <form
              method="post"
              action={`/admin/eventos/${event.slug}/eliminar`}
              data-confirm="¿Eliminar este evento? No se puede deshacer."
            >
              <button class="button button-quiet" type="submit">
                Eliminar evento
              </button>
            </form>
          </>
        )}
        {props.deleteError && (
          <p class="error" role="alert">
            {props.deleteError}
          </p>
        )}
      </section>
    </ManageFrame>
  );
}
