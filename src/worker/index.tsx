import { createApp, type Env } from "./app";
import { cardAssets } from "./cardAssets";
import { sendReminders } from "./reminders";

const app = createApp({ card: cardAssets });

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(sendReminders(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
