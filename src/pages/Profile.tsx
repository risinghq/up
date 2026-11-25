import { kindLabel, type EventMeta } from "../worker/events";
import { monthYear, shortDate } from "../worker/time";
import { Mark } from "./Layout";
import { themeClass, themeStyle } from "./theme";

/** One attended event, as a medal in the event's colors and backdrop. */
function Badge({ event }: { event: EventMeta }) {
  return (
    <li
      class={`badge tint ${themeClass(event.theme)}`}
      style={themeStyle(event.theme)}
    >
      <a href={`/${event.slug}`}>
        <span class="badge-medal" aria-hidden="true">
          <Mark />
        </span>
        <span class="badge-kind">{kindLabel[event.theme.kind]}</span>
        <span class="badge-title">{event.title}</span>
        <time class="badge-date" dateTime={event.start}>
          {shortDate(event.start)}
        </time>
      </a>
    </li>
  );
}

/**
 * A person's public page, after Luma's profile: a header with an initial,
 * the name, since when and how many events, then the events they host and
 * the badges, newest first.
 */
export function ProfilePage(props: {
  firstName: string;
  since: string;
  events: EventMeta[];
  hosted: EventMeta[];
}) {
  const count = props.events.length;
  const hosted = props.hosted.length;
  const latest = props.hosted[0] ?? props.events[0];

  return (
    <article class="profile">
      <header class="profile-head">
        <span
          class="profile-avatar"
          style={latest && { backgroundColor: latest.theme.accent }}
          aria-hidden="true"
        >
          {props.firstName.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1>{props.firstName}</h1>
          <p class="profile-since">
            En up.rising.sh desde {monthYear(props.since)}
          </p>
          <p class="profile-count">
            <strong>{count}</strong> {count === 1 ? "evento" : "eventos"}
            {hosted > 0 && (
              <>
                {" · "}
                <strong>{hosted}</strong>{" "}
                {hosted === 1 ? "organizado" : "organizados"}
              </>
            )}
          </p>
        </div>
      </header>

      {hosted > 0 && (
        <section class="profile-badges" aria-labelledby="organiza">
          <h2 id="organiza">Organiza</h2>
          <ul class="badges">
            {props.hosted.map((event) => (
              <Badge event={event} key={event.slug} />
            ))}
          </ul>
        </section>
      )}

      <section class="profile-badges" aria-labelledby="insignias">
        <h2 id="insignias">Insignias</h2>
        {count === 0 ? (
          <p class="profile-empty">Todavía no tiene insignias.</p>
        ) : (
          <ul class="badges">
            {props.events.map((event) => (
              <Badge event={event} key={event.slug} />
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
