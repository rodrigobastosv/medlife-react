import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    /*
      PWA — installable app plus an offline shell.

      `registerType: 'prompt'` is the whole design decision here. The tempting
      alternative, `autoUpdate`, swaps the running bundle for a new one the
      moment a deploy lands; the user is left mid-form on a screen whose code no
      longer exists, and the reload eats what they typed. This app is used
      during appointments, so a silent reload is a real cost. Instead the new
      worker waits, and `<PwaUpdatePrompt>` asks.
    */
    VitePWA({
      registerType: 'prompt',
      // No `includeAssets`: the `globPatterns` below already sweep `public/`,
      // and listing a file in both puts it in the precache manifest twice.
      manifest: {
        name: 'MedLife — acompanhamento de pacientes',
        // What actually shows under the launcher icon. Anything past ~12
        // characters is truncated with an ellipsis on Android, so this is the
        // brand alone, not a shortened sentence.
        short_name: 'MedLife',
        description: 'Acompanhamento de pacientes e consultas.',
        lang: 'pt-BR',
        dir: 'ltr',
        // `standalone` drops the browser chrome. `start_url` and `scope` are the
        // root because every screen lives under it and the router owns the
        // whole path space — a narrower scope would make deep links open in the
        // browser instead of in the installed app.
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Never `portrait`: the app is used on desktop and on tablets in
        // landscape, and `MLBreakpoints` already answers layout by width.
        orientation: 'any',
        theme_color: '#0E7C86',
        // The splash behind the icon while the shell boots. It is the light
        // surface token rather than the brand teal so the transition into the
        // app is a change of content, not a flash of a different colour.
        background_color: '#FAFBFB',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Separate entry, not `purpose: 'any maskable'`: a single icon
          // declared as both is drawn full-bleed *and* cropped, and one of the
          // two always looks wrong. See the comment in `icon-maskable.svg`.
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          // The vector, for launchers that prefer it at arbitrary sizes.
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // A deep link fetched offline has no server to rewrite it, so the
        // worker plays the role Firebase Hosting plays online: serve the shell
        // and let the router read the URL.
        navigateFallback: '/index.html',
        // Old precaches are dead weight after a deploy, and Safari's storage
        // budget is small enough for that to matter.
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          /*
            Only the fonts. Supabase is deliberately absent from this list:
            everything it returns is either a session token or a patient's
            data, and a cache is a copy that outlives the sign-out that was
            supposed to remove it. Anything not matched here goes to the
            network, which is the correct default for this app — TanStack Query
            already holds the in-memory copy, scoped to the session.
          */
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            // The stylesheet, not the fonts: Google rotates the URLs inside it,
            // so a cached copy is used immediately and refreshed in the
            // background.
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            // The font files themselves are immutable and content-addressed;
            // going to the network for them would only ever be slower.
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              // Opaque cross-origin responses have status 0; without this they
              // are treated as failures and never stored.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Off in `npm run dev`. A service worker serving a precached shell
        // fights HMR, and the resulting "why is my edit not showing" is a much
        // longer debugging session than it looks. Flip this temporarily to
        // exercise the update prompt locally.
        enabled: false,
        // `/preview.html` is a second entry point with no bundle of its own in
        // production; keeping the fallback out of its way matters only while
        // `enabled` above is true.
        navigateFallback: '/index.html',
      },
    }),
  ],
  resolve: {
    // `@/domain/...` instead of `../../../domain/...`. The same alias is
    // declared in tsconfig.app.json — Vite resolves it at build time, TypeScript
    // at type-check time, and the two have to agree.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Fixed port, for the same reason the Flutter app pins 3000: Supabase only
    // redirects the e-mail confirmation link to URLs on its allow-list, and a
    // random port is never on it.
    port: 3000,
    strictPort: true,
  },
});
