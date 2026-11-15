import { readFileSync, writeFileSync } from 'node:fs';
import { buildOpenApiDocument } from '../apps/api/src/openapi.js';
const file = new URL('../docs/openapi.json', import.meta.url);
const content = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8') !== content) throw new Error('OpenAPI is stale. Run npm run openapi:generate.');
} else {
  writeFileSync(file, content);
}
