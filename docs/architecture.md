# Architecture

up is one Cloudflare Worker. It renders every page with Preact on the server and
answers every form with a redirect or a re-rendered page, so the site works
without JavaScript. The client script only confirms a cancellation, blocks a
second submit and copies the ticket link.

## A registration, from form to ticket

1. `POST /<slug>` reaches the Hono app built by `createApp` in
   [`src/worker/app.tsx`](../src/worker/app.tsx). The deployed Worker,
   [`src/worker/index.tsx`](../src/worker/index.tsx), builds it from the events
   in [`src/events/index.ts`](../src/events/index.ts).
2. The route finds the event by slug. An ended event answers 410. A filled
   `website` trap field redirects back to the event and stores nothing.
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

## Data

An event is code: an `EventEntry` in [`src/events/`](../src/events/) holds the
metadata and a Preact component for the description. D1 holds the people and
their registrations; [`migrations/`](../migrations/) holds the schema.

| Table           | Row                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `people`        | One email, with the latest name and phone, and the consent dates.                                  |
| `registrations` | One person at one event: the ticket token as `id`, the number, the status and the answers as JSON. |

The ticket token is the registrant's only key. Anyone with the link can see and
cancel the ticket, and there are no accounts.

## Files

| Path                                                            | Holds                                   |
| --------------------------------------------------------------- | --------------------------------------- |
| [`src/worker/app.tsx`](../src/worker/app.tsx)                   | Routes, headers and page rendering.     |
| [`src/worker/form.ts`](../src/worker/form.ts)                   | Form parsing and phone normalization.   |
| [`src/worker/registrations.ts`](../src/worker/registrations.ts) | Every D1 query.                         |
| [`src/worker/calendar.ts`](../src/worker/calendar.ts)           | Google Calendar links and `.ics` files. |
| [`src/worker/time.ts`](../src/worker/time.ts)                   | Dates in Lima time, es-PE.              |
| [`src/pages/`](../src/pages/)                                   | The page components.                    |
| [`src/client/`](../src/client/)                                 | The stylesheet and the client script.   |
| [`src/events/`](../src/events/)                                 | One file per event.                     |

[`vite.config.ts`](../vite.config.ts) builds the client to `/assets/client.css`
and `/assets/client.js`, the names the layout links.
