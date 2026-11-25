import { kindLabel, type EventMeta } from "../worker/events";
import { shortDate } from "../worker/time";
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

/** A person's public page: the events they attended, as badges. */
export function ProfilePage(props: { firstName: string; events: EventMeta[] }) {
  const count = props.events.length;
  return (
    <article class="profile">
      <h1>{props.firstName}</h1>
      <p class="profile-count">
        {count === 0
          ? "Todavía no tiene insignias."
          : `${count} ${count === 1 ? "evento" : "eventos"} en up.rising.sh`}
      </p>
      {count > 0 && (
        <ul class="badges">
          {props.events.map((event) => (
            <Badge event={event} key={event.slug} />
          ))}
        </ul>
      )}
    </article>
  );
}
