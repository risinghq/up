import { placeLine } from "../../worker/calendar";
import { coverUrl, kindLabel, type EventMeta } from "../../worker/events";
import { clock, longDate } from "../../worker/time";
import { themeClass, themeStyle } from "../theme";

export type Period = "proximos" | "pasados";

export type HostEvent = { event: EventMeta; going: number };

/** The event's state as a host reads it. */
export function StatusPill({ event }: { event: EventMeta }) {
  return event.status === "draft" ? (
    <span class="pill pill-draft">Borrador</span>
  ) : (
    <span class="pill pill-live">Publicado</span>
  );
}

function HostRow({ event, going }: HostEvent) {
  const cover = coverUrl(event);
  return (
    <li
      class={`host-row tint ${themeClass(event.theme)}`}
      style={themeStyle(event.theme)}
    >
      <a href={`/admin/eventos/${event.slug}`}>
        <div class="host-row-text">
          <p class="host-row-time">
            <span class="kind-dot" aria-hidden="true" />
            {clock(event.start)} · {kindLabel[event.theme.kind]}
          </p>
          <h3>{event.title}</h3>
          <p class="host-row-place">{placeLine(event)}</p>
          <p class="host-row-tags">
            <StatusPill event={event} />
            {event.featured && <span class="pill">Destacado</span>}
            <span class="host-row-going">
              {going}
              {event.capacity !== undefined && ` / ${event.capacity}`} con cupo
            </span>
          </p>
          <span class="button button-light button-small">Gestionar evento</span>
        </div>
        <div class="host-row-cover" aria-hidden="true">
          {cover ? (
            <img src={cover} alt="" width={1080} height={1080} />
          ) : (
            <span class="host-row-blank" />
          )}
        </div>
      </a>
    </li>
  );
}

/** Events grouped by their Lima day, in the order given. */
function byDay(events: HostEvent[]) {
  const days: { day: string; events: HostEvent[] }[] = [];
  for (const item of events) {
    const day = longDate(item.event.start);
    const last = days.at(-1);
    if (last?.day === day) last.events.push(item);
    else days.push({ day, events: [item] });
  }
  return days;
}

export function Events(props: {
  period: Period;
  events: HostEvent[];
  counts: Record<Period, number>;
}) {
  const days = byDay(props.events);
  return (
    <div class="admin">
      <div class="admin-head">
        <h1>Eventos</h1>
        <nav class="tabs" aria-label="Periodo">
          <a
            href="/admin"
            aria-current={props.period === "proximos" ? "page" : undefined}
          >
            Próximos <span>{props.counts.proximos}</span>
          </a>
          <a
            href="/admin?periodo=pasados"
            aria-current={props.period === "pasados" ? "page" : undefined}
          >
            Pasados <span>{props.counts.pasados}</span>
          </a>
        </nav>
      </div>
      {days.length ? (
        <ol class="timeline">
          {days.map(({ day, events }) => (
            <li key={day}>
              <h2 class="timeline-day">{day}</h2>
              <ul class="host-rows">
                {events.map((item) => (
                  <HostRow key={item.event.slug} {...item} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <div class="empty-state">
          <p class="empty">
            {props.period === "proximos"
              ? "No hay eventos próximos."
              : "Todavía no hay eventos pasados."}
          </p>
          {props.period === "proximos" && (
            <a class="button" href="/admin/eventos/nuevo">
              Crear evento
            </a>
          )}
        </div>
      )}
    </div>
  );
}
