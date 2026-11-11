/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "shield-alert.svg",
        "apple-touch-icon.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "maskable-icon-512x512.png",
      ],
      manifest: {
        name: "IncidentZero Corp.",
        short_name: "IncidentZero",
        description: "A tycoon simulation of SRE crisis management and IT governance.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/shield-alert.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // precache the built app shell only; every /api and /ws request must always hit the
        // live simulation backend, never a cached response, so no runtime caching is registered
        globPatterns: ["**/*.{js,css,html,svg}"],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // stable, readable chunk names: react itself rarely changes between deploys, so keeping it in
        // its own file lets browsers (and the PWA precache) reuse it, and each lazy locale gets a
        // name instead of another confusing `index-*.js`
        manualChunks(id) {
          const norm = id.split("\\").join("/");
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(norm)) return "vendor-react";
          const locale = /\/src\/i18n\/locales\/([^/]+)\//.exec(norm);
          if (locale) return `locale-${locale[1]}`;
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    css: false,
    // e2e/ holds Playwright specs (a different test API entirely -- @playwright/test's own
    // `test`/`expect`, run via `npm run test:e2e`), not vitest's; without this, vitest's default
    // include glob (`**/*.spec.ts`) picks them up too and fails them against the wrong runner
    exclude: ["e2e/**", "node_modules/**"],
  },
});
