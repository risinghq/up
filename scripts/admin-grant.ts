// Makes the account with this email an admin. The first admin needs this:
// every later admin is added from Ajustes. The person signs in at /entrar
// first, so the account exists.
//
//   bun run admin:grant --email ana@example.com            local D1
//   bun run admin:grant --email ana@example.com --remote   production D1

import { parseArgs } from "node:util";
import { emailPattern } from "../src/worker/form";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    remote: { type: "boolean", default: false },
  },
});

const email = values.email?.trim().toLowerCase() ?? "";
if (!emailPattern.test(email) || email.includes("'")) {
  console.error("usage: bun run admin:grant --email <address> [--remote]");
  process.exit(2);
}

const run = Bun.spawnSync(
  [
    "bunx",
    "wrangler",
    "d1",
    "execute",
    "up",
    values.remote ? "--remote" : "--local",
    "--json",
    "--command",
    `UPDATE people SET admin = 1 WHERE email = '${email}' RETURNING id`,
  ],
  { stdout: "pipe", stderr: "inherit" },
);
if (run.exitCode !== 0) process.exit(run.exitCode ?? 1);

// The local D1 reports no `meta.changes`, so the returned rows tell.
const [result] = JSON.parse(run.stdout.toString()) as {
  results: { id: string }[];
}[];
if (!result?.results.length) {
  console.error(`No account has ${email}. Sign in at /entrar first.`);
  process.exit(1);
}
console.log(`${email} is an admin.`);
