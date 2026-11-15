import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { createDatabase, user } from '@investorkit/db';
import { like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../apps/api/src/app.js';
import { createAuth } from '../../apps/api/src/auth.js';
import { portfolioRepository } from '../../apps/api/src/portfolio-repository.js';
import { buildOpenApiDocument } from '../../apps/api/src/openapi.js';
import { createContractValidator } from '../response-contract.js';
import { parseConfig } from '../../apps/api/src/config.js';
// Requires a migrated, disposable TEST_DATABASE_URL. Never falls back to production/dev DB.
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required for integration tests');
const config = parseConfig({ DATABASE_URL: url, BETTER_AUTH_SECRET: 'integration-only-secret-32-characters-minimum', BETTER_AUTH_URL: 'http://localhost:5173', WEB_ORIGIN: 'http://localhost:5173', NODE_ENV: 'test' });
const { db, pool } = createDatabase(url);
const app = await buildApp(config, { auth: createAuth(db, config), portfolios: portfolioRepository(db), ready: async () => { await pool.query('SELECT 1'); } }, false);
const contractValidator = await createContractValidator();
const rawInject = app.inject.bind(app);
const prefix = `integration-${randomUUID()}`;
const headers = { origin: config.WEB_ORIGIN };
let a = ''; let b = ''; let id = '';
async function inject(options: { method: 'GET' | 'POST'; url: string; headers?: Record<string, string>; payload?: Record<string, unknown> | string }) {
  const response = await rawInject(options);
  if (options.url.startsWith('/api/v1/portfolios')) {
    const path = options.url === '/api/v1/portfolios' ? options.url : '/api/v1/portfolios/{id}';
    await contractValidator.assert(path, options.method, response);
  }
  return response;
}
async function signup(label: string) {
  const response = await inject({ method: 'POST', url: '/api/auth/sign-up/email', headers, payload: { name: label, email: `${prefix}-${label}@example.com`, password: 'Test-only-passphrase-2026!' } });
  expect(response.statusCode).toBe(200);
  const cookies = response.headers['set-cookie'];
  return (Array.isArray(cookies) ? cookies : [cookies ?? '']).map(c => c.split(';')[0]).join('; ');
}
beforeAll(async () => { a = await signup('a'); b = await signup('b'); });
afterAll(async () => { await db.delete(user).where(like(user.email, `${prefix}%`)); await app.close(); await contractValidator.close(); await pool.end(); });
describe('real auth and owner isolation', () => {
  it('denies unauthenticated access', async () => {
    expect((await inject({ method: 'GET', url: '/api/v1/portfolios' })).statusCode).toBe(401);
  });
  it('rejects cross-origin writes and owner injection', async () => {
    expect((await inject({ method: 'POST', url: '/api/v1/portfolios', headers: { cookie: a, origin: 'https://evil.invalid' }, payload: { name: 'x' } })).statusCode).toBe(403);
    expect((await inject({ method: 'POST', url: '/api/v1/portfolios', headers: { ...headers, cookie: a }, payload: { name: 'x', ownerId: 'victim' } })).statusCode).toBe(400);
  });
  it('creates a single portfolio even with concurrent requests', async () => {
    const results = await Promise.all(['A', 'B'].map(name => inject({ method: 'POST', url: '/api/v1/portfolios', headers: { ...headers, cookie: a }, payload: { name } })));
    expect(results.map(r => r.statusCode).sort()).toEqual([201, 409]);
    id = results.find(r => r.statusCode === 201)!.json().id;
    const detail = await inject({ method: 'GET', url: `/api/v1/portfolios/${id}`, headers: { cookie: a } });
    expect(detail.statusCode).toBe(200);
    const list = await inject({ method: 'GET', url: '/api/v1/portfolios', headers: { cookie: a } });
    expect(list.json().items).toEqual([detail.json()]);
  });
  it('hides the other owner portfolio and lists only own data', async () => {
    expect((await inject({ method: 'GET', url: `/api/v1/portfolios/${id}`, headers: { cookie: b } })).statusCode).toBe(404);
    const list = await inject({ method: 'GET', url: '/api/v1/portfolios', headers: { cookie: b } });
    expect(list.json()).toEqual({ items: [] });
  });
  it('validates resource IDs, JSON payloads and body size', async () => {
    expect((await inject({ method: 'GET', url: '/api/v1/portfolios/not-a-uuid', headers: { cookie: b } })).statusCode).toBe(400);
    expect((await inject({ method: 'POST', url: '/api/v1/portfolios', headers: { ...headers, cookie: b }, payload: { name: 'x', baseCurrency: 'USD' } })).statusCode).toBe(400);
    expect((await inject({ method: 'POST', url: '/api/v1/portfolios', headers: { ...headers, cookie: b }, payload: { name: 'x'.repeat(70000) } })).statusCode).toBe(413);
    expect((await inject({ method: 'POST', url: '/api/v1/portfolios', headers: { ...headers, cookie: b, 'content-type': 'application/json' }, payload: '{' })).statusCode).toBe(400);
    expect((await inject({ method: 'POST', url: '/api/v1/portfolios', headers: { ...headers, cookie: b, 'content-type': 'application/xml' }, payload: '<portfolio />' })).statusCode).toBe(415);
  });
  it('keeps cookies HttpOnly and logs in with credentials', async () => {
    const response = await inject({ method: 'POST', url: '/api/auth/sign-in/email', headers, payload: { email: `${prefix}-b@example.com`, password: 'Test-only-passphrase-2026!' } });
    expect(response.statusCode).toBe(200);
    const cookies = response.headers['set-cookie'];
    expect(String(cookies)).toContain('HttpOnly');
    expect(String(cookies)).toMatch(/SameSite=Lax/i);
  });
  it('invalidates a session on sign out', async () => {
    expect((await inject({ method: 'POST', url: '/api/auth/sign-out', headers: { ...headers, cookie: a }, payload: {} })).statusCode).toBe(200);
    expect((await inject({ method: 'GET', url: '/api/v1/portfolios', headers: { cookie: a } })).statusCode).toBe(401);
  });
});

describe('operational boundaries', () => {
  it('serves the generated document without a session and checks healthy responses', async () => {
    const document = await inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(document.statusCode).toBe(200);
    expect(document.json()).toEqual(buildOpenApiDocument());
    for (const path of ['/health', '/ready']) {
      const response = await inject({ method: 'GET', url: path });
      expect(response.statusCode).toBe(200);
      await contractValidator.assert(path, 'get', response);
    }
  });
  it('documents sanitized internal errors', async () => {
    const isolated = await buildApp(config, {
      auth: createAuth(db, config),
      portfolios: { ...portfolioRepository(db), list: () => { throw new Error('private SQL details'); } },
      ready: async () => {},
    }, false);
    try {
      const response = await isolated.inject({ method: 'GET', url: '/api/v1/portfolios', headers: { cookie: b } });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('private');
      await contractValidator.assert('/api/v1/portfolios', 'get', response);
    } finally { await isolated.close(); }
  });
  it('rate limits requests and reports unavailable dependencies without leaking details', async () => {
    const isolated = await buildApp(config, { auth: createAuth(db, config), portfolios: portfolioRepository(db), ready: async () => { throw new Error('private db details'); } }, false);
    try {
      const ready = await isolated.inject({ method: 'GET', url: '/ready' });
      expect(ready.statusCode).toBe(503);
      await contractValidator.assert('/ready', 'get', ready);
      expect(ready.body).not.toContain('private');
      const missing = await isolated.inject({ method: 'GET', url: '/missing' });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('NOT_FOUND');
      let limited;
      for (let i = 0; i < 105; i++) {
        const response = await isolated.inject({ method: 'GET', url: '/health' });
        if (response.statusCode === 429) { limited = response; break; }
      }
      expect(limited?.statusCode).toBe(429);
      if (limited) await contractValidator.assert('/health', 'get', limited);
      expect(limited?.json().error.code).toBe('RATE_LIMITED');
    } finally { await isolated.close(); }
  });
});
