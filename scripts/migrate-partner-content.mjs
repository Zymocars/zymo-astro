#!/usr/bin/env node
// Migrates 3 static partner-acquisition pages from
// zymo-backend/functions/seo/partnerContent.js:
//   /earn-from-your-car   (generateEarnPageContentHtml)
//   /partner              (generatePartnerLandingHtml)
//   /partner/faq          (generatePartnerFAQHtml)
//
// Partner blog listing + posts are Firestore-driven and are deferred to
// Phase 5's nightly refresh workflow.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import yaml from 'js-yaml';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZYMO_BACKEND = path.resolve(__dirname, '../../zymo-backend/functions/seo');
const OUT_DIR = path.resolve(__dirname, '../src/content/partner');

const PARTNER_PAGES = [
  {
    fileSlug: 'earn-from-your-car',
    urlSlug: 'earn-from-your-car',
    kind: 'earn',
    canonical: 'https://zymo.app/earn-from-your-car',
    title: 'Earn ₹9K–₹50K/mo From Your Car — List with Zymo | Zymo Partner',
    description: 'Turn your idle car into monthly income. List with Zymo — India\'s largest self-drive car rental aggregator. Owner keeps 75% of every booking. Weekly payouts.',
    generatorFn: 'generateEarnPageContentHtml',
  },
  {
    fileSlug: 'partner-landing',
    urlSlug: 'partner',
    kind: 'landing',
    canonical: 'https://zymo.app/partner',
    title: 'Become a Zymo Partner | List Your Fleet on India\'s Largest Rental Aggregator',
    description: 'Partner with Zymo — India\'s largest self-drive car rental aggregator across 60+ cities. Get bookings from Zymo\'s customer traffic, keep 75% of every rental. Sign up in minutes.',
    generatorFn: 'generatePartnerLandingHtml',
  },
  {
    fileSlug: 'partner-faq',
    urlSlug: 'partner/faq',
    kind: 'faq',
    canonical: 'https://zymo.app/partner/faq',
    title: 'Partner FAQs | Zymo Fleet & Owner Partnership Questions',
    description: 'Frequently asked questions from Zymo partner-fleet owners: onboarding, payouts, insurance, KYC, damage handling, cancellations. Everything you need before signing up.',
    generatorFn: 'generatePartnerFAQHtml',
  },
];

function toYaml(v) {
  if (typeof v !== 'string') return JSON.stringify(v);
  if (v.length > 200 || v.includes('\n')) {
    return `|\n${v.split('\n').map((l) => `  ${l}`).join('\n')}`;
  }
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function main() {
  const partner = require(path.join(ZYMO_BACKEND, 'partnerContent.js'));
  const metaConfigs = require(path.join(ZYMO_BACKEND, 'metaConfigs.js'));
  await fs.mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const page of PARTNER_PAGES) {
    const fn = partner[page.generatorFn];
    if (typeof fn !== 'function') {
      console.warn(`[skip] ${page.urlSlug} — ${page.generatorFn} is not exported`);
      continue;
    }
    const bodyHtml = fn();
    if (!bodyHtml) {
      console.warn(`[skip] ${page.urlSlug} — generator returned empty`);
      continue;
    }

    // Pull the schema stack from backend based on page kind.
    let schemas = [];
    try {
      if (page.kind === 'faq' && typeof metaConfigs.getPartnerFAQSchema === 'function') {
        const faqSchema = metaConfigs.getPartnerFAQSchema();
        if (faqSchema) schemas.push(faqSchema);
      }
      if ((page.kind === 'landing' || page.kind === 'earn') && typeof metaConfigs.getPartnerHowToSchema === 'function') {
        const howToSchema = metaConfigs.getPartnerHowToSchema();
        if (howToSchema) schemas.push(howToSchema);
      }
    } catch (e) {
      console.warn(`[warn] partner schema fetch failed for ${page.urlSlug}: ${e.message}`);
    }

    const frontMatter = {
      slug: page.fileSlug,
      kind: page.kind,
      title: page.title,
      description: page.description,
      canonical: page.canonical,
      bodyHtml,
      schemas,
    };
    const body = yaml.dump(frontMatter, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false });
    await fs.writeFile(path.join(OUT_DIR, `${page.fileSlug}.md`), `---\n${body}---\n\n`, 'utf8');
    written++;
  }
  console.log(`Migrated ${written}/${PARTNER_PAGES.length} partner pages`);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
