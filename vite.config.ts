import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
