# Configuration

The variables live under `vars` in [`wrangler.jsonc`](../wrangler.jsonc), with
the production values. [`.dev.vars`](../.dev.vars) overrides them locally.

| Variable                   | Meaning                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SITE_URL`                 | The origin in canonical links, link previews, calendar entries and ticket links, and the only origin the account and admin forms accept. Passkeys are bound to its host. |
| `WHATSAPP_COMMUNITY_URL`   | The WhatsApp Community invite. When set, the header, the home page and the ticket link to it.                                                                            |
| `INSTAGRAM_URL`            | The Instagram profile. When set, the header and the home page link to it.                                                                                                |
| `TURNSTILE_SITE_KEY`       | The site key of the Turnstile widget `up`. With `TURNSTILE_SECRET_KEY`, the register and sign-in forms ask Turnstile whether it is a person.                             |
| `WHATSAPP_PHONE_NUMBER_ID` | The Cloud API sender, or `mock` to log the messages ([WhatsApp](whatsapp.md)). Unset, nothing is sent.                                                                   |

## Secrets

`wrangler secret put` sets these. `.dev.vars` is tracked, so it never holds
them.

| Secret                 | Meaning                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | The OAuth client for [Google Calendar and Meet](google-calendar.md). Without both secrets, the admin hides it. |
| `GOOGLE_CLIENT_SECRET` | That client's secret.                                                                                          |
| `TURNSTILE_SECRET_KEY` | The Turnstile widget's secret, sent to siteverify. Without it, the register form runs no check.                |
| `WHATSAPP_TOKEN`       | The Cloud API token. A real `WHATSAPP_PHONE_NUMBER_ID` sends nothing without it.                               |

## Bindings

| Binding  | Resource                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| `DB`     | The D1 database `up`: events, people, registrations and admins. The schema is in [`migrations/`](../migrations/). |
| `MEDIA`  | The R2 bucket `up-media`: event covers, served at `/media/<key>`.                                                 |
| `ASSETS` | The client build and `public/`.                                                                                   |
| `EMAIL`  | Cloudflare Email Service, allowed to send from `eventos@rising.sh` ([Email](email.md)).                           |

The cron trigger `0 * * * *` runs the [reminders](email.md) every hour.
