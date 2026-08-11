import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // registered manually in main.jsx so we can surface update/offline UI
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "InventoryIQ — AI Inventory Counting",
        short_name: "InventoryIQ",
        description: "AI-powered photo-based inventory counting for foodservice operations. Part of the FoodSafeIQ family.",
        theme_color: "#0d1b2a",
        background_color: "#0d1b2a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell (JS/CSS/HTML/fonts/icons) is precached so the app opens and navigates
        // between screens with zero network -- camera capture and locally-queued counts keep
        // working in a walk-in with no signal.
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // GET /api/* (catalog, last-count, inventory-metrics, flagged-items): serve
            // fresh data when online, fall back to the last-seen response when offline so
            // screens still render (slightly stale) instead of blank/erroring.
            urlPattern: ({ url, request }) => url.pathname.startsWith("/api/") && request.method === "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-get-cache",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Never cache writes/analysis -- these must hit the network or fail fast so the
            // app can hand them to the offline capture queue instead of returning stale data.
            urlPattern: ({ url, request }) => url.pathname.startsWith("/api/") && request.method !== "GET",
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
