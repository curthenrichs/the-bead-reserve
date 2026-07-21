import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Static site (Cloudflare Pages). The API is a separate Worker reached at
// /api/* — same-origin in prod via a Cloudflare route, proxied in dev.
export default defineConfig({
  integrations: [react()],
  output: "static",
  vite: {
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:8787", // local `wrangler dev` in ../service
          changeOrigin: true,
        },
      },
    },
  },
});
