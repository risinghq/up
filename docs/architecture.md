# Architecture

up is one Cloudflare Worker. It renders every page with Preact on the server and
answers every form with a redirect or a re-rendered page, so the site works
without JavaScript. The one exception is the admin passkey ceremony, which needs
the browser's WebAuthn API.

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
4. `register` in [`src/worker/registrations.ts`](../src/worker/registrations.ts)
   upserts the person by email, then inserts the registration with a fresh
   ticket token and the next number. Past the event's capacity the status is
   `waitlist`. An email that already holds a live ticket gets `exists`, and the
   route answers 409 without the ticket link.
5. The route redirects with 303 to `/entrada/<token>?nueva`. The ticket route
   looks the token up with `findTicket` and renders
   [`src/pages/Ticket.tsx`](../src/pages/Ticket.tsx).

`POST /entrada/<token>/cancelar` calls `cancel`, which marks the registration
`cancelled` and moves the oldest waitlisted registration to `going` when a seat
frees.

## An edit, from editor to page

1. Every request passes a middleware in `createApp` that reads the `up_admin`
   cookie and looks up its session with `sessionAdmin` in
   [`src/worker/auth.ts`](../src/worker/auth.ts).
2. `adminRoutes` in [`src/worker/admin.tsx`](../src/worker/admin.tsx) serves
   `/admin`. Without a session, a GET redirects to `/admin/entrar` and a POST
   answers 403. A form post whose `Origin` is not `SITE_URL` is refused.
3. `POST /admin/eventos/<slug>` reads the editor with `parseEventForm` in
   [`src/worker/eventForm.ts`](../src/worker/eventForm.ts). It turns Lima
   datetimes into ISO, the questions text into `Question[]` with
   [`src/worker/questions.ts`](../src/worker/questions.ts) and the theme fields
   into a `Theme`.
4. A new cover goes to R2 under `covers/`, and the old one is deleted after the
   save. `saveEvent` writes the row and clears `featured` on every other event.
   `fillSeats` seats the waitlist when the capacity rose.
5. The event page renders the theme with
   [`src/pages/theme.ts`](../src/pages/theme.ts): the accent and its readable
   ink as CSS variables, and the kind and backdrop as classes.

Sign-in uses passkeys through
[`src/worker/passkeys.ts`](../src/worker/passkeys.ts). The server stores each
challenge in D1 and takes it once.
[`src/client/admin.ts`](../src/client/admin.ts) runs the ceremony in the
browser, and it loads only on the sign-in and invite pages.

## Data

D1 holds everything but the covers; [`migrations/`](../migrations/) holds the
schema.

| Table           | Row                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `events`        | One event: its text, dates, place, capacity, questions as JSON, status and theme.                  |
| `people`        | One email, with the latest name and phone, and the consent dates.                                  |
| `registrations` | One person at one event: the ticket token as `id`, the number, the status and the answers as JSON. |
| `admins`        | One admin's name.                                                                                  |
| `credentials`   | One passkey of one admin.                                                                          |
| `invites`       | One admin invite, by token hash, until it is used or expires.                                      |
| `sessions`      | One signed-in browser, by token hash.                                                              |
| `challenges`    | One WebAuthn challenge between its options request and its verification.                           |

The ticket token is the registrant's only key. Anyone with the link can see and
cancel the ticket, and registrants have no accounts. Invite and session tokens
are stored as their SHA-256 only.

## Files

| Path                                                            | Holds                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`src/worker/app.tsx`](../src/worker/app.tsx)                   | Public routes, headers and the session middleware.                          |
| [`src/worker/admin.tsx`](../src/worker/admin.tsx)               | The `/admin` routes.                                                        |
| [`src/worker/web.tsx`](../src/worker/web.tsx)                   | The `Env` type and page rendering.                                          |
| [`src/worker/events.ts`](../src/worker/events.ts)               | The event type and its D1 queries.                                          |
| [`src/worker/eventForm.ts`](../src/worker/eventForm.ts)         | The editor's form parsing.                                                  |
| [`src/worker/questions.ts`](../src/worker/questions.ts)         | The one-per-line question syntax.                                           |
| [`src/worker/form.ts`](../src/worker/form.ts)                   | Registration parsing and phone normalization.                               |
| [`src/worker/registrations.ts`](../src/worker/registrations.ts) | People and registration queries.                                            |
| [`src/worker/auth.ts`](../src/worker/auth.ts)                   | Admin, invite, session and challenge queries.                               |
| [`src/worker/passkeys.ts`](../src/worker/passkeys.ts)           | WebAuthn options and verification.                                          |
| [`src/worker/tokens.ts`](../src/worker/tokens.ts)               | Random tokens and their hashes.                                             |
| [`src/worker/csv.ts`](../src/worker/csv.ts)                     | The registrants export.                                                     |
| [`src/worker/calendar.ts`](../src/worker/calendar.ts)           | Google Calendar links and `.ics` files.                                     |
| [`src/worker/time.ts`](../src/worker/time.ts)                   | Dates in Lima time, es-PE.                                                  |
| [`src/pages/`](../src/pages/)                                   | The page components; [`admin/`](../src/pages/admin/) holds the admin pages. |
| [`src/client/`](../src/client/)                                 | The stylesheet and the two client scripts.                                  |
| [`scripts/admin-invite.ts`](../scripts/admin-invite.ts)         | The first-admin invite.                                                     |

[`vite.config.ts`](../vite.config.ts) builds the client to `/assets/client.css`,
`/assets/client.js` and `/assets/admin.js`, the names the layout links.
