# Architecture

up is one Cloudflare Worker. It renders every page with Preact on the server and
answers every form with a redirect or a re-rendered page, so the site works
without JavaScript. Two exceptions: a passkey ceremony needs the browser's
WebAuthn API, and registering needs the Turnstile widget that
[`src/client/turnstile.ts`](../src/client/turnstile.ts) renders.

## A registration, from form to ticket

1. `POST /<slug>` reaches the Hono app built by `createApp` in
   [`src/worker/app.tsx`](../src/worker/app.tsx). The deployed Worker,
   [`src/worker/index.tsx`](../src/worker/index.tsx), calls it with the real
   clock. `createApp` mounts one route module per URL area from
   [`src/worker/routes/`](../src/worker/routes/), each built from the same
   `Deps`: the clock, `fetch` and the card assets. `eventRoutes` in
   [`src/worker/routes/event.tsx`](../src/worker/routes/event.tsx) takes this
   request.
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
   [`src/worker/people.ts`](../src/worker/people.ts). The name and phone change
   only when the signed-in account holds that email. Then it inserts the
   registration with a fresh ticket token. The statement that writes the row
   takes the next number and decides `going` or `waitlist` against the seats
   taken, in subqueries, so two registrations at once cannot both take the last
   seat. An email that already holds a live ticket is `exists`, and the route
   answers 409 without the ticket link. `claimResend` lets it email that link to
   the address once per cooldown.
5. `notifyTickets` in [`src/worker/notify.ts`](../src/worker/notify.ts) emails
   the confirmation through the `EMAIL` binding, then sends the WhatsApp message
   from [`src/worker/whatsapp.ts`](../src/worker/whatsapp.ts). `after` in
   [`src/worker/web.tsx`](../src/worker/web.tsx) hands the send to `waitUntil`,
   so the response does not wait for it.
6. The route redirects with 303 to `/ticket/<token>?new`. The ticket route looks
   the token up with `findTicket`, turns the ticket and its event into a
   `TicketView` with `ticketView` in
   [`src/pages/Ticket.view.ts`](../src/pages/Ticket.view.ts), and renders
   [`src/pages/Ticket.tsx`](../src/pages/Ticket.tsx). The view model decides
   what the page shows: its panels in order, the QR, the Meet link, the
   credential. The component only lays it out.

Every public page follows that shape: the route parses the request, calls the
domain functions with D1 and the clock, builds a view model with `eventView`,
`ticketView` or `profileView`, and renders it. Each view model sits beside its
page as `<Page>.view.ts`.

`POST /ticket/<token>/cancel` calls `cancel`, which marks the registration
`cancelled` and moves the oldest waitlisted registration to `going` when a seat
frees. `cancel` and `fillSeats` return the seated tokens, and the route notifies
them. A checked-in ticket does not cancel.

The ticket page of a venue event carries a QR code of its own URL, drawn on the
server by `renderSVG` from `uqr`. A request that may work the event's door gets
the door panel: `worksDoor` in
[`src/worker/routes/door.tsx`](../src/worker/routes/door.tsx) admits an admin,
or, until the event ends, an account that holds an organizer or volunteer role
at it, which `holdsDoor` in [`src/worker/roles.ts`](../src/worker/roles.ts)
checks. The panel posts to `/door/<slug>/check-in/<token>`, and `checkIn` sets
`checked_in_at` once.

`doorRoutes` serves `/door`. A signed-out `GET /door/<slug>` redirects to
`/sign-in` with `next` naming the door; any other refused request gets 404.
`POST /door/<slug>/walk-in` calls `walkIn` in
[`src/worker/registrations.ts`](../src/worker/registrations.ts), which seats the
person past the capacity and checks them in. `door` is a reserved slug.

`POST /ticket/<token>/share` calls `shareTicket` in
[`src/worker/shares.ts`](../src/worker/shares.ts), which gives the registration
a random `share_id` apart from its token. `GET /<slug>/going/<id>` looks it up
with `findShare` and renders [`src/pages/Going.tsx`](../src/pages/Going.tsx)
with the holder's first name only. Its `og:image` is
`GET /<slug>/going/<id>.png`, which `renderCard` in
[`src/worker/card.tsx`](../src/worker/card.tsx) draws: satori lays the card out
as SVG and resvg turns it into a PNG. Cancelling or registering again clears
`share_id`, so the old link answers 404.

`POST /ticket/<token>/profile` calls `openProfile` in
[`src/worker/profiles.ts`](../src/worker/profiles.ts), which gives the ticket's
person a random `profile_id` unless they have one. `GET /p/<id>` looks it up
with `findProfile`, which returns the first name, the slugs of the published
events where the person checked in, and the roles the person holds with
`rolesOf` in [`src/worker/roles.ts`](../src/worker/roles.ts), and renders
[`src/pages/Profile.tsx`](../src/pages/Profile.tsx).
`POST /ticket/<token>/profile/hide` calls `closeProfile`, which clears
`profile_id`.

`legacyRoutes` in
[`src/worker/routes/legacy.ts`](../src/worker/routes/legacy.ts) answers the
Spanish paths of links already sent with a 301: `/entrada/<token>`,
`/privacidad` and `/<slug>/voy/<id>`.

`checkIn` gives the registration a random `certificate_id` unless it has one,
and `addRole` gives each role one. `GET /c/<id>` calls `findCertificate` in
[`src/worker/certificates.ts`](../src/worker/certificates.ts), which looks the
id up in the checked-in registrations, then in `event_roles`, and answers 404
unless `issuesCertificates` holds: the event is published and over.
`certificateView` in
[`src/pages/Certificate.view.ts`](../src/pages/Certificate.view.ts) words it,
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

1. Every request passes a middleware in `createApp` that reads the `up_session`
   cookie and looks up its account with `sessionAccount` in
   [`src/worker/auth.ts`](../src/worker/auth.ts).
2. `adminRoutes` in
   [`src/worker/routes/admin/index.tsx`](../src/worker/routes/admin/index.tsx)
   serves `/admin` to an account with the admin flag. Without a session, a GET
   redirects to `/sign-in?next=<path>` and a POST answers 403. A signed-in
   person who is not an admin gets 404. A form post whose `Origin` is not
   `SITE_URL` is refused. Behind that gate it mounts the settings, the editor,
   one event's pages and its team from the same folder.
3. `POST /admin/events/<slug>/edit`, in
   [`editor.tsx`](../src/worker/routes/admin/editor.tsx), reads the editor with
   `parseEventForm` in [`src/worker/eventForm.ts`](../src/worker/eventForm.ts).
   It turns Lima datetimes into ISO, the questions text into `Question[]` with
   [`src/worker/questions.ts`](../src/worker/questions.ts) and the theme fields
   into a `Theme`. The route follows a map link without a point to the one it
   redirects to, with `locate` in [`src/worker/geo.ts`](../src/worker/geo.ts).
4. A new cover goes to R2 under `covers/`, and the old one is deleted after the
   save. `saveEvent` writes the row and clears `featured` on every other event.
   `fillSeats` seats the waitlist when the capacity rose.
   `/admin/events/<slug>/team` is `teamRoutes` in
   [`src/worker/routes/admin/team.tsx`](../src/worker/routes/admin/team.tsx),
   mounted under the same guard. It finds accounts by name or email with
   `searchAccounts` in [`src/worker/accounts.ts`](../src/worker/accounts.ts),
   and gives or removes a role with `addRole` and `removeRole`.
5. The event page renders the theme with
   [`src/pages/theme.ts`](../src/pages/theme.ts): the accent's tint palette as
   CSS variables, and the kind and backdrop as classes.
   [`src/client/global.css`](../src/client/global.css) derives text, dividers
   and buttons from the palette, once for light and once under `.dark`.

`signinRoutes` in
[`src/worker/routes/signin.tsx`](../src/worker/routes/signin.tsx) serves
`/sign-in` and `/sign-out`, and `accountRoutes` in
[`src/worker/routes/account.tsx`](../src/worker/routes/account.tsx) serves
`/account`. Both render through
[`src/worker/routes/accountPages.tsx`](../src/worker/routes/accountPages.tsx). A
code sign-in goes through [`src/worker/codes.ts`](../src/worker/codes.ts):
`requestCode` stores one code's hash per email, `checkCode` counts every try,
and `issueVerified` hands an email with no account a one-use token for the
new-account form. `startSession` in
[`src/worker/session.ts`](../src/worker/session.ts) sets the cookie. Passkeys go
through [`src/worker/passkeys.ts`](../src/worker/passkeys.ts); the server stores
each challenge in D1 and takes it once.
[`src/client/passkey.ts`](../src/client/passkey.ts) runs the ceremony in the
browser, and it loads only on the account pages.
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
[`src/worker/google/`](../src/worker/google/): `oauth.ts` holds the OAuth
exchange, `calendar.ts` the Calendar API calls, and `account.ts` the
`google_account` row. Every call goes through the `fetch` that `createApp`
receives, so the tests stand in for Google. The admin routes store the entry's
id, its link and the Meet link on the event row; `saveEvent` never writes those
columns.

## Data

D1 holds everything but the covers; [`migrations/`](../migrations/) holds the
schema. `Db` in [`src/worker/db.ts`](../src/worker/db.ts) is a Kysely instance
typed by that schema, with `batch` for D1's atomic batch. The request middleware
puts one on `c.var.db` and the cron handler makes its own; every domain function
takes it first. Stored values are English (`organizer`, `workshop`); the labels
the pages show are Spanish.

| Table            | Row                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`         | One event: its text, dates, place and map point, capacity, questions as JSON, status and theme.                                                                         |
| `event_roles`    | One person's role at one event: the `person_id`, role, position and the `certificate_id`. It follows the event's slug and dies with the event or the person.            |
| `people`         | One person and account: an optional email, name and phone, the consent dates, the public profile's `profile_id` and the `admin` flag.                                   |
| `registrations`  | One person at one event: the ticket token as `id`, the number, the status, the answers as JSON, the share link's `share_id` and, once checked in, the `certificate_id`. |
| `credentials`    | One passkey of one person.                                                                                                                                              |
| `sessions`       | One signed-in browser of one person, by token hash.                                                                                                                     |
| `sign_in_codes`  | The pending code of one email, by hash, with its tries; once checked for an email with no account, the hash of the new-account token.                                   |
| `challenges`     | One WebAuthn challenge between its options request and its verification.                                                                                                |
| `google_account` | The one connected Google account: its email and refresh token.                                                                                                          |

The ticket token is a key of its own. Anyone with the link can see and cancel
the ticket, with or without an account. Session tokens and codes are stored as
their SHA-256 only.

## Files

| Path                                                            | Holds                                                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/worker/app.tsx`](../src/worker/app.tsx)                   | The session middleware, the headers and the mount of each route module.                                                                                 |
| [`src/worker/routes/`](../src/worker/routes/)                   | One route module per URL area: site, event, share, ticket, profile, certificate, door, sign-in, account.                                                |
| [`src/worker/routes/admin/`](../src/worker/routes/admin/)       | The `/admin` gate and dashboard, settings, editor, one event's pages, its team, and the page frame.                                                     |
| [`src/worker/web.tsx`](../src/worker/web.tsx)                   | The `Env` and `Deps` types, page rendering and work after the response.                                                                                 |
| [`src/worker/db.ts`](../src/worker/db.ts)                       | The `Db` query builder and the table types.                                                                                                             |
| [`src/worker/events.ts`](../src/worker/events.ts)               | The event type and its D1 queries.                                                                                                                      |
| [`src/worker/google/`](../src/worker/google/)                   | Google OAuth, the Calendar API and the connected account.                                                                                               |
| [`src/worker/eventForm.ts`](../src/worker/eventForm.ts)         | The editor's form parsing.                                                                                                                              |
| [`src/worker/questions.ts`](../src/worker/questions.ts)         | The one-per-line question syntax.                                                                                                                       |
| [`src/worker/form.ts`](../src/worker/form.ts)                   | Registration parsing and phone normalization.                                                                                                           |
| [`src/worker/signup.ts`](../src/worker/signup.ts)               | A register post, from the bot checks to the stored registration.                                                                                        |
| [`src/worker/registrations.ts`](../src/worker/registrations.ts) | Seats, the waitlist, cancelling, check-in and reminders of one ticket.                                                                                  |
| [`src/worker/people.ts`](../src/worker/people.ts)               | People by email and their contact details.                                                                                                              |
| [`src/worker/accounts.ts`](../src/worker/accounts.ts)           | Accounts, the email an account proves, and the admin flag.                                                                                              |
| [`src/worker/codes.ts`](../src/worker/codes.ts)                 | Sign-in codes and the new-account token.                                                                                                                |
| [`src/worker/session.ts`](../src/worker/session.ts)             | The session cookie and the return path after sign-in.                                                                                                   |
| [`src/worker/registrants.ts`](../src/worker/registrants.ts)     | An event's registrant list and counts, for the admin.                                                                                                   |
| [`src/worker/shares.ts`](../src/worker/shares.ts)               | The share link of a ticket.                                                                                                                             |
| [`src/worker/profiles.ts`](../src/worker/profiles.ts)           | Public profiles and the events a person attended.                                                                                                       |
| [`src/worker/roles.ts`](../src/worker/roles.ts)                 | The roles at an event, their labels and their D1 queries.                                                                                               |
| [`src/worker/certificates.ts`](../src/worker/certificates.ts)   | Certificates by id and when an event issues them.                                                                                                       |
| [`src/worker/mail.ts`](../src/worker/mail.ts)                   | The emails to ticket holders and their sending.                                                                                                         |
| [`src/worker/whatsapp.ts`](../src/worker/whatsapp.ts)           | The WhatsApp templates and their sending.                                                                                                               |
| [`src/worker/notify.ts`](../src/worker/notify.ts)               | Sends a ticket's email and WhatsApp message together.                                                                                                   |
| [`src/worker/reminders.ts`](../src/worker/reminders.ts)         | The day-before reminders the hourly cron sends.                                                                                                         |
| [`src/worker/auth.ts`](../src/worker/auth.ts)                   | Passkey, session and challenge queries.                                                                                                                 |
| [`src/worker/passkeys.ts`](../src/worker/passkeys.ts)           | WebAuthn options and verification.                                                                                                                      |
| [`src/worker/tokens.ts`](../src/worker/tokens.ts)               | Random tokens and their hashes.                                                                                                                         |
| [`src/worker/csv.ts`](../src/worker/csv.ts)                     | The registrants export.                                                                                                                                 |
| [`src/worker/calendar.ts`](../src/worker/calendar.ts)           | Google Calendar links and `.ics` files.                                                                                                                 |
| [`src/worker/geo.ts`](../src/worker/geo.ts)                     | Venue points from coordinates and map links.                                                                                                            |
| [`src/worker/time.ts`](../src/worker/time.ts)                   | Dates in Lima time, es-PE.                                                                                                                              |
| [`src/worker/card.tsx`](../src/worker/card.tsx)                 | The share card and its PNG rendering.                                                                                                                   |
| [`src/worker/cardAssets.ts`](../src/worker/cardAssets.ts)       | The card's WebAssembly modules and fonts, bundled into the Worker.                                                                                      |
| [`src/worker/fonts/`](../src/worker/fonts/)                     | The card's Geist fonts without kerning.                                                                                                                 |
| [`scripts/card-fonts.sh`](../scripts/card-fonts.sh)             | Writes those fonts from `@fontsource/geist`.                                                                                                            |
| [`src/pages/`](../src/pages/)                                   | The page components, each with its stylesheet and, for a public page, its `.view.ts` view model; [`admin/`](../src/pages/admin/) holds the admin pages. |
| [`src/client/`](../src/client/)                                 | The shared stylesheet, `global.css`, and the client scripts.                                                                                            |
| [`scripts/admin-grant.ts`](../scripts/admin-grant.ts)           | Makes an account the first admin.                                                                                                                       |

[`vite.config.ts`](../vite.config.ts) builds the client to
`/assets/client-<build>.css`, `/assets/client-<build>.js`,
`/assets/admin-<build>.css` and `/assets/passkey-<build>.js`, and passes the
build stamp to the layout as `BUILD_ID`. [`public/_headers`](../public/_headers)
caches `/assets/` for a year.
