#!/usr/bin/env node
// One-shot migration: reads ZoomCar cluster pages from
// zymo-backend/functions/seo/zoomcarClusterContent.js and writes both a
// content-collection markdown entry AND a thin Astro page wrapper per slug.
//
// URLs are root-level, one per slug: /zoomcar-alternative, /is-zoomcar-safe,
// /zoomcar-review-india, /zoomcar-mumbai-to-goa, etc. — 66 total. Root-level
// URLs are handled by generating individual page files (not a dynamic
// [slug] route) so Astro doesn't accidentally shadow other root routes.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZYMO_BACKEND = path.resolve(__dirname, '../../zymo-backend/functions/seo');
const CONTENT_DIR = path.resolve(__dirname, '../src/content/zoomcar-clusters');
const PAGES_DIR = path.resolve(__dirname, '../src/pages');

function toYamlValue(v, indent = 0) {
  const pad = '  '.repeat(indent);
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (v.length > 200 || v.includes('\n')) {
      const lines = v.replace(/\r\n/g, '\n').split('\n');
      return `|\n${lines.map((l) => `${pad}  ${l}`).join('\n')}`;
    }
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return '\n' + v.map((item) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        return `${pad}- ${toYamlValue(item, indent + 1)}`;
      }
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
  return `---\n${Object.entries(obj).map(([k, v]) => `${k}: ${toYamlValue(v, 1)}`).join('\n')}\n---\n`;
}

function unwrapFaqSchema(schema) {
  if (!schema || !Array.isArray(schema.mainEntity)) return [];
  return schema.mainEntity.map((q) => ({
    q: q.name || '',
    a: q?.acceptedAnswer?.text || '',
  }));
}

const ASTRO_TEMPLATE = (slug) => `---
import ZoomcarClusterPage from '../layouts/ZoomcarClusterPage.astro';
---
<ZoomcarClusterPage slug="${slug}" />
`;

async function main() {
  const {
    getZoomcarClusterSlugs,
    generateZoomcarClusterHtml,
    getZoomcarClusterMeta,
    getZoomcarClusterFAQSchema,
  } = require(path.join(ZYMO_BACKEND, 'zoomcarClusterContent.js'));

  await fs.mkdir(CONTENT_DIR, { recursive: true });

  const slugs = getZoomcarClusterSlugs();
  let written = 0;
  for (const slug of slugs) {
    const bodyHtml = generateZoomcarClusterHtml(slug);
    if (!bodyHtml) continue;
    const meta = getZoomcarClusterMeta(slug);
    const faqs = unwrapFaqSchema(getZoomcarClusterFAQSchema(slug));

    // Content entry
    const frontMatter = {
      slug,
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical || `https://zymo.app/${slug}`,
      bodyHtml,
      faqs,
    };
    await fs.writeFile(path.join(CONTENT_DIR, `${slug}.md`), toFrontMatter(frontMatter) + '\n', 'utf8');

    // Root-level Astro page
    await fs.writeFile(path.join(PAGES_DIR, `${slug}.astro`), ASTRO_TEMPLATE(slug), 'utf8');

    written++;
  }
  console.log(`Migrated ${written}/${slugs.length} zoomcar clusters + ${written} page files`);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
