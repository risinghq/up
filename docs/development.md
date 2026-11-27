# Development

[`mise.toml`](../mise.toml) pins bun and node.

```sh
bun install
bun run db:migrate:local          # creates the local D1 under .wrangler/
bun run db:seed                   # events, people, roles and tickets
bun run dev                       # http://localhost:5173
```

The seed runs only on a database without events. Its upcoming events are dated
from the day it runs. It writes to the local D1 alone.

Sign in at `/entrar` as `ana@example.com`, the seeded admin. The local Worker
sends no mail: the dev server prints each message, and the subject starts with
the code. To make another account an admin:

```sh
bun run admin:grant --email luis@example.com
```

| Command                               | Does                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `bun run dev`                         | The Vite dev server, with the Worker in workerd and the local D1 and R2. |
| `bun run check`                       | Lint, format check, typecheck, tests and build. CI runs it.              |
| `bun run test`                        | The tests in `tests/`, against a migrated D1 and R2 in Miniflare.        |
| `bun run fix`                         | Format every file with oxfmt.                                            |
| `bun run build`                       | Build the Worker and the client into `dist/`.                            |
| `bun run preview`                     | Serve the build locally.                                                 |
| `bun run db:seed`                     | Fill an empty local D1 with events, people, roles and tickets.           |
| `bun run admin:grant --email <email>` | Make an account in the local D1 an [admin](admins.md).                   |

[`.dev.vars`](../.dev.vars) sets the local [configuration](configuration.md).

## Tests

The tests check behaviour at three layers, each against a fixed clock:

- [`tests/registrations.test.ts`](../tests/registrations.test.ts) calls the
  domain functions on a migrated D1: seats, the waitlist, cancelling, check-in.
- [`tests/views.test.ts`](../tests/views.test.ts) calls the view models in
  `src/pages/*.view.ts` with plain values, no D1.
- [`tests/app.test.ts`](../tests/app.test.ts) covers the public routes,
  [`tests/admin.test.ts`](../tests/admin.test.ts) the admin routes and
  [`tests/google.test.ts`](../tests/google.test.ts) the Google Calendar link.
  They send requests to `createApp({ now })` and assert the status, the headers
  and the stored rows. [`tests/dom.ts`](../tests/dom.ts) parses a page with
  happy-dom, and the tests query it as a reader would, by role and label, with
  Testing Library.

[`tests/support.tsx`](../tests/support.tsx) holds the migrated D1 and R2, the
event fixture, the seeding, the outbox, and `signedIn`, which makes an account
and returns its session cookie.
[`tests/authenticator.ts`](../tests/authenticator.ts) is a software passkey that
answers the WebAuthn ceremonies.

## Database changes

Add the next numbered SQL file to [`migrations/`](../migrations/), then run
`bun run db:migrate:local`. A deploy applies it to production before the new
Worker goes live. Update the table types in
[`src/worker/db.ts`](../src/worker/db.ts) in the same change: every query reads
them through Kysely.
