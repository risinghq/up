import type { Db } from "./db";
import { listEvents } from "./events";
import { notifyTickets, type NotifyEnv } from "./notify";
import { markReminded, unreminded } from "./registrations";
import type { Fetch } from "./web";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Reminds every seated ticket of a published event that starts within a day,
 * by email and WhatsApp. The hourly cron calls it; a ticket is marked only
 * once its email went out, so a failed send is retried the next hour.
 */
export async function sendReminders(
  db: Db,
  env: NotifyEnv,
  fetcher: Fetch,
  now: Date,
): Promise<number> {
  const soon = (await listEvents(db)).filter((event) => {
    const lead = new Date(event.start).getTime() - now.getTime();
    return event.status === "published" && lead > 0 && lead <= DAY;
  });
  let count = 0;
  for (const event of soon) {
    const dayBefore = new Date(new Date(event.start).getTime() - DAY);
    const tokens = await unreminded(db, event.slug, dayBefore);
    const sent = await notifyTickets(
      db,
      env,
      fetcher,
      "reminder",
      event,
      tokens,
    );
    for (const token of sent) await markReminded(db, token, now.toISOString());
    count += sent.length;
  }
  return count;
}
