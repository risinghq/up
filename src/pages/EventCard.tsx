import type { EventMeta } from "../events/types";
import { placeLine } from "../worker/calendar";
import { clock, shortDate, tile } from "../worker/time";

export function DateTile({ iso }: { iso: string }) {
  const t = tile(iso);
  return (
    <span class="date-tile" aria-hidden="true">
      <span>{t.month}</span>
      <span>{t.day}</span>
    </span>
  );
}

export function EventCard({
  event,
  past,
}: {
  event: EventMeta;
  past: boolean;
}) {
  return (
    <li class="event-card">
      <a href={`/${event.slug}`}>
        <DateTile iso={event.start} />
        <div>
          <p class="event-card-meta">
            {past ? "Pasado" : "Próximo"} ·{" "}
            <time dateTime={event.start}>{shortDate(event.start)}</time>
            {!past && `, ${clock(event.start)}`}
          </p>
          <h3>{event.title}</h3>
          <p class="event-card-summary">{event.summary}</p>
          <p class="event-card-place">{placeLine(event)}</p>
        </div>
      </a>
    </li>
  );
}
