#!/usr/bin/env node
// Migrates the homepage content from
// zymo-backend/functions/seo/homeContent.js generateHomepageContentHtml
// + metaConfigs.js getHomepageMeta into src/content/homepage.md.
//
// Homepage is a single content entry (not a collection); Astro's index.astro
// reads it via getEntry('homepage', 'index').

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZYMO_BACKEND = path.resolve(__dirname, '../../zymo-backend/functions/seo');
const OUT_DIR = path.resolve(__dirname, '../src/content/homepage');

function toYaml(v) {
  if (typeof v !== 'string') return JSON.stringify(v);
  if (v.length > 200 || v.includes('\n')) {
    return `|\n${v.split('\n').map((l) => `  ${l}`).join('\n')}`;
  }
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function main() {
  const { generateHomepageContentHtml } = require(path.join(ZYMO_BACKEND, 'homeContent.js'));
  const { getHomepageMeta } = require(path.join(ZYMO_BACKEND, 'metaConfigs.js'));

  await fs.mkdir(OUT_DIR, { recursive: true });
  const bodyHtml = generateHomepageContentHtml();
  const meta = getHomepageMeta();

  const front = `---
slug: "index"
title: ${toYaml(meta.title)}
description: ${toYaml(meta.description)}
canonical: "${meta.canonical || 'https://zymo.app/'}"
bodyHtml: ${toYaml(bodyHtml)}
---\n\n`;
  await fs.writeFile(path.join(OUT_DIR, 'index.md'), front, 'utf8');
  console.log(`Migrated homepage → ${OUT_DIR}/index.md (${bodyHtml.length} bytes body)`);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
