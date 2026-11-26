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
   a signed-in admin. An ended event answers 410.
3. The route hands the form to `signUp` in
   [`src/worker/signup.ts`](../src/worker/signup.ts), with D1, `fetch` and the
   clock passed in, and maps its outcome to a response. A filled `website` trap
   field is `trapped`: the route redirects back and stores nothing.
   `parseRegistration` in [`src/worker/form.ts`](../src/worker/form.ts) checks
   the fields and the event's questions and turns the phone into E.164. When the
   Turnstile secret is set, `verifyHuman` in
   [`src/worker/turnstile.ts`](../src/worker/turnstile.ts) sends the form's
   token to siteverify. A refused form or token is `refused`, and the route
   re-renders the event page with its values and messages, as 422. A siteverify
   outage lets the registration through.
4. `register` in [`src/worker/registrations.ts`](../src/worker/registrations.ts)
   upserts the person by email with `upsertPerson` in
   [`src/worker/people.ts`](../src/worker/people.ts), then inserts the
   registration with a fresh ticket token. One `INSERT ... SELECT` takes the
   next number and decides `going` or `waitlist` against the seats taken, so two
   registrations at once cannot both take the last seat. An email that already
   holds a live ticket is `exists`, and the route answers 409 without the ticket
   link. `claimResend` lets it email that link to the address once per cooldown.
5. `notifyTickets` in [`src/worker/notify.ts`](../src/worker/notify.ts) emails
   the confirmation through the `EMAIL` binding, then sends the WhatsApp message
   from [`src/worker/whatsapp.ts`](../src/worker/whatsapp.ts). `after` in
   [`src/worker/web.tsx`](../src/worker/web.tsx) hands the send to `waitUntil`,
   so the response does not wait for it.
6. The route redirects with 303 to `/entrada/<token>?nueva`. The ticket route
   looks the token up with `findTicket`, turns the ticket and its event into a
   `TicketView` with `ticketView` in
   [`src/worker/views.ts`](../src/worker/views.ts), and renders
   [`src/pages/Ticket.tsx`](../src/pages/Ticket.tsx). The view model decides
   what the page shows: its panels in order, the QR, the Meet link, the
   credential. The component only lays it out.

Every public page follows that shape: the route parses the request, calls the
domain functions with D1 and the clock, builds a view model with `eventView`,
`ticketView` or `profileView`, and renders it.

`POST /entrada/<token>/cancelar` calls `cancel`, which marks the registration
`cancelled` and moves the oldest waitlisted registration to `going` when a seat
frees. `cancel` and `fillSeats` return the seated tokens, and the route notifies
them. A checked-in ticket does not cancel.

The ticket page of a venue event carries a QR code of its own URL, drawn on the
server by `renderSVG` from `uqr`. A request that may work the event's door gets
the door panel: `worksDoor` in [`src/worker/door.tsx`](../src/worker/door.tsx)
admits an admin, or a voluntario whose `up_door` cookie names the event before
it ends. The panel posts to `/puerta/<slug>/ingreso/<token>`, and `checkIn` sets
`checked_in_at` once.

`doorRoutes` serves `/puerta`. `POST /admin/eventos/<slug>/equipo/<id>/puerta`
calls `openDoor` in [`src/worker/roles.ts`](../src/worker/roles.ts), which
stores a new token's hash in the voluntario's `event_roles.door_hash`.
`GET /puerta/abrir/<token>` sets the token as the `up_door` cookie, and the
session middleware turns it into the event's slug with `doorEvent`.
`POST /puerta/<slug>/llegada` calls `walkIn` in
[`src/worker/registrations.ts`](../src/worker/registrations.ts), which seats the
person past the capacity and checks them in. `puerta` is a reserved slug.

`POST /entrada/<token>/compartir` calls `shareTicket` in
[`src/worker/shares.ts`](../src/worker/shares.ts), which gives the registration
a random `share_id` apart from its token. `GET /<slug>/voy/<id>` looks it up
with `findShare` and renders [`src/pages/Voy.tsx`](../src/pages/Voy.tsx) with
the holder's first name only. Its `og:image` is `GET /<slug>/voy/<id>.png`,
which `renderCard` in [`src/worker/card.tsx`](../src/worker/card.tsx) draws:
satori lays the card out as SVG and resvg turns it into a PNG. Cancelling or
registering again clears `share_id`, so the old link answers 404.

`POST /entrada/<token>/perfil` calls `openProfile` in
[`src/worker/profiles.ts`](../src/worker/profiles.ts), which gives the ticket's
person a random `profile_id` unless they have one. `GET /p/<id>` looks it up
with `findProfile`, which returns the first name, the slugs of the published
events where the person checked in, and the roles their email holds with
`rolesOf` in [`src/worker/roles.ts`](../src/worker/roles.ts), and renders
[`src/pages/Profile.tsx`](../src/pages/Profile.tsx).
`POST /entrada/<token>/perfil/ocultar` calls `closeProfile`, which clears
`profile_id`.

`checkIn` gives the registration a random `certificate_id` unless it has one,
and `addRole` gives each role one. `GET /c/<id>` calls `findCertificate` in
[`src/worker/certificates.ts`](../src/worker/certificates.ts), which looks the
id up in the checked-in registrations, then in `event_roles`, and answers 404
unless `issuesCertificates` holds: the event is published and over.
`certificateView` in [`src/worker/views.ts`](../src/worker/views.ts) words it,
and [`src/pages/Certificate.tsx`](../src/pages/Certificate.tsx) lays it out as
one A4 landscape sheet.

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
   `/admin/eventos/<slug>/equipo` is `teamRoutes` in
   [`src/worker/team.tsx`](../src/worker/team.tsx), mounted under the same
   guard. It adds and removes the event's roles with `addRole` and `removeRole`.
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

| Table            | Row                                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`         | One event: its text, dates, place and map point, capacity, questions as JSON, status and theme.                                                                                    |
| `event_roles`    | One person's role at one event: name, optional email, role, position, a voluntario's door link hash and the `certificate_id`. It follows the event's slug and dies with the event. |
| `people`         | One email, with the latest name and phone, the consent dates and the public profile's `profile_id`.                                                                                |
| `registrations`  | One person at one event: the ticket token as `id`, the number, the status, the answers as JSON, the share link's `share_id` and, once checked in, the `certificate_id`.            |
| `admins`         | One admin's name.                                                                                                                                                                  |
| `credentials`    | One passkey of one admin.                                                                                                                                                          |
| `invites`        | One admin invite, by token hash, until it is used or expires.                                                                                                                      |
| `sessions`       | One signed-in browser, by token hash.                                                                                                                                              |
| `challenges`     | One WebAuthn challenge between its options request and its verification.                                                                                                           |
| `google_account` | The one connected Google account: its email and refresh token.                                                                                                                     |

The ticket token is the registrant's only key. Anyone with the link can see and
cancel the ticket, and registrants have no accounts. Invite and session tokens
are stored as their SHA-256 only.

## Files

| Path                                                            | Holds                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`src/worker/app.tsx`](../src/worker/app.tsx)                   | Public routes, headers and the session middleware.                          |
| [`src/worker/admin.tsx`](../src/worker/admin.tsx)               | The `/admin` routes.                                                        |
| [`src/worker/adminPage.tsx`](../src/worker/adminPage.tsx)       | The admin page frame and the loader of the event in the path.               |
| [`src/worker/team.tsx`](../src/worker/team.tsx)                 | The routes of an event's Equipo tab.                                        |
| [`src/worker/door.tsx`](../src/worker/door.tsx)                 | The `/puerta` routes: door links, check-in and walk-ins.                    |
| [`src/worker/web.tsx`](../src/worker/web.tsx)                   | The `Env` type, page rendering and work after the response.                 |
| [`src/worker/events.ts`](../src/worker/events.ts)               | The event type and its D1 queries.                                          |
| [`src/worker/google.ts`](../src/worker/google.ts)               | Google OAuth, the Calendar API and the connected account.                   |
| [`src/worker/eventForm.ts`](../src/worker/eventForm.ts)         | The editor's form parsing.                                                  |
| [`src/worker/questions.ts`](../src/worker/questions.ts)         | The one-per-line question syntax.                                           |
| [`src/worker/form.ts`](../src/worker/form.ts)                   | Registration parsing and phone normalization.                               |
| [`src/worker/signup.ts`](../src/worker/signup.ts)               | A register post, from the bot checks to the stored registration.            |
| [`src/worker/registrations.ts`](../src/worker/registrations.ts) | Seats, the waitlist, cancelling, check-in and reminders of one ticket.      |
| [`src/worker/people.ts`](../src/worker/people.ts)               | People by email.                                                            |
| [`src/worker/registrants.ts`](../src/worker/registrants.ts)     | An event's registrant list and counts, for the admin.                       |
| [`src/worker/shares.ts`](../src/worker/shares.ts)               | The share link of a ticket.                                                 |
| [`src/worker/profiles.ts`](../src/worker/profiles.ts)           | Public profiles and the events a person attended.                           |
| [`src/worker/roles.ts`](../src/worker/roles.ts)                 | The roles at an event, their labels and their D1 queries.                   |
| [`src/worker/certificates.ts`](../src/worker/certificates.ts)   | Certificates by id and when an event issues them.                           |
| [`src/worker/views.ts`](../src/worker/views.ts)                 | The view models of the event, ticket, profile and certificate pages.        |
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

[`vite.config.ts`](../vite.config.ts) builds the client to
`/assets/client-<build>.css`, `/assets/client-<build>.js` and
`/assets/admin-<build>.js`, and passes the build stamp to the layout as
`BUILD_ID`. [`public/_headers`](../public/_headers) caches `/assets/` for a
year.
