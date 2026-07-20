// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
// Partytown removed 2026-07-20 — Worker init added 1.5s of main-thread
// interception overhead per Lighthouse audit. Replaced with plain
// interaction-defer for gtag in Base.astro.
export default defineConfig({
  site: 'https://zymo.app',
  // Match firebase.json "trailingSlash": false — emit sitemap URLs without
  // trailing slash so Google isn't chased through a 301 chain from the sitemap.
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    react(),
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
    }),
  ],
});