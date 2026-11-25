import type { EventMeta } from "../worker/events";
import { Spotlight } from "./EventCard";

/** The public page a registrant shares: who is going, and the event. */
export function Voy(props: {
  firstName: string;
  event: EventMeta;
  ended: boolean;
}) {
  return (
    <article class="voy">
      <p class="voy-lead">
        {props.firstName} {props.ended ? "fue a" : "va a"}
      </p>
      <Spotlight event={props.event} />
    </article>
  );
}
