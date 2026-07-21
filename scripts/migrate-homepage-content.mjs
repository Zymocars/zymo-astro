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
import yaml from 'js-yaml';

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
  const metaConfigs = require(path.join(ZYMO_BACKEND, 'metaConfigs.js'));

  await fs.mkdir(OUT_DIR, { recursive: true });
  const bodyHtml = generateHomepageContentHtml();
  const meta = metaConfigs.getHomepageMeta();

  // Pull full schema stack from backend to match prod homepage rich-result
  // eligibility (Question x16, Answer x16, HowToStep x4, MobileApplication x2
  // with AggregateRating x2, WebSite SearchAction).
  const schemas = [];
  try {
    if (typeof metaConfigs.getHomepageFAQSchema === 'function') {
      const faq = metaConfigs.getHomepageFAQSchema();
      if (faq) schemas.push(faq);
    }
    if (typeof metaConfigs.getRentalHowToSchema === 'function') {
      const howTo = metaConfigs.getRentalHowToSchema();
      if (howTo) schemas.push(howTo);
    }
    if (typeof metaConfigs.getWebSiteSchema === 'function') {
      const website = metaConfigs.getWebSiteSchema();
      if (website) schemas.push(website);
    }
    if (typeof metaConfigs.getMobileAppSchema === 'function') {
      const mobileApps = metaConfigs.getMobileAppSchema();
      if (Array.isArray(mobileApps)) schemas.push(...mobileApps);
      else if (mobileApps) schemas.push(mobileApps);
    }
  } catch (e) {
    console.warn(`[warn] homepage schema fetch failed: ${e.message}`);
  }

  const frontMatter = {
    slug: 'index',
    title: meta.title,
    description: meta.description,
    canonical: meta.canonical || 'https://zymo.app/',
    bodyHtml,
    schemas,
  };
  const body = yaml.dump(frontMatter, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false });
  await fs.writeFile(path.join(OUT_DIR, 'index.md'), `---\n${body}---\n\n`, 'utf8');
  console.log(`Migrated homepage → ${OUT_DIR}/index.md (${bodyHtml.length} bytes body, ${schemas.length} schemas)`);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
