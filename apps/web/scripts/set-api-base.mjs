// Bakes the API base URL into the Angular bundle at build time.
//
// Angular static builds have no runtime env, so we write src/app/core/api/api-base.ts
// from the API_BASE_URL env var (set by Render's `fromService` wiring). A bare host
// like `keepsake-api.onrender.com` is upgraded to `https://…`. When API_BASE_URL is
// unset (local dev), the committed localhost default is left untouched.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../src/app/core/api/api-base.ts');

const raw = (process.env.API_BASE_URL ?? '').trim();
if (!raw) {
  console.log('[set-api-base] API_BASE_URL not set — keeping committed default (localhost).');
  process.exit(0);
}

const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
const normalized = withScheme.replace(/\/+$/, ''); // strip any trailing slash

writeFileSync(target, `export const API_BASE = '${normalized}';\n`);
console.log(`[set-api-base] API_BASE = ${normalized}`);
