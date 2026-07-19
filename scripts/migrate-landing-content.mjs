#!/usr/bin/env node
// One-shot migration: reads national/landing SEO data from
// zymo-backend/functions/seo/landingContent.js + metaConfigs.js and emits one
// markdown file per landing at src/content/national/{slug}.md.
//
// Landing pages (6 slugs with generators — earn-from-your-car deferred to
// partner migration; monthly + airport variants redirect at parse-time):
//   - self-drive-car-rental-india
//   - cheap-car-rental-india
//   - car-rental-without-deposit
//   - suv-rental-india
//   - car-rental-app
//   - zoomcar-car-rental

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZYMO_BACKEND = path.resolve(__dirname, '../../zymo-backend/functions/seo');
const OUT_DIR = path.resolve(__dirname, '../src/content/national');

const LANDING_SLUGS = [
  'self-drive-car-rental-india',
  'cheap-car-rental-india',
  'car-rental-without-deposit',
  'suv-rental-india',
  'car-rental-app',
  'zoomcar-car-rental',
];

// Same YAML helpers as the other migration scripts.
function toYamlValue(v, indent = 0) {
  const pad = '  '.repeat(indent);
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (v.length > 200 || v.includes('\n')) {
      const lines = v.replace(/\r\n/g, '\n').split('\n');
      return `|\n${lines.map((l) => `${pad}  ${l}`).join('\n')}`;
    }
    const escaped = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return '\n' + v.map((item) => `${pad}- ${toYamlValue(item, indent + 1)}`).join('\n');
  }
  if (typeof v === 'object') {
    return '\n' + Object.entries(v).map(([k, vv]) =>
      `${pad}${k}: ${toYamlValue(vv, indent + 1)}`
    ).join('\n');
  }
  return String(v);
}

function toFrontMatter(obj) {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${toYamlValue(v, 1)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

async function main() {
  const args = process.argv.slice(2);

  const { generateLandingPageContentHtml } = require(path.join(ZYMO_BACKEND, 'landingContent.js'));
  const metaConfigs = require(path.join(ZYMO_BACKEND, 'metaConfigs.js'));
  const { getLandingPageMeta } = metaConfigs;

  const slugs = args.length > 0 ? args.filter((s) => LANDING_SLUGS.includes(s)) : LANDING_SLUGS;
  await fs.mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const slug of slugs) {
    const meta = getLandingPageMeta(slug);
    const bodyHtml = generateLandingPageContentHtml(slug);
    if (!bodyHtml) {
      console.warn(`[skip] ${slug} — generator returned empty`);
      continue;
    }

    const frontMatter = {
      slug,
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical || `https://zymo.app/${slug}`,
      heroImage: meta.og?.image || 'https://zymo.app/AppLogo/zymo-logo.png',
      intro: '',              // reserved — extracted in a follow-up refinement
      body: bodyHtml,
    };

    const outFile = path.join(OUT_DIR, `${slug}.md`);
    await fs.writeFile(outFile, toFrontMatter(frontMatter) + '\n', 'utf8');
    console.log(`[write] ${outFile}`);
    written++;
  }
  console.log(`\nMigrated ${written}/${slugs.length} landings → ${OUT_DIR}`);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
