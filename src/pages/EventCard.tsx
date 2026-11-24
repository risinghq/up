import { placeLine } from "../worker/calendar";
import { coverUrl, kindLabel, type EventMeta } from "../worker/events";
import { clock, longDate, shortDate, tile } from "../worker/time";
import { themeClass, themeStyle } from "./theme";

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
    <li class="event-card" style={themeStyle(event.theme)}>
      <a href={`/${event.slug}`}>
        <DateTile iso={event.start} />
        <div>
          <p class="event-card-meta">
            <span class="kind-dot" aria-hidden="true" />
            {kindLabel[event.theme.kind]} ·{" "}
            <time dateTime={event.start}>{shortDate(event.start)}</time>
            {!past && `, ${clock(event.start)}`}
            {event.status === "draft" && " · Borrador"}
          </p>
          <h3>{event.title}</h3>
          <p class="event-card-summary">{event.summary}</p>
          <p class="event-card-place">{placeLine(event)}</p>
        </div>
      </a>
    </li>
  );
}

/** The featured event at the top of the home page. */
export function Spotlight({ event }: { event: EventMeta }) {
  const cover = coverUrl(event);
  return (
    <section
      class={`spotlight ${themeClass(event.theme)}`}
      style={themeStyle(event.theme)}
      aria-labelledby="spotlight-title"
    >
      <a href={`/${event.slug}`}>
        <div class="spotlight-art" aria-hidden="true">
          {cover ? (
            <img src={cover} alt="" width={1200} height={630} />
          ) : (
            <span>{kindLabel[event.theme.kind]}</span>
          )}
        </div>
        <div class="spotlight-text">
          <p class="kind-chip">Destacado · {kindLabel[event.theme.kind]}</p>
          <h2 id="spotlight-title">{event.title}</h2>
          <p>{event.summary}</p>
          <p class="spotlight-when">
            <time dateTime={event.start}>{longDate(event.start)}</time>,{" "}
            {clock(event.start)} · {placeLine(event)}
          </p>
          <span class="button">Ver e inscribirme</span>
        </div>
      </a>
    </section>
  );
}
