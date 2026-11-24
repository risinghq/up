# Deploy

A push to `master` deploys. [`deploy.yml`](../.github/workflows/deploy.yml) runs
`bun run check`, applies new migrations to the production D1 and deploys the
Worker to `up.rising.sh`. [`pr.yml`](../.github/workflows/pr.yml) runs
`bun run check` on every pull request.

The deploy reads the repository secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`.

## By hand

With `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment:

```sh
bun run db:migrate:remote
bun run deploy
```

## A new account

The D1 database `up` and the R2 bucket `up-media` must exist before the first
deploy. [`wrangler.jsonc`](../wrangler.jsonc) names both.

```sh
bunx wrangler d1 create up
bunx wrangler r2 bucket create up-media
```

Put the new database id in `wrangler.jsonc`, deploy, then create the
[first admin](admins.md#the-first-admin).
