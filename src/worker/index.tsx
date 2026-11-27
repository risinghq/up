import { createApp, type Env } from "./app";
import { cardAssets } from "./cardAssets";
import { Db } from "./db";
import { sendReminders } from "./reminders";

const app = createApp({ card: cardAssets });

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(
      sendReminders(
        new Db(env.DB),
        env,
        (url, init) => fetch(url, init),
        new Date(controller.scheduledTime),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
