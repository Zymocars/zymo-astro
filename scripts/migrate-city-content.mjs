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
import yaml from 'js-yaml';

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
  pondicherry: 'Pondicherry',
  manipal: 'Manipal',
  calicut: 'Calicut',
  mahabalipuram: 'Mahabalipuram',
  thiruvananthapuram: 'Thiruvananthapuram',
  bangalore: 'Bangalore',
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
  // Use js-yaml for reliable serialization — handles @-keys, unicode, block scalars, nesting.
  const body = yaml.dump(obj, {
    lineWidth: -1,       // never fold lines
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  return `---\n${body}---\n`;
}

// -----------------------------------------------------------------------------
// Main migration
// -----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const cityContent = require(path.join(ZYMO_BACKEND, 'cityContent.js'));
  const cityData = require(path.join(ZYMO_BACKEND, 'cityData.json'));
  const metaConfigs = require(path.join(ZYMO_BACKEND, 'metaConfigs.js'));
  const reviewData = require(path.join(ZYMO_BACKEND, 'reviewData.js'));
  const routeConfigs = require(path.join(ZYMO_BACKEND, 'routeConfigs.js'));
  const answersMod = require(path.join(ZYMO_BACKEND, 'answersContent.js'));
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

    // Backend-generated meta (title override + description override + og image URL)
    const cityMeta = metaConfigs.getCityMeta(slug);

    // Full JSON-LD schema stack from backend (LocalBusiness, HowTo, Place, WebPage, ImageObject, BreadcrumbList)
    const schemas = metaConfigs.getCityPageSchemas(slug, cityName);

    // FAQ merge via SSOT helper (accessed through getCityFAQSchema which internally
    // calls buildCityFAQs). Returns schema shape { mainEntity: [{name, acceptedAnswer.text}] }
    // — unwrap to {q,a} for the collection.
    let mergedFaqs = null;
    if (typeof cityContent.getCityFAQSchema === 'function') {
      const faqSchema = cityContent.getCityFAQSchema(slug);
      if (faqSchema && faqSchema.mainEntity) {
        mergedFaqs = faqSchema.mainEntity.map(e => ({
          q: e.name,
          a: e.acceptedAnswer?.text || '',
        }));
      }
    }

    // Pre-rendered body HTML (all 7 sections prod emits)
    let bodyHtml = null;
    try {
      bodyHtml = cityContent.generateCityContentHtml(slug, cityName);
    } catch (e) {
      console.warn(`[warn] generateCityContentHtml failed for ${slug}: ${e.message}`);
    }

    // Reviews (real GBP-sourced testimonials — never invented).
    // Backend shape: {name, rating, text, date, source} — normalize to zod schema
    // {name, stars, body, date?, source?}.
    const reviewsRaw = typeof reviewData.getReviewsForCity === 'function'
      ? (reviewData.getReviewsForCity(slug, 5) || [])
      : [];
    const reviews = reviewsRaw.map(r => ({
      name: r.name,
      stars: r.rating ?? r.stars ?? 5,
      body: r.text ?? r.body ?? '',
      ...(r.date ? { date: r.date } : {}),
      ...(r.source ? { source: r.source } : {}),
    })).filter(r => r.name && r.body);

    // Route links (up to 4) — filter ROUTE_DATA for keys matching `${slug}-to-*`
    const routeLinks = [];
    if (routeConfigs.ROUTE_DATA) {
      for (const routeSlug of Object.keys(routeConfigs.ROUTE_DATA)) {
        if (routeLinks.length >= 4) break;
        if (routeSlug.startsWith(`${slug}-to-`)) {
          const dest = routeSlug.slice(`${slug}-to-`.length).split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          routeLinks.push({ label: `${cityName} to ${dest}`, path: `/self-drive-${routeSlug}` });
        }
      }
    }

    // Nearby cities from backend helper
    let internalLinks;
    if (typeof cityContent.getNearbyCityLinks === 'function') {
      const nearby = cityContent.getNearbyCityLinks(slug) || [];
      if (nearby.length) {
        internalLinks = nearby.map(n => ({
          label: n.label || formatCityName(n.slug || n),
          path: n.path || `/self-drive-car-rental-in-${n.slug || n}`,
        }));
      }
    }

    // Static modifier options — 4 links per city
    const moreOptions = [
      { label: `Cheap car rental in ${cityName}`, path: `/cheap-car-rental-in-${slug}` },
      { label: `Airport car rental in ${cityName}`, path: `/airport-car-rental-in-${slug}` },
      { label: `Weekend car rental in ${cityName}`, path: `/weekend-car-rental-in-${slug}` },
      { label: `Monthly car rental in ${cityName}`, path: `/monthly-car-rental-in-${slug}` },
    ];

    // HowTo schema — global 4-step, same for all city pages
    const howToSteps = (metaConfigs.getRentalHowToSchema()?.step || []).map(s => ({
      name: s.name,
      text: s.text,
      ...(s.url ? { url: s.url } : {}),
    }));

    // Citation sources for the corresponding answer slug (optional)
    const answerSlug = `self-drive-car-rental-${slug}`;
    const citationSources = answersMod.CITATION_SOURCES?.[answerSlug];

    // Extract geo from LocalBusiness schema (avoids relying on unexported CITY_GEO map)
    let geo;
    const localBusiness = schemas.find(s => s['@type'] === 'LocalBusiness');
    if (localBusiness?.geo && localBusiness?.address?.addressRegion) {
      geo = {
        lat: localBusiness.geo.latitude,
        lng: localBusiness.geo.longitude,
        state: localBusiness.address.addressRegion,
      };
    }

    // Extract og image URL parts to a filename (or use as-is)
    let ogImageFile;
    const ogUrl = cityMeta?.og?.image || '';
    const ogMatch = ogUrl.match(/CityCars%26Price\/([^\/]+)$/);
    if (ogMatch) ogImageFile = ogMatch[1];

    const frontMatter = {
      slug,
      cityName,
      title: cityMeta.title,
      description: cityMeta.description,
      canonical: cityMeta.canonical,
      heroImage,
      heroAlt: heroAltFor(cityName),
      h1: `Self-Drive Car Rental in ${cityName}`,
      answerBlock: buildAnswerBlock(slug, cityName),
      intro: content.intro,
      popularAreas: content.popularAreas,
      nearbyDestinations: content.nearbyDestinations,
      tips: content.tips,
      carTypes: content.carTypes,
      whyZymo: content.whyZymo,
      howItWorks: content.howItWorks,
      priceNote: content.priceNote,
      faqs: (mergedFaqs && mergedFaqs.length > 0) ? mergedFaqs : content.faqs,
    };

    if (geo) frontMatter.geo = geo;
    if (ogImageFile) frontMatter.ogImageFile = ogImageFile;
    if (howToSteps.length) frontMatter.howToSteps = howToSteps;
    frontMatter.speakableSelectors = ['[data-speakable]'];
    if (routeLinks.length) frontMatter.routeLinks = routeLinks;
    if (internalLinks) frontMatter.internalLinks = internalLinks;
    frontMatter.moreOptions = moreOptions;
    if (citationSources) frontMatter.citationSources = citationSources;
    if (reviews.length) frontMatter.reviews = reviews;

    // cityData structured fields (may already exist per prior migration)
    if (cd.airportInfo) frontMatter.airportInfo = cd.airportInfo;
    if (cd.pickupAreas) frontMatter.pickupAreas = cd.pickupAreas;
    if (cd.roadTripsTable) frontMatter.roadTripsTable = cd.roadTripsTable;
    if (cd.pricing) frontMatter.pricing = cd.pricing;

    // Byte-parity safety net — pre-rendered body + schemas
    if (bodyHtml) frontMatter.bodyHtml = bodyHtml;
    frontMatter.schemas = schemas;

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
