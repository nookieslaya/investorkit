import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { like, eq } from 'drizzle-orm';
import { createDatabase, user, cashOperations } from '@investorkit/db';
import { cashHistorySchema, cashOperationSchema, cashSummarySchema, portfolioSchema } from '@investorkit/shared';
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
const prefix = `cash-${randomUUID()}`;
let cookie = ''; let otherCookie = ''; let portfolioId = ''; let otherOwner = '';
const time = '2026-01-02T12:00:00Z';
const input = { kind: 'DEPOSIT', amount: '100', currency: 'PLN', fxToBase: '1', fxAsOf: time, fxSource: 'manual', occurredAt: time, note: '' };
async function call(method: 'GET' | 'POST', suffix: string, payload?: Record<string, unknown>, key: string = randomUUID(), session = cookie) {
  const response = await app.inject({ method, url: `/api/v1/portfolios/${portfolioId}${suffix}`, headers: { origin: config.WEB_ORIGIN, cookie: session, 'idempotency-key': key }, ...(payload ? { payload } : {}) });
  await validator.assert(`/api/v1/portfolios/{id}${suffix}`, method, response);
  return response;
}
beforeAll(async () => {
  for (const name of ['a', 'b']) {
    const signup = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', headers: { origin: config.WEB_ORIGIN }, payload: { name, email: `${prefix}-${name}@example.com`, password: 'Test-only-passphrase-2026!' } });
    expect(signup.statusCode).toBe(200);
    const raw = signup.headers['set-cookie'];
    const value = (Array.isArray(raw) ? raw : [raw ?? '']).map(item => item.split(';')[0]).join('; ');
    if (name === 'a') cookie = value; else otherCookie = value;
  }
  const portfolio = await app.inject({ method: 'POST', url: '/api/v1/portfolios', headers: { origin: config.WEB_ORIGIN, cookie }, payload: { name: 'Cash test' } });
  portfolioId = portfolioSchema.parse(portfolio.json()).id;
  const [other] = await db.select().from(user).where(eq(user.email, `${prefix}-b@example.com`));
  if (!other) throw new Error('Missing test user');
  otherOwner = other.id;
});
afterAll(async () => { await db.delete(user).where(like(user.email, `${prefix}%`)); await app.close(); await validator.close(); await pool.end(); });
describe('persisted cash ledger', () => {
  it('scopes reads and writes to the session owner and starts at zero', async () => {
    expect((await call('GET', '/cash', undefined, randomUUID(), '')).statusCode).toBe(401);
    expect((await call('GET', '/cash', undefined, randomUUID(), otherCookie)).statusCode).toBe(404);
    expect((await call('POST', '/cash-operations', input, randomUUID(), otherCookie)).statusCode).toBe(404);
    const result = cashSummarySchema.parse((await call('GET', '/cash')).json());
    expect(result.operationCount).toBe(0); expect(result.netContributionsBase).toBe('0');
  });
  it('persists one deposit across parallel same-key retries and rejects key/body conflicts', async () => {
    const key = randomUUID();
    const results = await Promise.all([call('POST', '/cash-operations', input, key), call('POST', '/cash-operations', input, key)]);
    expect(results.map(result => result.statusCode)).toEqual([201, 201]);
    expect(cashOperationSchema.parse(results[0]!.json()).id).toBe(cashOperationSchema.parse(results[1]!.json()).id);
    expect((await call('POST', '/cash-operations', { ...input, amount: '100.0' }, key.toUpperCase())).statusCode).toBe(201);
    expect((await call('POST', '/cash-operations', { ...input, amount: '101' }, key)).statusCode).toBe(409);
    expect(cashSummarySchema.parse((await call('GET', '/cash')).json()).operationCount).toBe(1);
  });
  it('serializes concurrent withdrawals so the same money cannot be spent twice', async () => {
    const withdrawals = await Promise.all([call('POST', '/cash-operations', { ...input, kind: 'WITHDRAWAL', amount: '80' }), call('POST', '/cash-operations', { ...input, kind: 'WITHDRAWAL', amount: '80' })]);
    expect(withdrawals.map(response => response.statusCode).sort()).toEqual([201, 422]);
    const result = cashSummarySchema.parse((await call('GET', '/cash')).json());
    expect(result.balances[0]?.amount).toBe('20'); expect(result.netContributionsBase).toBe('20');
  });
  it('rejects backdated overdrafts even when the final balance would be positive', async () => {
    expect((await call('POST', '/cash-operations', { ...input, kind: 'WITHDRAWAL', amount: '5', occurredAt: '2026-01-01T00:00:00Z', fxAsOf: '2026-01-01T00:00:00Z' })).statusCode).toBe(422);
  });
  it('stores exact 12-decimal FX and keeps currency subaccounts independent', async () => {
    const result = await call('POST', '/cash-operations', { ...input, amount: '10', currency: 'USD', fxToBase: '4.123456789012' });
    expect(result.statusCode).toBe(201);
    expect(cashOperationSchema.parse(result.json()).fxToBase).toBe('4.123456789012');
    const cash = cashSummarySchema.parse((await call('GET', '/cash')).json());
    expect(cash.netContributionsBase).toBe('61.2345678901'); expect(cash.balances[2]?.amount).toBe('10');
    expect((await call('POST', '/cash-operations', { ...input, kind: 'WITHDRAWAL', currency: 'EUR', amount: '1', fxToBase: '4' })).statusCode).toBe(422);
  });
  it('rejects invalid/missing FX, future dates, forged owners and overflow without saving rows', async () => {
    for (const extra of [{ amount: '0' }, { fxToBase: '2' }, { fxAsOf: '2099-01-01T00:00:00Z' }, { occurredAt: '2099-01-01T00:00:00Z' }, { amount: '999999999999999999', currency: 'EUR', fxToBase: '9999999999999999' }]) expect((await call('POST', '/cash-operations', { ...input, ...extra })).statusCode).toBe(422);
    for (const extra of [{ fxToBase: undefined }, { ownerId: otherOwner }, { amount: 2 }, { amount: '0.00000000001' }]) expect((await call('POST', '/cash-operations', { ...input, ...extra })).statusCode).toBe(400);
    expect((await call('POST', '/cash-operations', input, 'not-a-uuid')).statusCode).toBe(400);
    const history = cashHistorySchema.parse((await call('GET', '/cash-operations')).json());
    expect(history.items).toHaveLength(3);
    expect(JSON.stringify(history)).not.toContain('requestHash'); expect(JSON.stringify(history)).not.toContain('ownerId');
  });
  it('enforces the composite tenant FK in PostgreSQL', async () => {
    await expect(db.insert(cashOperations).values({ portfolioId, ownerId: otherOwner, kind: 'DEPOSIT', currency: 'PLN', amount: '1', fxToBase: '1', fxAsOf: new Date(time), occurredAt: new Date(time), fxSource: 'manual', idempotencyKey: randomUUID(), requestHash: 'test' })).rejects.toThrow();
  });
});
