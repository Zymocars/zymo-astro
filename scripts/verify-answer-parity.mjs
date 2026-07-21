#!/usr/bin/env node
// Read-only parity check for answer pages under /answers/{slug}.
//
// Usage:
//   node scripts/verify-answer-parity.mjs self-drive-car-rental-mumbai --prod https://zymo.app --local-file dist/answers/self-drive-car-rental-mumbai.html
//   node scripts/verify-answer-parity.mjs best-self-drive-car-rental-india --prod https://zymo.app --local http://localhost:4321
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
  console.error('Usage: node scripts/verify-answer-parity.mjs <slug> --prod <url> [--local <url> | --local-file <path>]');
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
    typeCounts,
    schemaFaqCount,
    parseErrors,
    schemaCount: schemaBlocks.length,
  };
}

async function main() {
  const urlPath = `/answers/${slug}`;
  const prodUrl = `${prodBase}${urlPath}`;
  const localSource = localFile || `${localBase}${urlPath}`;

  console.log(`\n=== Answer parity check: ${slug} ===`);
  console.log(`Prod : ${prodUrl}`);
  console.log(`Local: ${localSource}\n`);

  const [prodHtml, localHtml] = await Promise.all([
    fetchHtml(prodUrl),
    fetchHtml(localSource),
  ]);

  const p = extract(prodHtml);
  const l = extract(localHtml);

  const results = [];

  results.push({ axis: 'a) Title present',   pass: !!p.title && !!l.title, prod: p.title, local: l.title });
  results.push({ axis: 'b) Canonical',        pass: p.canonical === l.canonical, prod: p.canonical, local: l.canonical });
  results.push({ axis: 'c) Robots index+follow', pass: /index/i.test(p.robots||'') && /follow/i.test(p.robots||'') && /index/i.test(l.robots||'') && /follow/i.test(l.robots||''), prod: p.robots, local: l.robots });
  results.push({ axis: 'd) JSON-LD parse',    pass: l.parseErrors === 0, prod: `${p.schemaCount} schemas, ${p.parseErrors} errs`, local: `${l.schemaCount} schemas, ${l.parseErrors} errs` });

  // e) Article schema present (all answer pages emit Article on prod per metaConfigs.getAnswerSchemas)
  const prodHasArticle = (p.typeCounts.Article || 0) > 0;
  const localHasArticle = (l.typeCounts.Article || 0) > 0;
  results.push({
    axis: 'e) Article schema present',
    pass: !prodHasArticle || localHasArticle,
    prod: `Article=${p.typeCounts.Article || 0}`,
    local: `Article=${l.typeCounts.Article || 0}`,
  });

  // f) FAQPage schema present (most answer pages carry FAQs)
  const prodHasFaq = (p.typeCounts.FAQPage || 0) > 0;
  const localHasFaq = (l.typeCounts.FAQPage || 0) > 0;
  results.push({
    axis: 'f) FAQPage schema present',
    pass: !prodHasFaq || localHasFaq,
    prod: `FAQPage=${p.typeCounts.FAQPage || 0}`,
    local: `FAQPage=${l.typeCounts.FAQPage || 0}`,
  });

  // g) FAQ count (schema mainEntity length)
  results.push({
    axis: 'g) FAQ Q count',
    pass: p.schemaFaqCount === 0 || l.schemaFaqCount >= Math.max(1, Math.floor(p.schemaFaqCount * 0.5)),
    prod: `Q=${p.schemaFaqCount}`,
    local: `Q=${l.schemaFaqCount}`,
  });

  // h) Byte range: local within [30%, 125%] of prod (answer pages are also chrome-lean)
  const lo = Math.floor(p.bytes * 0.30);
  const hi = Math.ceil(p.bytes * 1.25);
  results.push({
    axis: 'h) Byte range (>=30% of prod, <=125%)',
    pass: l.bytes >= lo && l.bytes <= hi,
    prod: `${p.bytes} bytes`,
    local: `${l.bytes} bytes (window ${lo}-${hi})`,
  });

  // Booking-count guard (informational)
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
