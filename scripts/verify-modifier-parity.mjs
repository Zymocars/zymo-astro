#!/usr/bin/env node
// Read-only parity check for modifier×city pages ({cheap|airport|weekend|monthly}-car-rental-in-{city}).
//
// Usage:
//   node scripts/verify-modifier-parity.mjs cheap mumbai --prod https://zymo.app --local-file dist/cheap-car-rental-in-mumbai.html
//   node scripts/verify-modifier-parity.mjs airport delhi --prod https://zymo.app --local http://localhost:4321
//
// Exit code 0 = pass all axes. Non-zero = at least one axis failed.

import fs from 'node:fs/promises';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

const modifier = process.argv[2];
const city = process.argv[3];
if (!modifier || !city) {
  console.error('Usage: node scripts/verify-modifier-parity.mjs <modifier> <citySlug> --prod <url> [--local <url> | --local-file <path>]');
  console.error('Where <modifier> ∈ {cheap, airport, weekend, monthly}');
  process.exit(2);
}
const validModifiers = new Set(['cheap', 'airport', 'weekend', 'monthly']);
if (!validModifiers.has(modifier)) {
  console.error(`Invalid modifier "${modifier}". Must be one of: ${[...validModifiers].join(', ')}`);
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
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);

  const schemaBlocks = [];
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let parseErrors = 0;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      schemaBlocks.push(JSON.parse(m[1]));
    } catch (e) {
      parseErrors++;
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

  return {
    bytes: Buffer.byteLength(html, 'utf8'),
    title: titleMatch ? titleMatch[1] : null,
    canonical: canonicalMatch ? canonicalMatch[1] : null,
    robots: robotsMatch ? robotsMatch[1] : null,
    description: descMatch ? descMatch[1] : null,
    h1: h1Match ? h1Match[1] : null,
    typeCounts,
    schemaFaqCount,
    parseErrors,
    schemaCount: schemaBlocks.length,
  };
}

async function main() {
  const urlPath = `/${modifier}-car-rental-in-${city}`;
  const prodUrl = `${prodBase}${urlPath}`;
  const localSource = localFile || `${localBase}${urlPath}`;

  console.log(`\n=== Modifier parity check: ${modifier} × ${city} ===`);
  console.log(`Prod : ${prodUrl}`);
  console.log(`Local: ${localSource}\n`);

  const [prodHtml, localHtml] = await Promise.all([
    fetchHtml(prodUrl),
    fetchHtml(localSource),
  ]);

  const p = extract(prodHtml);
  const l = extract(localHtml);

  const results = [];

  results.push({
    axis: 'a) Title present',
    pass: !!p.title && !!l.title,
    prod: p.title,
    local: l.title,
  });

  results.push({
    axis: 'b) Canonical',
    pass: p.canonical === l.canonical,
    prod: p.canonical,
    local: l.canonical,
  });

  results.push({
    axis: 'c) Robots index+follow',
    pass: /index/i.test(p.robots || '') && /follow/i.test(p.robots || '')
      && /index/i.test(l.robots || '') && /follow/i.test(l.robots || ''),
    prod: p.robots,
    local: l.robots,
  });

  results.push({
    axis: 'd) JSON-LD parse',
    pass: l.parseErrors === 0,
    prod: `${p.schemaCount} schemas, ${p.parseErrors} parse errors`,
    local: `${l.schemaCount} schemas, ${l.parseErrors} parse errors`,
  });

  // LocalBusiness presence (modifier pages emit LocalBusiness with additionalType CarRental on prod)
  const prodHasLB = (p.typeCounts.LocalBusiness || 0) > 0;
  const localHasLB = (l.typeCounts.LocalBusiness || 0) > 0;
  results.push({
    axis: 'e) LocalBusiness schema present',
    pass: !prodHasLB || localHasLB,
    prod: `LocalBusiness=${p.typeCounts.LocalBusiness || 0}`,
    local: `LocalBusiness=${l.typeCounts.LocalBusiness || 0}`,
  });

  results.push({
    axis: 'f) FAQ count',
    pass: p.schemaFaqCount === 0 || l.schemaFaqCount >= 1,
    prod: `Q=${p.schemaFaqCount}`,
    local: `Q=${l.schemaFaqCount}`,
  });

  // Byte range: local within [30%, 125%] of prod. Modifier pages have leaner
  // schema surface than cities (no LocalBusiness/HowTo/Place/ImageObject stack)
  // and prod carries a heavy React SPA shell — a 30% floor still catches empty
  // pages while accepting the chrome-diet benefit of static Astro.
  const lo = Math.floor(p.bytes * 0.30);
  const hi = Math.ceil(p.bytes * 1.25);
  results.push({
    axis: 'g) Byte range (>=30% of prod, <=125%)',
    pass: l.bytes >= lo && l.bytes <= hi,
    prod: `${p.bytes} bytes`,
    local: `${l.bytes} bytes (window ${lo}-${hi})`,
  });

  // Booking-count / booking-stat substring guard
  const bookingCountHit = /(?:\d+[+,\s]{0,3}bookings?\s*(?:completed|per|of)|% of bookings)/i.test(localHtml);

  let allPassed = true;
  for (const r of results) {
    const flag = r.pass ? 'PASS' : 'FAIL';
    if (!r.pass) allPassed = false;
    console.log(`[${flag}] ${r.axis}`);
    console.log(`  prod : ${r.prod}`);
    console.log(`  local: ${r.local}`);
  }

  console.log('\n--- Informational ---');
  console.log(`[${!bookingCountHit ? 'OK' : 'WARN'}] No booking-count substring in local`);

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
