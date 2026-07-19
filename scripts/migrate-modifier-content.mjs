#!/usr/bin/env node
// One-shot migration: generates one markdown file per (modifier, citySlug)
// pair. 4 modifiers × 52 cities = 208 potential entries; empty generator
// outputs are skipped.
//
// Source: zymo-backend/functions/seo/modifierConfigs.js
//   - MODIFIER_CONFIGS[modifier] — per-modifier title/description/h1/faqs/...
//   - generateModifierContentHtml(modifier, citySlug) — raw HTML body
//   - getModifierCityMeta(modifier, citySlug) — title/description/canonical/OG

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZYMO_BACKEND = path.resolve(__dirname, '../../zymo-backend/functions/seo');
const CITIES_DIR = path.resolve(__dirname, '../src/content/cities');
const OUT_DIR = path.resolve(__dirname, '../src/content/modifiers');

const MODIFIER_SLUGS = ['cheap', 'airport', 'weekend', 'monthly'];

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
    return '\n' + v.map((item) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        return `${pad}- ${toYamlValue(item, indent + 1)}`;
      }
      const keys = Object.entries(item);
      const first = keys[0];
      const rest = keys.slice(1);
      return `${pad}- ${first[0]}: ${toYamlValue(first[1], indent + 2)}\n` +
        rest.map(([k, vv]) => `${pad}  ${k}: ${toYamlValue(vv, indent + 2)}`).join('\n');
    }).join('\n');
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

async function listCitySlugs() {
  const files = await fs.readdir(CITIES_DIR);
  return files
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

async function main() {
  const args = process.argv.slice(2);
  const {
    MODIFIER_CONFIGS,
    getModifierCityMeta,
    generateModifierContentHtml,
  } = require(path.join(ZYMO_BACKEND, 'modifierConfigs.js'));

  const cities = await listCitySlugs();
  const modifiers = args.filter((s) => MODIFIER_SLUGS.includes(s));
  const modifiersToRun = modifiers.length > 0 ? modifiers : MODIFIER_SLUGS;

  await fs.mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;
  for (const modifier of modifiersToRun) {
    const config = MODIFIER_CONFIGS[modifier];
    if (!config) continue;
    for (const citySlug of cities) {
      const bodyHtml = generateModifierContentHtml(modifier, citySlug);
      if (!bodyHtml) { skipped++; continue; }
      const meta = getModifierCityMeta(modifier, citySlug);
      const frontMatter = {
        modifierSlug: modifier,
        citySlug,
        title: meta.title,
        description: meta.description,
        canonical: meta.canonical,
        intro: '',
        bodyHtml,
        faqs: (config.faqs ? config.faqs(citySlugToDisplay(citySlug)) : []),
      };
      const outFile = path.join(OUT_DIR, `${modifier}-${citySlug}.md`);
      await fs.writeFile(outFile, toFrontMatter(frontMatter) + '\n', 'utf8');
      written++;
    }
  }
  console.log(`Migrated ${written}, skipped ${skipped} (empty generator output) → ${OUT_DIR}`);
}

function citySlugToDisplay(slug) {
  return slug.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
