// Prebuild gate: refuse to ship without the Places key.
// Vite inlines import.meta.env.VITE_PLACES_API_KEY at build time; a
// missing value used to fall back to a hardcoded production key in
// NewRSB.tsx (removed 2026-11-15). Without this gate a blank .env still
// built, and search/ETD Places calls died at runtime.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
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

const REQUIRED = ['VITE_PLACES_API_KEY'];
const missing = REQUIRED.filter((k) => !process.env[k] || !String(process.env[k]).trim());
if (missing.length > 0) {
  console.error(
    '[verify-env] REFUSING TO BUILD: missing required web config: ' + missing.join(', ') + '\n' +
    '[verify-env] Set VITE_PLACES_API_KEY in .env / .env.production (Places + Geocoding on search island).'
  );
  process.exit(1);
}
console.log('[verify-env] Required web config present (' + REQUIRED.length + ' keys).');
