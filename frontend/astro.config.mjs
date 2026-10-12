import node from "@astrojs/node";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Server-rendered Astro as a standalone Node server (Docker Compose).
// Interactive parts are Svelte islands (client:load / client:visible) that
// talk to Solana RPC directly from the browser; all `/api/*` traffic is
// proxied 1:1 to the backend (see src/pages/api/[...path].ts).
export default defineConfig({
  adapter: node({ mode: "standalone", host: "0.0.0.0", port: 4321 }),
  integrations: [svelte()],
  output: "server",
  vite: {
    plugins: [tailwindcss()],
  },
});
