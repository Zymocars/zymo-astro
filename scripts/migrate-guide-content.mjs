#!/usr/bin/env node
// Regenerates guide SEO content from
// zymo-backend/functions/seo/guideContent.js + metaConfigs.js and emits one
// markdown file per guide at src/content/guides/{slug}.md.
//
// Guide content is HTML-first (each generator returns a big HTML string).
// This migration stores the raw HTML in the `bodyHtml` front-matter field so
// the Astro page can render it via <Fragment set:html={bodyHtml}>, inline
// styles included.
//
// Usage:
//   node scripts/migrate-guide-content.mjs [slug...]
//   node scripts/migrate-guide-content.mjs            # all guides
//   node scripts/migrate-guide-content.mjs zymo-vs-zoomcar   # single

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZYMO_BACKEND = path.resolve(__dirname, '../../zymo-backend/functions/seo');
const OUT_DIR = path.resolve(__dirname, '../src/content/guides');

// -----------------------------------------------------------------------------
// YAML block-scalar helpers.
// -----------------------------------------------------------------------------
function toYamlValue(v, indent = 0) {
  const pad = '  '.repeat(indent);
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (v.length > 200 || v.includes('\n')) {
      // Use literal block scalar `|` for HTML so newlines survive verbatim.
      // Every content line is prefixed with (indent + 2) spaces per YAML spec.
      const lines = v.replace(/\r\n/g, '\n').split('\n');
      return `|\n${lines.map((l) => `${pad}  ${l}`).join('\n')}`;
    }
    const escaped = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
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
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${toYamlValue(v, 1)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

// -----------------------------------------------------------------------------
// FAQ extractor — getGuideFAQSchema(slug) returns a full FAQPage JSON-LD.
// We unwrap it to a plain array of { q, a } objects to store on front-matter.
// -----------------------------------------------------------------------------
function unwrapFaqSchema(schema) {
  if (!schema || !Array.isArray(schema.mainEntity)) return [];
  return schema.mainEntity.map((q) => ({
    q: q.name || '',
    a: q?.acceptedAnswer?.text || '',
  }));
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);

  const guideContent = require(path.join(ZYMO_BACKEND, 'guideContent.js'));
  const metaConfigs = require(path.join(ZYMO_BACKEND, 'metaConfigs.js'));

  const { getGuideSlugs, generateGuideContentHtml, getGuideFAQSchema } = guideContent;
  const { getGuideMeta } = metaConfigs;

  // getGuideMeta exposes title/description/canonical only. `h1`, `type`,
  // `publishedDate` and `modifiedDate` live in metaConfigs.js's module-private
  // GUIDE_PAGE_CONFIGS, so they are read from the source text per slug.
  // Cheap regex — works because the config block is a flat literal object.
  const metaSource = await fs.readFile(path.join(ZYMO_BACKEND, 'metaConfigs.js'), 'utf8');
  function extractPrivate(slug, field) {
    // Match:  "slug": { ... field: "value" ... }
    // Grab the block for this slug, then find the field within it.
    const blockRe = new RegExp('"' + slug.replace(/[-]/g, '\\-') + '"\\s*:\\s*\\{([\\s\\S]*?)\\},', 'm');
    const m = metaSource.match(blockRe);
    if (!m) return null;
    const block = m[1];
    const fieldRe = new RegExp(field + '\\s*:\\s*"([^"]+)"');
    const fm = block.match(fieldRe);
    return fm ? fm[1] : null;
  }

  const allSlugs = getGuideSlugs();
  const slugsToMigrate = args.length > 0
    ? args.filter((s) => {
      if (!allSlugs.includes(s)) {
        console.warn(`[skip] ${s} — not a valid guide slug`);
        return false;
      }
      return true;
    })
    : allSlugs;

  await fs.mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const slug of slugsToMigrate) {
    const meta = getGuideMeta(slug);
    const bodyHtml = generateGuideContentHtml(slug);
    const faqSchema = getGuideFAQSchema(slug);
    const faqs = unwrapFaqSchema(faqSchema);
    const h1 = extractPrivate(slug, 'h1') || meta.title;
    const type = extractPrivate(slug, 'type') || 'spoke';
    const publishedDate = extractPrivate(slug, 'publishedDate') || '';
    const modifiedDate = extractPrivate(slug, 'modifiedDate') || '';

    if (!bodyHtml) {
      console.warn(`[skip] ${slug} — generateGuideContentHtml returned empty`);
      continue;
    }

    const frontMatter = {
      slug,
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      h1,
      type,
      publishedDate,
      modifiedDate,
      bodyHtml,
      faqs,
    };

    const body = `<!--
This file was migrated from zymo-backend/functions/seo/guideContent.js
+ zymo-backend/functions/seo/metaConfigs.js by
scripts/migrate-guide-content.mjs.
Do NOT hand-edit the bodyHtml front-matter — the raw HTML is what the
Astro guide template renders verbatim.
-->
`;

    const outFile = path.join(OUT_DIR, `${slug}.md`);
    await fs.writeFile(outFile, toFrontMatter(frontMatter) + body, 'utf8');
    console.log(`[write] ${outFile}`);
    written++;
  }

  console.log(`\nMigrated ${written}/${slugsToMigrate.length} guides → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
