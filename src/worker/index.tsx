import { createApp, type Env } from "./app";
import { sendReminders } from "./reminders";

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(sendReminders(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
