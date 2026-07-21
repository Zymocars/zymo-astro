#!/usr/bin/env node
// Read-only parity check for zoomcar cluster pages (/zoomcar-*).
//
// Usage:
//   node scripts/verify-zoomcar-parity.mjs zoomcar-alternative --prod https://zymo.app --local-file dist/zoomcar-alternative.html

import fs from 'node:fs/promises';

function arg(name, fb) {
  const i = process.argv.indexOf(name);
  return (i >= 0 && i + 1 < process.argv.length) ? process.argv[i + 1] : fb;
}

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/verify-zoomcar-parity.mjs <slug> --prod <url> [--local <url> | --local-file <path>]');
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

  const schemas = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; let parseErrors = 0;
  while ((m = re.exec(html)) !== null) {
    try { schemas.push(JSON.parse(m[1])); } catch (e) { parseErrors++; }
  }
  const typeCounts = {};
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === 'object') {
      if (typeof n['@type'] === 'string') typeCounts[n['@type']] = (typeCounts[n['@type']] || 0) + 1;
      for (const v of Object.values(n)) walk(v);
    }
  };
  walk(schemas);
  const faq = schemas.find(s => s && s['@type'] === 'FAQPage');
  return {
    bytes: Buffer.byteLength(html, 'utf8'),
    title: titleMatch ? titleMatch[1] : null,
    canonical: canonicalMatch ? canonicalMatch[1] : null,
    robots: robotsMatch ? robotsMatch[1] : null,
    typeCounts,
    schemaFaqCount: (faq && Array.isArray(faq.mainEntity)) ? faq.mainEntity.length : 0,
    parseErrors,
    schemaCount: schemas.length,
  };
}

async function main() {
  const prodUrl = `${prodBase}/${slug}`;
  const localSource = localFile || `${localBase}/${slug}`;
  console.log(`\n=== Zoomcar parity check: ${slug} ===`);
  console.log(`Prod : ${prodUrl}`);
  console.log(`Local: ${localSource}\n`);

  const [prodHtml, localHtml] = await Promise.all([fetchHtml(prodUrl), fetchHtml(localSource)]);
  const p = extract(prodHtml);
  const l = extract(localHtml);

  const results = [];
  results.push({ axis: 'a) Title present', pass: !!p.title && !!l.title, prod: p.title, local: l.title });
  results.push({ axis: 'b) Canonical', pass: p.canonical === l.canonical, prod: p.canonical, local: l.canonical });
  results.push({ axis: 'c) Robots index+follow', pass: /index/i.test(p.robots||'') && /follow/i.test(p.robots||'') && /index/i.test(l.robots||'') && /follow/i.test(l.robots||''), prod: p.robots, local: l.robots });
  results.push({ axis: 'd) JSON-LD parse', pass: l.parseErrors === 0, prod: `${p.schemaCount} schemas, ${p.parseErrors} errs`, local: `${l.schemaCount} schemas, ${l.parseErrors} errs` });

  const prodHasFaq = (p.typeCounts.FAQPage || 0) > 0;
  const localHasFaq = (l.typeCounts.FAQPage || 0) > 0;
  results.push({
    axis: 'e) FAQPage present (if prod has it)',
    pass: !prodHasFaq || localHasFaq,
    prod: `FAQPage=${p.typeCounts.FAQPage || 0}`,
    local: `FAQPage=${l.typeCounts.FAQPage || 0}`,
  });

  results.push({
    axis: 'f) FAQ Q count',
    pass: p.schemaFaqCount === 0 || l.schemaFaqCount >= Math.floor(p.schemaFaqCount * 0.75),
    prod: `Q=${p.schemaFaqCount}`,
    local: `Q=${l.schemaFaqCount}`,
  });

  const lo = Math.floor(p.bytes * 0.30);
  const hi = Math.ceil(p.bytes * 1.25);
  results.push({
    axis: 'g) Byte range (>=30% of prod, <=125%)',
    pass: l.bytes >= lo && l.bytes <= hi,
    prod: `${p.bytes} bytes`,
    local: `${l.bytes} bytes (window ${lo}-${hi})`,
  });

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

main().catch(err => { console.error('FATAL:', err); process.exit(2); });
