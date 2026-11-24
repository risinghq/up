// Creates a one-time admin invite and prints its link. The first admin needs
// this: every later invite comes from the dashboard.
//
//   bun run admin:invite --name David            local D1, localhost link
//   bun run admin:invite --name David --remote   production D1 and link

import { parseArgs } from "node:util";
import { INVITE_DAYS } from "../src/worker/auth";
import { hashToken, newToken } from "../src/worker/tokens";
import wrangler from "../wrangler.jsonc";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    remote: { type: "boolean", default: false },
  },
});

const name = values.name?.trim() ?? "";
if (!name || name.length > 60) {
  console.error("usage: bun run admin:invite --name <1-60 chars> [--remote]");
  process.exit(2);
}

const token = newToken();
const now = new Date();
const expires = new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
const sql = `INSERT INTO invites (token_hash, name, created_at, expires_at) VALUES (${[
  await hashToken(token),
  name,
  now.toISOString(),
  expires.toISOString(),
]
  .map(quote)
  .join(", ")})`;

const run = Bun.spawnSync(
  [
    "bunx",
    "wrangler",
    "d1",
    "execute",
    "up",
    values.remote ? "--remote" : "--local",
    "--command",
    sql,
  ],
  { stdout: "ignore", stderr: "inherit" },
);
if (run.exitCode !== 0) process.exit(run.exitCode ?? 1);

const localSite = /^SITE_URL=(.+)$/m.exec(
  await Bun.file(new URL("../.dev.vars", import.meta.url)).text(),
)?.[1];
const site = values.remote ? wrangler.vars.SITE_URL : localSite;
console.log(`${site}/admin/invitacion/${token}`);
console.log(`One use, expires ${expires.toISOString()}.`);
