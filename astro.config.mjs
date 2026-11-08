// @ts-check
import { defineConfig } from 'astro/config';

// SITE_URL: die endgültige Adresse der Seite, z. B. https://stapise.ba
// BASE_PATH: nur nötig, solange die Seite ohne eigene Domain unter
//            https://<name>.github.io/<repo>/ läuft – dann z. B. "/stapise/".
export default defineConfig({
  site: process.env.SITE_URL || 'https://stapise.ba',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { build: { chunkSizeWarningLimit: 1500 } },
});
