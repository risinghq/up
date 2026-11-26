import { Fragment } from "preact";
import { kindLabel, type EventMeta } from "../worker/events";
import { monthYear, shortDate } from "../worker/time";
import type { ProfileView } from "./Profile.view";
import { Mark } from "./Brand";
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

function Badges({ events }: { events: EventMeta[] }) {
  return (
    <ul class="badges">
      {events.map((event) => (
        <Badge event={event} key={event.slug} />
      ))}
    </ul>
  );
}

/**
 * A person's public page, after Luma's profile: a header with an initial,
 * the name, since when and how many events, then the events of each role
 * they held and the badges, newest first.
 */
export function ProfilePage(props: ProfileView) {
  const count = props.events.length;
  const latest = props.roles[0]?.events[0] ?? props.events[0];

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
            {props.roles.map((group) => (
              <Fragment key={group.role}>
                {" · "}
                <strong>{group.events.length}</strong> {group.tally}
              </Fragment>
            ))}
          </p>
        </div>
      </header>

      {props.roles.map((group) => (
        <section
          key={group.role}
          class="profile-badges"
          aria-labelledby={group.role}
        >
          <h2 id={group.role}>{group.title}</h2>
          <Badges events={group.events} />
        </section>
      ))}

      <section class="profile-badges" aria-labelledby="insignias">
        <h2 id="insignias">Insignias</h2>
        {count === 0 ? (
          <p class="profile-empty">Todavía no tiene insignias.</p>
        ) : (
          <Badges events={props.events} />
        )}
      </section>
    </article>
  );
}
