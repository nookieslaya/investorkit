import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { createDatabase, user, journalEntries, cashOperations, manualQuotes, fxRates } from '@investorkit/db';
import { instrumentSchema, journalEntrySchema, journalListSchema, journalDeletedSchema, portfolioSchema, journalInputSchema } from '@investorkit/shared';
import { buildApp } from '../../apps/api/src/app.js';
import { createAuth } from '../../apps/api/src/auth.js';
import { parseConfig } from '../../apps/api/src/config.js';
import { portfolioRepository } from '../../apps/api/src/portfolio-repository.js';
import { createContractValidator } from '../response-contract.js';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required');
const config = parseConfig({ DATABASE_URL: url, BETTER_AUTH_SECRET: 'integration-only-secret-32-characters-minimum', BETTER_AUTH_URL: 'http://localhost:5173', WEB_ORIGIN: 'http://localhost:5173', NODE_ENV: 'test' });
const { db, pool } = createDatabase(url);
const app = await buildApp(config, { auth: createAuth(db, config), portfolios: portfolioRepository(db), ready: async () => {} }, false);
const validator = await createContractValidator();
const prefix = `journal-${randomUUID()}`;
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
let a = ''; let b = ''; let owner = ''; let ownerB = ''; let portfolio = ''; let portfolioB = ''; let instrument = ''; let foreign = '';
const input = journalInputSchema.parse({ decidedAt: '2026-01-01T12:00:00Z', reason: 'Powód decyzji', thesis: '<script>private</script>\nDruga linia' });
async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: Record<string, unknown>, cookie = a, revision?: number | string, origin = config.WEB_ORIGIN) {
  const response = await app.inject({ method, url: `/api/v1${path}`, headers: { cookie, origin, ...(revision === undefined ? {} : { 'if-match': typeof revision === 'number' ? `"${revision}"` : revision }) }, ...(payload ? { payload } : {}) });
  await validator.assert(`/api/v1${path.replace(uuid, '{id}')}`, method, response);
  expect(response.headers['cache-control']).toBe('no-store');
  return response;
}
const path = () => `/portfolios/${portfolio}/journal`;
async function create(extra: Record<string, unknown> = {}) {
  const response = await call('POST', path(), { ...input, ...extra });
  expect(response.statusCode, response.body).toBe(201);
  return journalEntrySchema.parse(response.json());
}
beforeAll(async () => {
  for (const label of ['a', 'b']) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', headers: { origin: config.WEB_ORIGIN }, payload: { name: label, email: `${prefix}-${label}@example.com`, password: 'Test-only-passphrase-2026!' } });
    expect(response.statusCode).toBe(200);
    const raw = response.headers['set-cookie']; const cookie = (Array.isArray(raw) ? raw : [raw ?? '']).map(item => item.split(';')[0]).join('; ');
    const [row] = await db.select().from(user).where(eq(user.email, `${prefix}-${label}@example.com`));
    if (!row) throw new Error('Missing user');
    if (label === 'a') { a = cookie; owner = row.id; } else { b = cookie; ownerB = row.id; }
  }
  portfolio = portfolioSchema.parse((await call('POST', '/portfolios', { name: 'Journal' })).json()).id;
  portfolioB = portfolioSchema.parse((await call('POST', '/portfolios', { name: 'Journal B' }, b)).json()).id;
  const metadata = { type: 'ETF', symbol: 'JOURNAL', mic: 'XWAR', name: 'Journal instrument', currency: 'PLN', quantityScale: 0 };
  instrument = instrumentSchema.parse((await call('POST', '/instruments', metadata)).json()).id;
  foreign = instrumentSchema.parse((await call('POST', '/instruments', metadata, b)).json()).id;
});
afterAll(async () => { await db.delete(user).where(like(user.email, `${prefix}%`)); await app.close(); await validator.close(); await pool.end(); });
describe('A08 private journal', () => {
  it('requires session and origin, scopes every read/write to the owner and hides private fields', async () => {
    const row = await create();
    expect((await call('GET', path(), undefined, '')).statusCode).toBe(401);
    expect((await call('GET', path(), undefined, b)).statusCode).toBe(404);
    expect((await call('POST', path(), input, b)).statusCode).toBe(404);
    expect((await call('POST', path(), input, a, undefined, 'https://other.example')).statusCode).toBe(403);
    for (const method of ['PATCH', 'DELETE'] as const) {
      expect((await call(method, `/journal/${row.id}`, method === 'PATCH' ? input : undefined, '', 1)).statusCode).toBe(401);
      const response = await call(method, `/journal/${row.id}`, method === 'PATCH' ? input : undefined, b, 1);
      expect(response.statusCode).toBe(404); expect(response.body).not.toContain(row.thesis);
      expect((await call(method, `/journal/${row.id}`, method === 'PATCH' ? input : undefined, a, 1, 'https://other.example')).statusCode).toBe(403);
    }
    const list = journalListSchema.parse((await call('GET', path())).json());
    expect(list.items.find(item => item.id === row.id)).toEqual(row);
    expect(row).not.toHaveProperty('ownerId');
    expect(journalListSchema.parse((await call('GET', `/portfolios/${portfolioB}/journal`, undefined, b)).json()).items).toEqual([]);
  });
  it('stores plain text and an optional own instrument without requiring an open position', async () => {
    const row = await create({ instrumentId: instrument, notes: '  <img src=x onerror=alert(1)>  ', reason: '  Uzasadnienie  ' });
    expect(row).toMatchObject({ instrumentId: instrument, revision: 1, reason: 'Uzasadnienie', notes: '<img src=x onerror=alert(1)>', thesis: input.thesis });
    expect((await call('POST', path(), { ...input, instrumentId: foreign })).statusCode).toBe(404);
    expect((await call('PATCH', `/journal/${row.id}`, { ...input, instrumentId: foreign }, a, 1)).statusCode).toBe(404);
  });
  it('rejects forged fields, invalid dates and oversized text; requires a quoted revision', async () => {
    for (const extra of [{ ownerId: ownerB }, { revision: 99 }, { reason: ' ' }, { thesis: '' }, { notes: 'x'.repeat(10001) }, { decidedAt: 'invalid' }]) {
      expect((await call('POST', path(), { ...input, ...extra })).statusCode).toBe(400);
    }
    expect((await call('POST', path(), { ...input, decidedAt: '2099-01-01T00:00:00Z' })).statusCode).toBe(422);
    const row = await create();
    for (const method of ['PATCH', 'DELETE'] as const) {
      expect((await call(method, `/journal/${row.id}`, method === 'PATCH' ? input : undefined)).statusCode).toBe(428);
      for (const revision of ['1', '"0"', 'W/"1"', '"2147483648"']) expect((await call(method, `/journal/${row.id}`, method === 'PATCH' ? input : undefined, a, revision)).statusCode).toBe(400);
    }
  });
  it('serializes concurrent edits and refuses stale update/delete revisions without losing the winning text', async () => {
    const row = await create();
    const results = await Promise.all(['A', 'B'].map(thesis => call('PATCH', `/journal/${row.id}`, { ...input, thesis }, a, 1)));
    expect(results.map(result => result.statusCode).sort()).toEqual([200, 409]);
    const winnerResponse = results.find(result => result.statusCode === 200)!;
    const winner = journalEntrySchema.parse(winnerResponse.json());
    expect(winner.revision).toBe(2); expect(winnerResponse.headers.etag).toBe('"2"');
    expect((await call('DELETE', `/journal/${row.id}`, undefined, a, 1)).statusCode).toBe(409);
    expect((await call('PATCH', `/journal/${row.id}`, { ...input, thesis: 'stale' }, a, 1)).statusCode).toBe(409);
    expect(journalListSchema.parse((await call('GET', path())).json()).items.find(item => item.id === row.id)).toEqual(winner);
    const removed = await call('DELETE', `/journal/${row.id}`, undefined, a, 2);
    expect(removed.statusCode).toBe(200); expect(journalDeletedSchema.parse(removed.json())).toEqual({ id: row.id, deleted: true });
    expect((await call('PATCH', `/journal/${row.id}`, input, a, 2)).statusCode).toBe(404);
    expect((await call('DELETE', `/journal/${row.id}`, undefined, a, 2)).statusCode).toBe(404);
  });
  it('orders the list by decision time and does not modify the financial ledger, quotes or FX', async () => {
    async function financialRows() { return { ledger: await db.select().from(cashOperations).where(eq(cashOperations.ownerId, owner)), quotes: await db.select().from(manualQuotes).where(eq(manualQuotes.ownerId, owner)), fx: await db.select().from(fxRates).where(eq(fxRates.ownerId, owner)) }; }
    await db.insert(cashOperations).values({ ownerId: owner, portfolioId: portfolio, kind: 'DEPOSIT', currency: 'PLN', amount: '100', occurredAt: new Date(input.decidedAt), fxToBase: '1', fxAsOf: new Date(input.decidedAt), fxSource: 'manual', note: '', idempotencyKey: randomUUID(), requestHash: 'journal-financial-preservation-fixture' });
    const before = await financialRows();
    const later = await create({ decidedAt: '2026-02-01T12:00:00Z' });
    const earlier = await create({ decidedAt: '2025-01-01T12:00:00Z' });
    const list = journalListSchema.parse((await call('GET', path())).json());
    expect(list.items[0]?.id).toBe(later.id); expect(list.items.at(-1)?.id).toBe(earlier.id);
    expect((await call('PATCH', `/journal/${later.id}`, { ...input, notes: 'Updated' }, a, 1)).statusCode).toBe(200);
    expect((await call('DELETE', `/journal/${later.id}`, undefined, a, 2)).statusCode).toBe(200);
    expect(await financialRows()).toEqual(before);
  });
  it('enforces owner foreign keys, revision and text constraints directly in PostgreSQL', async () => {
    const fields = { ...input, ownerId: owner, portfolioId: portfolio, decidedAt: new Date(input.decidedAt) };
    for (const extra of [{ portfolioId: portfolioB }, { instrumentId: foreign }, { revision: 0 }, { reason: '' }, { thesis: ' ' }, { notes: 'x'.repeat(10001) }]) {
      await expect(db.insert(journalEntries).values({ ...fields, ...extra })).rejects.toThrow();
    }
  });
  it('serializes concurrent creates at the 100-entry limit instead of silently truncating the list', async () => {
    await db.insert(journalEntries).values(Array.from({ length: 99 }, () => ({ ...input, decidedAt: new Date(input.decidedAt), ownerId: ownerB, portfolioId: portfolioB })));
    const results = await Promise.all([call('POST', `/portfolios/${portfolioB}/journal`, input, b), call('POST', `/portfolios/${portfolioB}/journal`, input, b)]);
    expect(results.map(result => result.statusCode).sort()).toEqual([201, 422]);
    expect(journalListSchema.parse((await call('GET', `/portfolios/${portfolioB}/journal`, undefined, b)).json()).items).toHaveLength(100);
  });
});
