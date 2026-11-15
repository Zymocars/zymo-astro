// Post-build guard: assert VITE_PLACES_API_KEY is actually inlined into
// dist JS. Vite statically replaces import.meta.env.* — an empty env
// still exits 0 from `astro build` but ships a dead search island.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(process.cwd(), 'dist');

for (const name of ['.env.local', '.env.production', '.env']) {
  const path = join(rootDir, name);
  if (!existsSync(path)) continue;
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    const hashAt = value.search(/\s+#/);
    if (hashAt !== -1) value = value.slice(0, hashAt).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

const key = process.env.VITE_PLACES_API_KEY;
if (!key || !String(key).trim()) {
  console.error('[verify-bundle] REFUSING TO SHIP: VITE_PLACES_API_KEY empty after env load.');
  process.exit(1);
}

function* files(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(js|mjs|html)$/.test(entry.name)) yield full;
  }
}

let checked = 0;
let found = false;
for (const file of files(distDir)) {
  const src = readFileSync(file, 'utf8');
  checked++;
  if (src.includes(key)) {
    found = true;
    break;
  }
}
if (!found) {
  console.error(
    '[verify-bundle] REFUSING TO SHIP: VITE_PLACES_API_KEY value not found in any dist file (' +
      checked +
      ' scanned). Build ran without the key inlined — search island would ship dead.'
  );
  process.exit(1);
}
console.log('[verify-bundle] OK — Places key inlined (' + checked + ' files scanned).');
