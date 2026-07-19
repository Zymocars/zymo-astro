#!/usr/bin/env node
// One-shot migration: reads route SEO data from
// zymo-backend/functions/seo/routeConfigs.js and emits one markdown per
// (fromCity, toCity) route pair at src/content/routes/{slug}.md.
//
// 40 route pairs. URL pattern: /self-drive-{fromCity}-to-{toCity}

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZYMO_BACKEND = path.resolve(__dirname, '../../zymo-backend/functions/seo');
const OUT_DIR = path.resolve(__dirname, '../src/content/routes');

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

async function main() {
  const { ROUTE_SLUGS, getRouteMeta, generateRouteContentHtml, getRouteFAQSchema } =
    require(path.join(ZYMO_BACKEND, 'routeConfigs.js'));

  await fs.mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const slug of ROUTE_SLUGS) {
    const bodyHtml = generateRouteContentHtml(slug);
    if (!bodyHtml) continue;
    const meta = getRouteMeta(slug);
    const faqs = unwrapFaqSchema(getRouteFAQSchema(slug));

    const frontMatter = {
      slug,
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      bodyHtml,
      faqs,
    };
    const outFile = path.join(OUT_DIR, `${slug}.md`);
    await fs.writeFile(outFile, toFrontMatter(frontMatter) + '\n', 'utf8');
    written++;
  }
  console.log(`Migrated ${written}/${ROUTE_SLUGS.length} routes → ${OUT_DIR}`);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
