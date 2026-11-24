import { cloudflare } from "@cloudflare/vite-plugin";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// The Worker renders every page. The client build is one stylesheet and one
// script under fixed names, so the Worker can link them without a manifest;
// the asset server revalidates them by ETag.
export default defineConfig({
  plugins: [preact({ prefreshEnabled: false }), cloudflare()],
  environments: {
    client: {
      build: {
        rolldownOptions: {
          input: {
            client: "src/client/main.ts",
            admin: "src/client/admin.ts",
          },
          output: {
            entryFileNames: "assets/[name].js",
            assetFileNames: (asset) =>
              asset.names.some((n) => n.endsWith(".css"))
                ? "assets/[name].css"
                : "assets/[name]-[hash][extname]",
          },
        },
      },
    },
  },
});
