import { listEvents } from "./events";
import { mailTickets } from "./mail";
import { markReminded, unreminded } from "./registrations";
import type { Env } from "./web";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Emails a reminder to every seated ticket of a published event that starts
 * within a day. The hourly cron calls it; a ticket is marked only once its
 * email went out, so a failed send is retried the next hour.
 */
export async function sendReminders(env: Env, now: Date): Promise<number> {
  const soon = (await listEvents(env.DB)).filter((event) => {
    const lead = new Date(event.start).getTime() - now.getTime();
    return event.status === "published" && lead > 0 && lead <= DAY;
  });
  let count = 0;
  for (const event of soon) {
    const dayBefore = new Date(new Date(event.start).getTime() - DAY);
    const tokens = await unreminded(env.DB, event.slug, dayBefore);
    const sent = await mailTickets(env, "reminder", event, tokens);
    for (const token of sent)
      await markReminded(env.DB, token, now.toISOString());
    count += sent.length;
  }
  return count;
}
