#!/usr/bin/env node
// Migrates the 2 research pages from
// zymo-backend/functions/seo/researchContent.js RESEARCH_GENERATORS.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZYMO_BACKEND = path.resolve(__dirname, '../../zymo-backend/functions/seo');
const OUT_DIR = path.resolve(__dirname, '../src/content/research');

function toYaml(v) {
  if (typeof v !== 'string') return JSON.stringify(v);
  if (v.length > 200 || v.includes('\n')) {
    return `|\n${v.split('\n').map((l) => `  ${l}`).join('\n')}`;
  }
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const RESEARCH_META = {
  'state-of-self-drive-india-2026': {
    title: 'State of Self-Drive India 2026 — Research Report | Zymo',
    description: 'Complete 2026 research report on India\'s self-drive car rental market — trends, city penetration, demand shifts, competitive landscape. Free PDF download.',
  },
  'why-a-short-test-drive-isnt-enough-india': {
    title: 'Why a 30-Minute Test Drive Isn\'t Enough — Research | Zymo',
    description: 'Research report on India\'s car-buying decision quality: why the standard 30-minute test drive fails, and how an Extended Test Drive changes buying outcomes.',
  },
};

async function main() {
  const { getResearchSlugs, generateResearchContentHtml } =
    require(path.join(ZYMO_BACKEND, 'researchContent.js'));

  await fs.mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const slug of getResearchSlugs()) {
    const bodyHtml = generateResearchContentHtml(slug);
    if (!bodyHtml) continue;
    const meta = RESEARCH_META[slug] || { title: slug, description: '' };
    const front = `---
slug: "${slug}"
title: ${toYaml(meta.title)}
description: ${toYaml(meta.description)}
canonical: "https://zymo.app/research/${slug}"
bodyHtml: ${toYaml(bodyHtml)}
---\n\n`;
    await fs.writeFile(path.join(OUT_DIR, `${slug}.md`), front, 'utf8');
    written++;
  }
  console.log(`Migrated ${written}/${getResearchSlugs().length} research pages`);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
