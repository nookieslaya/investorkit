import Fastify from 'fastify';
import { expect } from 'vitest';
import { buildOpenApiDocument } from '../apps/api/src/openapi.js';

// Fastify's independent JSON Schema validator checks the generated OpenAPI schemas.
// Disable mutation so extra fields, coercion or missing required fields fail the test.
export async function createContractValidator() {
  const validator = Fastify({ ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } } });
  const routes = new Map<string, string>();
  const document = buildOpenApiDocument();
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      for (const [status, response] of Object.entries(operation.responses)) {
        const url = `/validate/${routes.size}`;
        routes.set(`${method} ${path} ${status}`, url);
        validator.post(url, { schema: { body: response.content['application/json'].schema } }, async () => ({ valid: true }));
      }
    }
  }
  await validator.ready();
  async function check(path: string, method: string, status: number, body: unknown) {
    const url = routes.get(`${method.toLowerCase()} ${path} ${status}`);
    if (!url) throw new Error(`Undocumented response: ${method} ${path} ${status}`);
    return validator.inject({ method: 'POST', url, payload: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  }
  return {
    close: () => validator.close(),
    async accepts(path: string, method: string, status: number, body: unknown) {
      return (await check(path, method, status, body)).statusCode === 200;
    },
    async assert(path: string, method: string, response: { statusCode: number; body: string; headers: Record<string, unknown> }) {
      expect(response.headers['content-type']).toMatch(/application\/json/);
      const result = await check(path, method, response.statusCode, JSON.parse(response.body));
      expect(result.statusCode, `${method} ${path}: ${response.statusCode}: ${result.body}`).toBe(200);
    },
  };
}
