# Agents

Read [docs/architecture.md](docs/architecture.md) for the code map and
[docs/development.md](docs/development.md) for the commands.

- Run `bun run check` before you call a change done.
- User-facing text is Spanish (Peru). Code, comments and docs are English.
- A schema change is a new file in `migrations/`. Never edit an applied one.
- Keep every page working without JavaScript: forms post and the Worker answers
  with a redirect or a rendered page. The passkey pages are the one exception.
- A new route or form rule gets a test in `tests/app.test.ts`, or in
  `tests/admin.test.ts` for `/admin`.
