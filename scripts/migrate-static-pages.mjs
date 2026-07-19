#!/usr/bin/env node
// Migrates the static internal pages from
// zymo-backend/functions/seo/internalContent.js generateInternalPageContentHtml
// + zymo-backend/functions/seo/metaConfigs.js INTERNAL_PAGE_CONFIGS.
//
// Migrated slugs (pages that are truly static and NOT interactive React-SPA
// booking/user flows). Skipped explicitly:
//   - buy-car, extended-test-drive, cars (React SPA booking flow, plan
//     non-goal)
//   - career (interactive job-app flow)
//   - blogs, cities, car-types, travel-guides (already migrated in Phase 3.7)

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZYMO_BACKEND = path.resolve(__dirname, '../../zymo-backend/functions/seo');
const OUT_DIR = path.resolve(__dirname, '../src/content/static-pages');

const STATIC_SLUGS = [
  'about-us',
  'contact-us',
  'faqs',
  'terms-of-service',
  'privacy-policy',
  'cancellation-policy',
  'car-loan',
  'download-app',
  'electric-car-rental-india',
  'founder',
  'press',
];

function toYaml(v) {
  if (typeof v !== 'string') return JSON.stringify(v);
  if (v.length > 200 || v.includes('\n')) {
    return `|\n${v.split('\n').map((l) => `  ${l}`).join('\n')}`;
  }
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function main() {
  const { generateInternalPageContentHtml } = require(path.join(ZYMO_BACKEND, 'internalContent.js'));
  const { getInternalPageMeta } = require(path.join(ZYMO_BACKEND, 'metaConfigs.js'));

  await fs.mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;
  for (const slug of STATIC_SLUGS) {
    let bodyHtml = generateInternalPageContentHtml(slug);
    // founder + press aren't in the switch above — internalContent handles
    // them via separate exports or config. Check + emit an empty body if
    // missing (SSR meta still ranks the page on the meta config alone).
    if (!bodyHtml) {
      // If no generator matches, skip — leaves the slug for Phase 4 follow-up.
      console.warn(`[skip] ${slug} — generator empty (add generator or hand-write content in Phase 4 follow-up)`);
      skipped++;
      continue;
    }
    const meta = getInternalPageMeta(slug);
    const canonical = `https://zymo.app/${slug}`;
    const front = `---
slug: "${slug}"
title: ${toYaml(meta.title)}
description: ${toYaml(meta.description)}
canonical: "${canonical}"
bodyHtml: ${toYaml(bodyHtml)}
---\n\n`;
    await fs.writeFile(path.join(OUT_DIR, `${slug}.md`), front, 'utf8');
    written++;
  }
  console.log(`Migrated ${written}, skipped ${skipped} → ${OUT_DIR}`);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
