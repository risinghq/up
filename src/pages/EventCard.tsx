import { placeLine } from "../worker/calendar";
import { coverUrl, kindTag, mapLink, type EventMeta } from "../worker/events";
import { clock, longDate, shortDate, tile } from "../worker/time";
import { Mark } from "./Layout";
import { palette, themeClass, themeStyle } from "./theme";

/** The month over the day, in a square tile. */
export function DateTile({ iso }: { iso: string }) {
  const t = tile(iso);
  return (
    <span class="icon-tile" aria-hidden="true">
      <span class="date-tile">
        <span class="date-tile-month">{t.month}</span>
        <span class="date-tile-day">{t.day}</span>
      </span>
    </span>
  );
}

const PinIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Z"
    />
    <circle
      cx="12"
      cy="9.5"
      r="2.5"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    />
  </svg>
);

const VideoIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      d="m16 10 5-3v10l-5-3M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
    />
  </svg>
);

export const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M7 17 17 7M8 7h9v9"
    />
  </svg>
);

/** The date row of an event: its tile, the day and the hours. */
export function DateRow({ event }: { event: EventMeta }) {
  return (
    <div class="meta-row">
      <DateTile iso={event.start} />
      <div class="meta-text">
        <p class="meta-title">
          <time dateTime={event.start}>{longDate(event.start)}</time>
        </p>
        <p class="meta-desc">
          {clock(event.start)} a {clock(event.end)} · hora de Lima
        </p>
      </div>
    </div>
  );
}

/** The place row of an event; a venue with a map URL links to it. */
export function PlaceRow({ event }: { event: EventMeta }) {
  const place = event.place;
  const online = place.kind === "online";
  const link = mapLink(place);
  const body = (
    <>
      <span class="icon-tile" aria-hidden="true">
        {online ? <VideoIcon /> : <PinIcon />}
      </span>
      <div class="meta-text">
        <p class="meta-title">
          <span>{online ? "En línea" : place.name}</span>
          {link && (
            <span class="meta-arrow">
              <ArrowIcon />
            </span>
          )}
        </p>
        <p class="meta-desc">
          {online
            ? `${place.platform}. El enlace llega a tu entrada.`
            : place.address}
        </p>
      </div>
    </>
  );
  return link ? (
    <a class="meta-row meta-link" href={link} rel="noopener">
      {body}
    </a>
  ) : (
    <div class="meta-row">{body}</div>
  );
}

/** The square cover, or the event's color and backdrop when it has none. */
export function Cover({ event }: { event: EventMeta }) {
  const cover = coverUrl(event);
  return (
    <div class="cover">
      {cover && (
        <div class="cover-under" aria-hidden="true">
          <img src={cover} alt="" width={1080} height={1080} />
        </div>
      )}
      <div class="cover-frame">
        {cover ? (
          <img src={cover} alt="" width={1080} height={1080} />
        ) : (
          <div class="cover-blank" aria-hidden="true">
            <Mark />
          </div>
        )}
      </div>
    </div>
  );
}

export function EventCard({
  event,
  past,
}: {
  event: EventMeta;
  past: boolean;
}) {
  const kind = kindTag(event);
  return (
    <li
      class={`event-row tint ${themeClass(event.theme)}`}
      style={themeStyle(event.theme)}
    >
      <a href={`/${event.slug}`}>
        <DateTile iso={event.start} />
        <div class="event-row-text">
          <p class="event-row-meta">
            <span class="kind-dot" aria-hidden="true" />
            {kind && `${kind} · `}
            <time dateTime={event.start}>{shortDate(event.start)}</time>
            {!past && `, ${clock(event.start)}`}
            {event.status === "draft" && " · Borrador"}
          </p>
          <h3>{event.title}</h3>
          <p class="event-row-desc">{event.summary}</p>
          <p class="event-row-place">{placeLine(event)}</p>
        </div>
      </a>
    </li>
  );
}

/**
 * The featured event is the home page's hero: a full-width band in the
 * event's page colors, as its own page would show them.
 */
export function Spotlight({ event }: { event: EventMeta }) {
  const tinted = palette(event.theme.accent) ? " tinted" : "";
  return (
    <section
      class={`spotlight tint ${themeClass(event.theme)}${tinted}`}
      style={themeStyle(event.theme)}
      aria-labelledby="spotlight-title"
    >
      <a href={`/${event.slug}`}>
        <Cover event={event} />
        <div class="spotlight-text">
          <h1 id="spotlight-title">{event.title}</h1>
          <p class="spotlight-desc">{event.summary}</p>
          <div class="spotlight-meta">
            <DateRow event={event} />
          </div>
          <span class="button button-primary">Ver e inscribirme</span>
        </div>
      </a>
    </section>
  );
}
