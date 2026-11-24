# Development

[`mise.toml`](../mise.toml) pins bun and node.

```sh
bun install
bun run db:migrate:local          # creates the local D1 under .wrangler/
bun run admin:invite --name Ana   # prints a local admin invite link
bun run dev                       # http://localhost:5173
```

Open the invite link, create a passkey and add an event from `/admin`
([Add an event](add-an-event.md)).

| Command                              | Does                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `bun run dev`                        | The Vite dev server, with the Worker in workerd and the local D1 and R2. |
| `bun run check`                      | Lint, format check, typecheck, tests and build. CI runs it.              |
| `bun run test`                       | The tests in `tests/`, against a migrated D1 and R2 in Miniflare.        |
| `bun run fix`                        | Format every file with oxfmt.                                            |
| `bun run build`                      | Build the Worker and the client into `dist/`.                            |
| `bun run preview`                    | Serve the build locally.                                                 |
| `bun run admin:invite --name <name>` | Print a one-use [admin invite](admins.md) for the local D1.              |

[`.dev.vars`](../.dev.vars) sets the local [configuration](configuration.md).

## Tests

[`tests/app.test.ts`](../tests/app.test.ts) covers the public routes and
[`tests/admin.test.ts`](../tests/admin.test.ts) the admin routes. Both send
requests to `createApp({ now })` with a fixed clock.
[`tests/support.tsx`](../tests/support.tsx) holds the migrated D1 and R2, the
event fixture, the seeding and an admin session cookie.
[`tests/authenticator.ts`](../tests/authenticator.ts) is a software passkey that
answers the WebAuthn ceremonies.

## Database changes

Add the next numbered SQL file to [`migrations/`](../migrations/), then run
`bun run db:migrate:local`. A deploy applies it to production before the new
Worker goes live.
