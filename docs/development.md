# Development

[`mise.toml`](../mise.toml) pins bun and node.

```sh
bun install
bun run db:migrate:local   # creates the local D1 under .wrangler/
bun run dev                # http://localhost:5173
```

| Command           | Does                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `bun run dev`     | The Vite dev server, with the Worker in workerd and the local D1. |
| `bun run check`   | Lint, format check, typecheck, tests and build. CI runs it.       |
| `bun run test`    | The tests in `tests/`, against a migrated D1 in Miniflare.        |
| `bun run fix`     | Format every file with oxfmt.                                     |
| `bun run build`   | Build the Worker and the client into `dist/`.                     |
| `bun run preview` | Serve the build locally.                                          |

[`.dev.vars`](../.dev.vars) sets the local [configuration](configuration.md).

## Tests

[`tests/app.test.ts`](../tests/app.test.ts) sends requests to the app against a
migrated D1. It builds the app with `createApp(events, { now })`, so its events
are fixtures and the clock is fixed. [`tests/support.tsx`](../tests/support.tsx)
holds the D1 setup, the fixture event and the form builder.

## Database changes

Add the next numbered SQL file to [`migrations/`](../migrations/), then run
`bun run db:migrate:local`. A deploy applies it to production before the new
Worker goes live.
