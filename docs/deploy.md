# Deploy

A push to `master` deploys. [`deploy.yml`](../.github/workflows/deploy.yml) runs
`bun run check`, applies new migrations to the production D1 and deploys the
Worker to `up.rising.sh`. [`pr.yml`](../.github/workflows/pr.yml) runs
`bun run check` on every pull request.

Both read the repository secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`.

## By hand

With `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment:

```sh
bun run db:migrate:remote
bun run deploy
```

## Read the registrations

```sh
bunx wrangler d1 execute up --remote --command \
  "SELECT r.number, r.status, p.name, p.email, p.phone, r.answers
   FROM registrations r JOIN people p ON p.id = r.person_id
   WHERE r.event_slug = 'ejemplo' ORDER BY r.number"
```
