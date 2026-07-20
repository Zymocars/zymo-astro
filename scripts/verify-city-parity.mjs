#!/usr/bin/env node
// Read-only parity check: compare a locally-built Astro city page against
// its live production counterpart across 7 axes.
//
// Usage:
//   node scripts/verify-city-parity.mjs mumbai --prod https://zymo.app --local http://localhost:4321
//   node scripts/verify-city-parity.mjs mumbai --prod https://zymo.app --local-file dist/self-drive-car-rental-in-mumbai.html
//
// Exit code 0 = all axes pass. Non-zero = at least one axis failed (details printed).

import fs from 'node:fs/promises';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/verify-city-parity.mjs <citySlug> --prod <url> [--local <url> | --local-file <path>]');
  process.exit(2);
}

const prodBase = arg('--prod', 'https://zymo.app');
const localBase = arg('--local', null);
const localFile = arg('--local-file', null);

async function fetchHtml(source) {
  if (source.startsWith('http')) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${source}`);
    return await res.text();
  }
  return await fs.readFile(source, 'utf8');
}

function extract(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i);
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);

  const schemaBlocks = [];
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      schemaBlocks.push(JSON.parse(m[1]));
    } catch (e) {
      // ignore parse errors — count as missing
    }
  }

  const typeCounts = {};
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if (typeof node['@type'] === 'string') {
        typeCounts[node['@type']] = (typeCounts[node['@type']] || 0) + 1;
      }
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(schemaBlocks);

  const faqPage = schemaBlocks.find(s => s && s['@type'] === 'FAQPage');
  const schemaFaqCount = (faqPage && Array.isArray(faqPage.mainEntity)) ? faqPage.mainEntity.length : 0;

  const visibleDtCount = (html.match(/<dt[^>]*>/gi) || []).length;
  const visibleSummaryCount = (html.match(/<summary[^>]*>/gi) || []).length;
  const visibleFaqCount = Math.max(visibleDtCount, visibleSummaryCount);

  return {
    bytes: Buffer.byteLength(html, 'utf8'),
    title: titleMatch ? titleMatch[1] : null,
    canonical: canonicalMatch ? canonicalMatch[1] : null,
    robots: robotsMatch ? robotsMatch[1] : null,
    h1: h1Match ? h1Match[1] : null,
    typeCounts,
    schemaFaqCount,
    visibleFaqCount,
  };
}

async function main() {
  const prodUrl = `${prodBase}/self-drive-car-rental-in-${slug}`;
  const localSource = localFile || `${localBase}/self-drive-car-rental-in-${slug}`;

  console.log(`\n=== Parity check: ${slug} ===`);
  console.log(`Prod : ${prodUrl}`);
  console.log(`Local: ${localSource}\n`);

  const [prodHtml, localHtml] = await Promise.all([
    fetchHtml(prodUrl),
    fetchHtml(localSource),
  ]);

  const p = extract(prodHtml);
  const l = extract(localHtml);

  const results = [];

  // a) Title
  results.push({
    axis: 'a) Title',
    pass: p.title === l.title,
    prod: p.title,
    local: l.title,
  });

  // b) H1
  results.push({
    axis: 'b) H1',
    pass: p.h1 && l.h1 && p.h1.trim() === l.h1.trim(),
    prod: p.h1,
    local: l.h1,
  });

  // c) Canonical
  results.push({
    axis: 'c) Canonical',
    pass: p.canonical === l.canonical,
    prod: p.canonical,
    local: l.canonical,
  });

  // d) Robots meta
  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '').split(',').filter(Boolean).slice(0, 2).sort().join(',');
  results.push({
    axis: 'd) Robots meta',
    pass: norm(p.robots).includes('index') && norm(l.robots).includes('index')
      && norm(p.robots).includes('follow') && norm(l.robots).includes('follow'),
    prod: p.robots,
    local: l.robots,
  });

  // e) Schema type set + counts — critical types
  const criticalTypes = [
    'LocalBusiness', 'HowTo', 'HowToStep', 'Place', 'WebPage', 'ImageObject',
    'FAQPage', 'ContactPoint', 'OpeningHoursSpecification', 'GeoCoordinates',
    'AggregateRating', 'BreadcrumbList', 'City', 'PostalAddress',
    'SpeakableSpecification', 'Question', 'Answer',
  ];
  const missing = [];
  const countMismatch = [];
  for (const t of criticalTypes) {
    const pc = p.typeCounts[t] || 0;
    const lc = l.typeCounts[t] || 0;
    if (pc > 0 && lc === 0) missing.push(t);
    else if (pc !== lc) countMismatch.push(`${t}: prod=${pc} local=${lc}`);
  }
  results.push({
    axis: 'e) Schema types (critical)',
    pass: missing.length === 0,
    prod: `${Object.keys(p.typeCounts).length} types, ${Object.values(p.typeCounts).reduce((a, b) => a + b, 0)} entries`,
    local: `${Object.keys(l.typeCounts).length} types, ${Object.values(l.typeCounts).reduce((a, b) => a + b, 0)} entries`,
    detail: missing.length ? `MISSING on local: ${missing.join(', ')}` : (countMismatch.length ? `COUNT MISMATCH: ${countMismatch.join(' | ')}` : 'OK'),
  });

  // f) FAQ count parity
  results.push({
    axis: 'f) FAQ count',
    pass: p.schemaFaqCount === l.schemaFaqCount && l.visibleFaqCount >= l.schemaFaqCount,
    prod: `schema=${p.schemaFaqCount}, visible=${p.visibleFaqCount}`,
    local: `schema=${l.schemaFaqCount}, visible=${l.visibleFaqCount}`,
  });

  // g) Byte range: local must be >= 40% of prod. Astro is intentionally leaner
  // (no React SPA hydration, no dead chrome) so an "over-shrink" is expected. We
  // only fail if the local page is suspiciously small (content missing) — under-
  // 40% would suggest the bodyHtml or schema stack didn't render.
  const lo = Math.floor(p.bytes * 0.40);
  const hi = Math.ceil(p.bytes * 1.25);
  results.push({
    axis: 'g) Byte range (>=40% of prod, <=125%)',
    pass: l.bytes >= lo && l.bytes <= hi,
    prod: `${p.bytes} bytes`,
    local: `${l.bytes} bytes (window ${lo}-${hi})`,
  });

  // Extra assertions (informational — not gating)
  const localSchemas = extract(localHtml);
  const bookingCountHit = /(?:\d+[+,\s]{0,3}bookings?\s*(?:completed|per|of)|% of bookings)/i.test(localHtml);
  const informational = [
    { note: 'No booking-count substring', ok: !bookingCountHit },
  ];

  // Print
  let allPassed = true;
  for (const r of results) {
    const flag = r.pass ? 'PASS' : 'FAIL';
    if (!r.pass) allPassed = false;
    console.log(`[${flag}] ${r.axis}`);
    console.log(`  prod : ${r.prod}`);
    console.log(`  local: ${r.local}`);
    if (r.detail) console.log(`  note : ${r.detail}`);
  }
  console.log('\n--- Informational ---');
  for (const n of informational) {
    console.log(`[${n.ok ? 'OK' : 'WARN'}] ${n.note}`);
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
