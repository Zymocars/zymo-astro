#!/usr/bin/env node
// One-shot migration: reads city SEO data from zymo-backend/functions/seo/cityContent.js
// and emits per-city markdown files at src/content/cities/{slug}.md.
//
// Usage:
//   node scripts/migrate-city-content.mjs [citySlug...]
//   node scripts/migrate-city-content.mjs           # migrates all cities in CITY_SEO_CONTENT
//   node scripts/migrate-city-content.mjs mumbai    # migrates only mumbai
//
// Source of truth: C:/Users/91982/zymo-backend/functions/seo/cityContent.js
// Data structure per city (per cityContent.js:94):
//   { intro, popularAreas, nearbyDestinations, tips, carTypes, whyZymo,
//     howItWorks, priceNote, faqs: [{q, a}] }

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZYMO_BACKEND = path.resolve(__dirname, '../../zymo-backend/functions/seo');
const OUT_DIR = path.resolve(__dirname, '../src/content/cities');

// -----------------------------------------------------------------------------
// Static per-city mapping — display name + hero image + answer-block string.
// These are hard-coded in the generator (cityContent.js:1123-1131 CITY_IMAGES,
// getAnswerBlock in same file). Duplicating the data here avoids importing the
// full render pipeline; we cross-check via CITY_SEO_CONTENT which is authoritative.
// -----------------------------------------------------------------------------
const HERO_IMAGES = {
  mumbai: 'mumbai.webp',
  delhi: 'delhi.webp',
  bangalore: 'bangalore.webp',
  hyderabad: 'hyderabad.webp',
  chennai: 'chennai.webp',
  pune: 'pune.webp',
  kolkata: 'kolkata.webp',
  meerut: 'meerut.webp',
};

const CITY_DISPLAY_NAMES = {
  mumbai: 'Mumbai',
  delhi: 'Delhi NCR',
  bangalore: 'Bangalore',
  hyderabad: 'Hyderabad',
  chennai: 'Chennai',
  pune: 'Pune',
  kolkata: 'Kolkata',
  meerut: 'Meerut',
  ahmedabad: 'Ahmedabad',
  noida: 'Noida',
  gurugram: 'Gurugram',
  ghaziabad: 'Ghaziabad',
  faridabad: 'Faridabad',
  modinagar: 'Modinagar',
  muradnagar: 'Muradnagar',
  goa: 'Goa',
  jaipur: 'Jaipur',
  udupi: 'Udupi',
  mysore: 'Mysore',
  mangalore: 'Mangalore',
  madurai: 'Madurai',
  kochi: 'Kochi',
  siliguri: 'Siliguri',
  bhubaneswar: 'Bhubaneswar',
  ranchi: 'Ranchi',
  visakhapatnam: 'Visakhapatnam',
  vijayawada: 'Vijayawada',
  coimbatore: 'Coimbatore',
  nashik: 'Nashik',
  thane: 'Thane',
  'navi-mumbai': 'Navi Mumbai',
  chandigarh: 'Chandigarh',
  amritsar: 'Amritsar',
  lucknow: 'Lucknow',
  ludhiana: 'Ludhiana',
  vadodara: 'Vadodara',
  surat: 'Surat',
  indore: 'Indore',
  nagpur: 'Nagpur',
  bhopal: 'Bhopal',
  varanasi: 'Varanasi',
  rajkot: 'Rajkot',
  agra: 'Agra',
  trichy: 'Trichy',
  guwahati: 'Guwahati',
  jodhpur: 'Jodhpur',
  udaipur: 'Udaipur',
  haridwar: 'Haridwar',
  rishikesh: 'Rishikesh',
  dombivli: 'Dombivli',
  palava: 'Palava',
};

function formatCityName(slug) {
  if (CITY_DISPLAY_NAMES[slug]) return CITY_DISPLAY_NAMES[slug];
  return slug
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

// Build the answer block string (mirrors cityContent.js:50-91 ANSWER_BLOCKS map,
// or falls back to the generic template).
function buildAnswerBlock(citySlug, cityName) {
  const generator = require(path.join(ZYMO_BACKEND, 'cityContent.js'));
  if (typeof generator.getAnswerBlock === 'function') {
    return generator.getAnswerBlock(citySlug, cityName);
  }
  // Fallback template — matches the generator's default at cityContent.js:29-48
  return `Self-drive car rental in ${cityName} starts from ₹45/hr on Zymo. Compare prices from multiple rental partners with doorstep delivery, no platform fee, and both hourly and daily rentals. Book in under 2 minutes.`;
}

function heroAltFor(cityName) {
  return `Self-drive car rental in ${cityName} — compare prices on Zymo`;
}

function metaTitleFor(cityName) {
  return `Self Drive Car Rental in ${cityName} from ₹45/hr | Zymo`;
}

function metaDescriptionFor(cityName) {
  return `Book self-drive car rentals in ${cityName} starting ₹45/hr. Compare rates from multiple partners. Doorstep delivery, no Zymo platform fee, hourly + daily plans. Book in 2 minutes.`;
}

// -----------------------------------------------------------------------------
// YAML front-matter serializer (minimal — handles strings, arrays, objects).
// Uses `>-` for long single-line strings to avoid readability nightmares.
// -----------------------------------------------------------------------------
function toYamlValue(v, indent = 0) {
  const pad = '  '.repeat(indent);
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    // Multi-line via `>-` block scalar for long content
    if (v.length > 200 || v.includes('\n')) {
      const lines = v.replace(/\r\n/g, '\n').split('\n');
      return `>-\n${lines.map((l) => `${pad}  ${l}`).join('\n')}`;
    }
    // Escape and quote
    const escaped = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return '\n' + v.map((item) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        return `${pad}- ${toYamlValue(item, indent + 1)}`;
      }
      // object: dash then keys indented under
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

// -----------------------------------------------------------------------------
// Main migration
// -----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const cityContent = require(path.join(ZYMO_BACKEND, 'cityContent.js'));
  const cityData = require(path.join(ZYMO_BACKEND, 'cityData.json'));
  const { CITY_SEO_CONTENT } = cityContent;

  if (!CITY_SEO_CONTENT) {
    console.error('CITY_SEO_CONTENT export not found on cityContent.js — check module.exports');
    process.exit(1);
  }

  const availableSlugs = Object.keys(CITY_SEO_CONTENT);
  const slugsToMigrate = args.length > 0
    ? args.filter((s) => {
      if (!availableSlugs.includes(s)) {
        console.warn(`[skip] ${s} — not present in CITY_SEO_CONTENT`);
        return false;
      }
      return true;
    })
    : availableSlugs;

  await fs.mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const slug of slugsToMigrate) {
    const content = CITY_SEO_CONTENT[slug];
    const cityName = formatCityName(slug);
    const heroImage = `/images/CityCars&Price/${HERO_IMAGES[slug] || 'default.webp'}`;

    // cityData has per-city structured airport/pickup/road-trip info
    const cd = cityData?.[slug] || {};

    const frontMatter = {
      slug,
      cityName,
      title: metaTitleFor(cityName),
      description: metaDescriptionFor(cityName),
      canonical: `https://zymo.app/self-drive-car-rental-in-${slug}`,
      heroImage,
      heroAlt: heroAltFor(cityName),
      answerBlock: buildAnswerBlock(slug, cityName),
      intro: content.intro,
      popularAreas: content.popularAreas,
      nearbyDestinations: content.nearbyDestinations,
      tips: content.tips,
      carTypes: content.carTypes,
      whyZymo: content.whyZymo,
      howItWorks: content.howItWorks,
      priceNote: content.priceNote,
      faqs: content.faqs,
    };

    // Optional cityData extras
    if (cd.airportInfo) frontMatter.airportInfo = cd.airportInfo;
    if (cd.pickupAreas) frontMatter.pickupAreas = cd.pickupAreas;
    if (cd.roadTripsTable) frontMatter.roadTripsTable = cd.roadTripsTable;
    if (cd.internalLinks) frontMatter.internalLinks = cd.internalLinks;

    const body = `<!--
This file was migrated from zymo-backend/functions/seo/cityContent.js
by scripts/migrate-city-content.mjs on ${new Date().toISOString()}.
Do NOT hand-edit the front-matter without also updating the migration script
or the source generator — a re-run of the migration will overwrite changes.
Body markdown below is free-form and safe to edit.
-->

The SEO page body is composed at build time from the front-matter fields above
by the Astro template at src/pages/self-drive-car-rental-in-[city].astro.
`;

    const outFile = path.join(OUT_DIR, `${slug}.md`);
    await fs.writeFile(outFile, toFrontMatter(frontMatter) + body, 'utf8');
    console.log(`[write] ${outFile}`);
    written++;
  }

  console.log(`\nMigrated ${written}/${slugsToMigrate.length} cities → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
