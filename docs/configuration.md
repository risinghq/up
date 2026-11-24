# Configuration

The variables live under `vars` in [`wrangler.jsonc`](../wrangler.jsonc), with
the production values. [`.dev.vars`](../.dev.vars) overrides them locally.

| Variable                 | Meaning                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`               | The origin in canonical links, link previews, calendar entries, ticket links and admin invites. Passkeys are bound to its host. |
| `WHATSAPP_COMMUNITY_URL` | The WhatsApp Community invite. When set, the header, the home page and the ticket link to it.                                   |
| `INSTAGRAM_URL`          | The Instagram profile. When set, the header and the home page link to it.                                                       |

## Secrets

`wrangler secret put` sets these. `.dev.vars` is tracked, so it never holds
them.

| Secret                 | Meaning                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | The OAuth client for [Google Calendar and Meet](google-calendar.md). Without both secrets, the admin hides it. |
| `GOOGLE_CLIENT_SECRET` | That client's secret.                                                                                          |

## Bindings

| Binding  | Resource                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| `DB`     | The D1 database `up`: events, people, registrations and admins. The schema is in [`migrations/`](../migrations/). |
| `MEDIA`  | The R2 bucket `up-media`: event covers, served at `/media/<key>`.                                                 |
| `ASSETS` | The client build and `public/`.                                                                                   |
