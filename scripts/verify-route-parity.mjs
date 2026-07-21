#!/usr/bin/env node
// Read-only parity check for route pages under /self-drive-{from}-to-{to}.
//
// Usage:
//   node scripts/verify-route-parity.mjs mumbai-to-goa --prod https://zymo.app --local-file dist/self-drive-mumbai-to-goa.html
//
// Exit code 0 = pass all axes. Non-zero = at least one axis failed.

import fs from 'node:fs/promises';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/verify-route-parity.mjs <slug> --prod <url> [--local <url> | --local-file <path>]');
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

  const schemaBlocks = [];
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let parseErrors = 0;
  while ((m = scriptRe.exec(html)) !== null) {
    try { schemaBlocks.push(JSON.parse(m[1])); } catch (e) { parseErrors++; }
  }

  const typeCounts = {};
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if (typeof node['@type'] === 'string') typeCounts[node['@type']] = (typeCounts[node['@type']] || 0) + 1;
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
    typeCounts,
    schemaFaqCount,
    parseErrors,
    schemaCount: schemaBlocks.length,
  };
}

async function main() {
  const urlPath = `/self-drive-${slug}`;
  const prodUrl = `${prodBase}${urlPath}`;
  const localSource = localFile || `${localBase}${urlPath}`;

  console.log(`\n=== Route parity check: ${slug} ===`);
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

  // Critical schemas for route pages — TouristTrip is the Google Trip rich-result trigger.
  const criticalTypes = ['TouristTrip', 'AggregateOffer', 'BreadcrumbList', 'ItemList', 'TouristDestination', 'ListItem', 'FAQPage'];
  const missing = [];
  const countLow = [];
  for (const t of criticalTypes) {
    const pc = p.typeCounts[t] || 0;
    const lc = l.typeCounts[t] || 0;
    if (pc > 0 && lc === 0) missing.push(t);
    else if (pc > 0 && lc < pc) countLow.push(`${t}: prod=${pc} local=${lc}`);
  }
  results.push({
    axis: 'e) Critical schemas present with parity counts',
    pass: missing.length === 0 && countLow.length === 0,
    prod: `${Object.keys(p.typeCounts).length} types, ${Object.values(p.typeCounts).reduce((a,b)=>a+b,0)} entries`,
    local: `${Object.keys(l.typeCounts).length} types, ${Object.values(l.typeCounts).reduce((a,b)=>a+b,0)} entries`,
    detail: missing.length ? `MISSING: ${missing.join(', ')}` : (countLow.length ? `LOW COUNT: ${countLow.join(' | ')}` : 'OK'),
  });

  results.push({
    axis: 'f) FAQ Q count',
    pass: p.schemaFaqCount === 0 || l.schemaFaqCount >= Math.floor(p.schemaFaqCount * 0.75),
    prod: `Q=${p.schemaFaqCount}`,
    local: `Q=${l.schemaFaqCount}`,
  });

  // Byte range: local within [30%, 125%] of prod (chrome-diet accepted).
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
    if (r.detail) console.log(`  note : ${r.detail}`);
  }
  console.log('\n--- Informational ---');
  console.log(`[${!bookingCountHit ? 'OK' : 'WARN'}] No booking-count substring in local`);

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => { console.error('FATAL:', err); process.exit(2); });
