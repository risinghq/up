import { cloudflare } from "@cloudflare/vite-plugin";
import preact from "@preact/preset-vite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";

// The Worker renders every page. The client build is one stylesheet and one
// script named after a hash of the client's inputs, which the Worker reads as
// BUILD_ID, so it can link them without a manifest. Fonts carry the hash too,
// so the page can preload the Geist file before the stylesheet asks for it.
// Every name under /assets changes with its content, so public/_headers caches
// them for a year. Vite evaluates this file once per environment, so the stamp
// must come out the same each time.
const clientInputs = [
  ...readdirSync("src/client", { recursive: true, encoding: "utf8" })
    .map((file) => join("src/client", file))
    .filter((file) => statSync(file).isFile())
    .sort(),
  "bun.lock",
  "vite.config.ts",
];
const stamp = createHash("sha256");
for (const file of clientInputs) stamp.update(file).update(readFileSync(file));
const build = stamp.digest("hex").slice(0, 8);

export default defineConfig({
  plugins: [preact({ prefreshEnabled: false }), cloudflare()],
  define: { "import.meta.env.BUILD_ID": JSON.stringify(build) },
  environments: {
    client: {
      build: {
        rolldownOptions: {
          input: {
            client: "src/client/main.ts",
            admin: "src/client/admin.ts",
          },
          output: {
            entryFileNames: `assets/[name]-${build}.js`,
            assetFileNames: (asset) =>
              asset.names.some((n) => n.endsWith(".css"))
                ? `assets/[name]-${build}.css`
                : asset.names.some((n) => n.endsWith(".woff2"))
                  ? `assets/[name]-${build}[extname]`
                  : "assets/[name]-[hash][extname]",
          },
        },
      },
    },
  },
});
