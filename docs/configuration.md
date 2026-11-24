# Configuration

The variables live under `vars` in [`wrangler.jsonc`](../wrangler.jsonc), with
the production values. [`.dev.vars`](../.dev.vars) overrides them locally.

| Variable                 | Meaning                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `SITE_URL`               | The origin in canonical links, link previews, calendar entries and ticket links.              |
| `WHATSAPP_COMMUNITY_URL` | The WhatsApp Community invite. When set, the header, the home page and the ticket link to it. |
| `INSTAGRAM_URL`          | The Instagram profile. When set, the header and the home page link to it.                     |
| `SHOW_DRAFTS`            | Any value serves draft events.                                                                |

## Bindings

| Binding  | Resource                                                                |
| -------- | ----------------------------------------------------------------------- |
| `DB`     | The D1 database `up`. The schema is in [`migrations/`](../migrations/). |
| `ASSETS` | The client build and `public/`.                                         |
