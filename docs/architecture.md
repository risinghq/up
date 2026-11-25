# Architecture

up is one Cloudflare Worker. It renders every page with Preact on the server and
answers every form with a redirect or a re-rendered page, so the site works
without JavaScript. Two exceptions: the admin passkey ceremony needs the
browser's WebAuthn API, and registering needs the Turnstile widget that
[`src/client/turnstile.ts`](../src/client/turnstile.ts) renders.

## A registration, from form to ticket

1. `POST /<slug>` reaches the Hono app built by `createApp` in
   [`src/worker/app.tsx`](../src/worker/app.tsx). The deployed Worker,
   [`src/worker/index.tsx`](../src/worker/index.tsx), calls it with the real
   clock.
2. The route loads the event from D1 with `findEvent` in
   [`src/worker/events.ts`](../src/worker/events.ts). A draft is visible only to
   a signed-in admin. An ended event answers 410. A filled `website` trap field
   redirects back to the event and stores nothing.
3. `parseRegistration` in [`src/worker/form.ts`](../src/worker/form.ts) checks
   the fields and the event's questions and turns the phone into E.164. A
   refused form re-renders the event page with its values and messages, as 422.
   When both Turnstile keys are set, `verifyHuman` in
   [`src/worker/turnstile.ts`](../src/worker/turnstile.ts) then sends the form's
   token to siteverify. A missing or refused token re-renders the same way. A
   siteverify outage lets the registration through.
4. `register` in [`src/worker/registrations.ts`](../src/worker/registrations.ts)
   upserts the person by email, then inserts the registration with a fresh
   ticket token and the next number. Past the event's capacity the status is
   `waitlist`. An email that already holds a live ticket gets `exists`, and the
   route answers 409 without the ticket link. `claimResend` lets it email that
   link to the address once per cooldown.
5. `notifyTickets` in [`src/worker/notify.ts`](../src/worker/notify.ts) emails
   the confirmation through the `EMAIL` binding, then sends the WhatsApp message
   from [`src/worker/whatsapp.ts`](../src/worker/whatsapp.ts). `after` in
   [`src/worker/web.tsx`](../src/worker/web.tsx) hands the send to `waitUntil`,
   so the response does not wait for it.
6. The route redirects with 303 to `/entrada/<token>?nueva`. The ticket route
   looks the token up with `findTicket` and renders
   [`src/pages/Ticket.tsx`](../src/pages/Ticket.tsx).

`POST /entrada/<token>/cancelar` calls `cancel`, which marks the registration
`cancelled` and moves the oldest waitlisted registration to `going` when a seat
frees. `cancel` and `fillSeats` return the seated tokens, and the route notifies
them. A checked-in ticket does not cancel.

The ticket page of a venue event carries a QR code of its own URL, drawn on the
server by `renderSVG` from `uqr`. An admin who opens the URL gets the door
panel. Its form posts to `/admin/entrada/<token>/ingreso`, under the admin
guard, and `checkIn` sets `checked_in_at` once.

`POST /entrada/<token>/compartir` calls `shareTicket`, which gives the
registration a random `share_id` apart from its token. `GET /<slug>/voy/<id>`
looks it up with `findShare` and renders
[`src/pages/Voy.tsx`](../src/pages/Voy.tsx) with the holder's first name only.
Its `og:image` is `GET /<slug>/voy/<id>.png`, which `renderCard` in
[`src/worker/card.tsx`](../src/worker/card.tsx) draws: satori lays the card out
as SVG and resvg turns it into a PNG. Cancelling or registering again clears
`share_id`, so the old link answers 404.

`POST /entrada/<token>/perfil` calls `openProfile`, which gives the ticket's
person a random `profile_id` unless they have one. `GET /p/<id>` looks it up
with `findProfile`, which returns the first name and the slugs of the published
events where the person checked in, and renders
[`src/pages/Profile.tsx`](../src/pages/Profile.tsx).
`POST /entrada/<token>/perfil/ocultar` calls `closeProfile`, which clears
`profile_id`.

satori is pinned to 0.32.0. Later releases bundle a HarfBuzz module that reads
`self.location` and compiles WebAssembly at run time, and workerd allows
neither. 0.32.0 measures text without kerning but draws it with kerning, so the
card draws with Geist fonts that
[`scripts/card-fonts.sh`](../scripts/card-fonts.sh) writes with the kerning
tables removed.

The Worker's `scheduled` handler in
[`src/worker/index.tsx`](../src/worker/index.tsx) runs every hour.
`sendReminders` in [`src/worker/reminders.ts`](../src/worker/reminders.ts)
notifies each seated ticket of an event that starts within a day and marks
`reminded_at` once the email went out.

## An edit, from editor to page

1. Every request passes a middleware in `createApp` that reads the `up_admin`
   cookie and looks up its session with `sessionAdmin` in
   [`src/worker/auth.ts`](../src/worker/auth.ts).
2. `adminRoutes` in [`src/worker/admin.tsx`](../src/worker/admin.tsx) serves
   `/admin`. Without a session, a GET redirects to `/admin/entrar` and a POST
   answers 403. A form post whose `Origin` is not `SITE_URL` is refused.
3. `POST /admin/eventos/<slug>/editar` reads the editor with `parseEventForm` in
   [`src/worker/eventForm.ts`](../src/worker/eventForm.ts). It turns Lima
   datetimes into ISO, the questions text into `Question[]` with
   [`src/worker/questions.ts`](../src/worker/questions.ts) and the theme fields
   into a `Theme`. The route follows a map link without a point to the one it
   redirects to, with `locate` in [`src/worker/geo.ts`](../src/worker/geo.ts).
4. A new cover goes to R2 under `covers/`, and the old one is deleted after the
   save. `saveEvent` writes the row and clears `featured` on every other event.
   `fillSeats` seats the waitlist when the capacity rose.
5. The event page renders the theme with
   [`src/pages/theme.ts`](../src/pages/theme.ts): the accent's tint palette as
   CSS variables, and the kind and backdrop as classes.
   [`src/client/styles.css`](../src/client/styles.css) derives text, dividers
   and buttons from the palette, once for light and once under `.dark`.

Sign-in uses passkeys through
[`src/worker/passkeys.ts`](../src/worker/passkeys.ts). The server stores each
challenge in D1 and takes it once.
[`src/client/admin.ts`](../src/client/admin.ts) runs the ceremony in the
browser, and it loads only on the sign-in and invite pages.
[`src/client/map.ts`](../src/client/map.ts) draws a venue's map with MapLibre
and OpenFreeMap tiles. `main.ts` imports it when the map nears the viewport, so
its chunk and worker load only on an event page with a point.

The ticket page renders an empty, hidden `.credential` slot under a ticket with
a seat. Its data attributes carry the face's text and the colors from
`cardColors` in [`src/pages/theme.ts`](../src/pages/theme.ts), the same colors
as the share card. `main.ts` imports
[`src/client/credential.ts`](../src/client/credential.ts) only when WebGL 2 runs
and the reader allows motion. The module draws the faces on 2D canvases, builds
the card and strap with three.js, and moves them with its own verlet rope.

The Google Calendar link runs through
[`src/worker/google.ts`](../src/worker/google.ts): the OAuth exchange, the
Calendar API calls and the `google_account` row. Every call goes through the
`fetch` that `createApp` receives, so the tests stand in for Google. The admin
routes store the entry's id, its link and the Meet link on the event row;
`saveEvent` never writes those columns.

## Data

D1 holds everything but the covers; [`migrations/`](../migrations/) holds the
schema.

| Table            | Row                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `events`         | One event: its text, dates, place and map point, capacity, questions as JSON, status and theme.                                 |
| `people`         | One email, with the latest name and phone, the consent dates and the public profile's `profile_id`.                             |
| `registrations`  | One person at one event: the ticket token as `id`, the number, the status, the answers as JSON and the share link's `share_id`. |
| `admins`         | One admin's name.                                                                                                               |
| `credentials`    | One passkey of one admin.                                                                                                       |
| `invites`        | One admin invite, by token hash, until it is used or expires.                                                                   |
| `sessions`       | One signed-in browser, by token hash.                                                                                           |
| `challenges`     | One WebAuthn challenge between its options request and its verification.                                                        |
| `google_account` | The one connected Google account: its email and refresh token.                                                                  |

The ticket token is the registrant's only key. Anyone with the link can see and
cancel the ticket, and registrants have no accounts. Invite and session tokens
are stored as their SHA-256 only.

## Files

| Path                                                            | Holds                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`src/worker/app.tsx`](../src/worker/app.tsx)                   | Public routes, headers and the session middleware.                          |
| [`src/worker/admin.tsx`](../src/worker/admin.tsx)               | The `/admin` routes.                                                        |
| [`src/worker/web.tsx`](../src/worker/web.tsx)                   | The `Env` type, page rendering and work after the response.                 |
| [`src/worker/events.ts`](../src/worker/events.ts)               | The event type and its D1 queries.                                          |
| [`src/worker/google.ts`](../src/worker/google.ts)               | Google OAuth, the Calendar API and the connected account.                   |
| [`src/worker/eventForm.ts`](../src/worker/eventForm.ts)         | The editor's form parsing.                                                  |
| [`src/worker/questions.ts`](../src/worker/questions.ts)         | The one-per-line question syntax.                                           |
| [`src/worker/form.ts`](../src/worker/form.ts)                   | Registration parsing and phone normalization.                               |
| [`src/worker/registrations.ts`](../src/worker/registrations.ts) | People and registration queries.                                            |
| [`src/worker/mail.ts`](../src/worker/mail.ts)                   | The emails to ticket holders and their sending.                             |
| [`src/worker/whatsapp.ts`](../src/worker/whatsapp.ts)           | The WhatsApp templates and their sending.                                   |
| [`src/worker/notify.ts`](../src/worker/notify.ts)               | Sends a ticket's email and WhatsApp message together.                       |
| [`src/worker/reminders.ts`](../src/worker/reminders.ts)         | The day-before reminders the hourly cron sends.                             |
| [`src/worker/auth.ts`](../src/worker/auth.ts)                   | Admin, invite, session and challenge queries.                               |
| [`src/worker/passkeys.ts`](../src/worker/passkeys.ts)           | WebAuthn options and verification.                                          |
| [`src/worker/tokens.ts`](../src/worker/tokens.ts)               | Random tokens and their hashes.                                             |
| [`src/worker/csv.ts`](../src/worker/csv.ts)                     | The registrants export.                                                     |
| [`src/worker/calendar.ts`](../src/worker/calendar.ts)           | Google Calendar links and `.ics` files.                                     |
| [`src/worker/geo.ts`](../src/worker/geo.ts)                     | Venue points from coordinates and map links.                                |
| [`src/worker/time.ts`](../src/worker/time.ts)                   | Dates in Lima time, es-PE.                                                  |
| [`src/worker/card.tsx`](../src/worker/card.tsx)                 | The share card and its PNG rendering.                                       |
| [`src/worker/cardAssets.ts`](../src/worker/cardAssets.ts)       | The card's WebAssembly modules and fonts, bundled into the Worker.          |
| [`src/worker/fonts/`](../src/worker/fonts/)                     | The card's Geist fonts without kerning.                                     |
| [`scripts/card-fonts.sh`](../scripts/card-fonts.sh)             | Writes those fonts from `@fontsource/geist`.                                |
| [`src/pages/`](../src/pages/)                                   | The page components; [`admin/`](../src/pages/admin/) holds the admin pages. |
| [`src/client/`](../src/client/)                                 | The stylesheets and the client scripts.                                     |
| [`scripts/admin-invite.ts`](../scripts/admin-invite.ts)         | The first-admin invite.                                                     |

[`vite.config.ts`](../vite.config.ts) builds the client to `/assets/client.css`,
`/assets/client.js` and `/assets/admin.js`, the names the layout links.
