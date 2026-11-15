import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { createDatabase, user, cashOperations, manualQuotes } from '@investorkit/db';
import { instrumentSchema, portfolioSchema, valuationSchema, operationSchema, cashSummarySchema, cashHistorySchema, operationHistorySchema } from '@investorkit/shared';
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
const prefix = `investments-${randomUUID()}`;
let a = ''; let b = ''; let ownerA = ''; let ownerB = ''; let portfolio = ''; let usd = ''; let pln = ''; let foreign = ''; let oldKey = '';
const day1 = '2026-01-01T12:00:00Z'; const day2 = '2026-01-02T12:00:00Z';
const metadata = { type: 'STOCK', symbol: 'ABC', mic: 'XNAS', name: 'Test security', currency: 'USD', quantityScale: 3 };
const deposit = { kind: 'DEPOSIT', amount: '1000', currency: 'PLN', occurredAt: day1, fxToBase: '1', fxAsOf: day1, fxSource: 'manual', note: '' };
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
async function call(method: 'GET' | 'POST', path: string, payload?: Record<string, unknown>, session = a, key: string = randomUUID()) {
  const response = await app.inject({ method, url: `/api/v1${path}`, headers: { origin: config.WEB_ORIGIN, cookie: session, 'idempotency-key': key }, ...(payload ? { payload } : {}) });
  await validator.assert(`/api/v1${path.split('?')[0]!.replace(uuid, '{id}')}`, method, response);
  return response;
}
const trade = (extra: Record<string, unknown> = {}) => ({ kind: 'BUY', instrumentId: usd, currency: 'USD', commissionCurrency: 'USD', quantity: '0.125', unitPrice: '80', commission: '0.5', occurredAt: day2, fxToBase: '4', fxAsOf: day2, fxSource: 'manual', note: '', ...extra });
const value = async (suffix = '') => { const response = await call('GET', `/portfolios/${portfolio}/valuation${suffix}`); expect(response.statusCode, response.body).toBe(200); return valuationSchema.parse(response.json()); };
beforeAll(async () => {
  for (const label of ['a', 'b']) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', headers: { origin: config.WEB_ORIGIN }, payload: { name: label, email: `${prefix}-${label}@example.com`, password: 'Test-only-passphrase-2026!' } });
    expect(response.statusCode).toBe(200);
    const raw = response.headers['set-cookie']; const cookie = (Array.isArray(raw) ? raw : [raw ?? '']).map(item => item.split(';')[0]).join('; ');
    const [row] = await db.select().from(user).where(eq(user.email, `${prefix}-${label}@example.com`));
    if (!row) throw new Error('Missing user');
    if (label === 'a') { a = cookie; ownerA = row.id; } else { b = cookie; ownerB = row.id; }
  }
  portfolio = portfolioSchema.parse((await call('POST', '/portfolios', { name: 'Investment tests' })).json()).id;
  usd = instrumentSchema.parse((await call('POST', '/instruments', metadata)).json()).id;
  pln = instrumentSchema.parse((await call('POST', '/instruments', { ...metadata, symbol: 'PLN', currency: 'PLN', mic: 'XWAR', quantityScale: 0 })).json()).id;
  foreign = instrumentSchema.parse((await call('POST', '/instruments', metadata, b)).json()).id;
  oldKey = randomUUID();
  await call('POST', `/portfolios/${portfolio}/cash-operations`, deposit, a, oldKey);
  await call('POST', `/portfolios/${portfolio}/cash-operations`, { ...deposit, currency: 'USD', amount: '20', fxToBase: '4' });
});
afterAll(async () => { await db.delete(user).where(like(user.email, `${prefix}%`)); await app.close(); await validator.close(); await pool.end(); });
describe('P04 integrated ledger, markets and valuation', () => {
  it('preserves legacy P03 canonical hashes and retry keys across both operation endpoints', async () => {
    const legacy = '{"kind":"DEPOSIT","currency":"PLN","amount":"1000","fxToBase":"1","fxAsOf":"2026-01-01T12:00:00.000Z","fxSource":"manual","occurredAt":"2026-01-01T12:00:00.000Z","note":""}';
    const [row] = await db.select().from(cashOperations).where(eq(cashOperations.idempotencyKey, oldKey));
    expect(row?.requestHash).toBe(createHash('sha256').update(legacy).digest('hex'));
    const retry = await call('POST', `/portfolios/${portfolio}/operations`, deposit, a, oldKey.toUpperCase());
    expect(retry.statusCode).toBe(201); expect(operationSchema.parse(retry.json()).id).toBe(row?.id);
  });
  it('enforces session ownership for instruments, quotes, operations and valuations', async () => {
    expect((await call('GET', '/instruments', undefined, '')).statusCode).toBe(401);
    expect((await call('POST', `/instruments/${usd}/quotes`, { currency: 'USD', price: '90', asOf: day2, source: 'manual' }, b)).statusCode).toBe(404);
    expect((await call('GET', `/portfolios/${portfolio}/valuation`, undefined, b)).statusCode).toBe(404);
    expect((await call('POST', `/portfolios/${portfolio}/operations`, trade(), b)).statusCode).toBe(404);
    expect((await call('POST', `/portfolios/${portfolio}/operations`, trade({ instrumentId: foreign }))).statusCode).toBe(404);
  });
  it('commits a single BUY across parallel same-key requests and exposes the same cash to the old cash API', async () => {
    const key = randomUUID();
    const results = await Promise.all([call('POST', `/portfolios/${portfolio}/operations`, trade(), a, key), call('POST', `/portfolios/${portfolio}/operations`, trade(), a, key)]);
    expect(results.map(row => row.statusCode)).toEqual([201, 201]);
    expect(operationSchema.parse(results[0]!.json()).id).toBe(operationSchema.parse(results[1]!.json()).id);
    expect(cashSummarySchema.parse((await call('GET', `/portfolios/${portfolio}/cash`)).json()).balances[2]?.amount).toBe('9.5');
    expect((await call('POST', `/portfolios/${portfolio}/cash-operations`, { ...deposit, kind: 'WITHDRAWAL', amount: '10', currency: 'USD', fxToBase: '4', occurredAt: day2, fxAsOf: day2 })).statusCode).toBe(422);
    const valuation = await value();
    expect(valuation.complete).toBe(false); expect(valuation.totalValue).toBeNull(); expect(valuation.pricedSubtotal).toBe('1000');
    expect(valuation.positions[0]?.issues).toEqual(['MISSING_QUOTE', 'MISSING_FX']);
  });
  it('excludes stale prices then returns the golden3 values when fresh data is supplied', async () => {
    expect((await call('POST', '/fx-rates', { currency: 'USD', baseCurrency: 'PLN', rate: '4.2', asOf: new Date().toISOString(), source: 'manual' })).statusCode).toBe(201);
    await call('POST', `/instruments/${usd}/quotes`, { currency: 'USD', price: '90', asOf: day2, source: 'manual' });
    expect((await value()).positions[0]?.issues).toContain('STALE_QUOTE');
    await call('POST', `/instruments/${usd}/quotes`, { currency: 'USD', price: '90', asOf: new Date().toISOString(), source: 'manual' });
    const result = await value();
    expect(result.complete).toBe(true); expect(result.positions[0]).toMatchObject({ valueBase: '47.25', unrealizedBase: '5.25', remainingCostBase: '42' });
    expect(result.totalValue).toBe('1087.15'); expect(result.pnl).toBe('7.15'); expect(result.netContributionsBase).toBe('1080');
  });
  it('serializes concurrent BUY and SELL requests and prevents negative quantity or double spending', async () => {
    const input = trade({ instrumentId: pln, currency: 'PLN', commissionCurrency: 'PLN', quantity: '1', unitPrice: '700', commission: '0', fxToBase: '1' });
    const buys = await Promise.all([call('POST', `/portfolios/${portfolio}/operations`, input), call('POST', `/portfolios/${portfolio}/operations`, input)]);
    expect(buys.map(row => row.statusCode).sort()).toEqual([201, 422]);
    const sells = await Promise.all([call('POST', `/portfolios/${portfolio}/operations`, { ...input, kind: 'SELL', unitPrice: '750' }), call('POST', `/portfolios/${portfolio}/operations`, { ...input, kind: 'SELL', unitPrice: '750' })]);
    expect(sells.map(row => row.statusCode).sort()).toEqual([201, 422]);
    expect(cashSummarySchema.parse((await call('GET', `/portfolios/${portfolio}/cash`)).json()).balances[0]?.amount).toBe('1050');
    expect((await value()).realizedBase).toBe('50'); expect((await value()).pnl).toBe('57.15');
  });
  it('checks backdated cash withdrawals against later BUY operations, not only the final cash balance', async () => {
    expect((await call('POST', `/portfolios/${portfolio}/cash-operations`, { ...deposit, kind: 'WITHDRAWAL', amount: '500', occurredAt: '2026-01-01T18:00:00Z' })).statusCode).toBe(422);
    expect((await call('POST', `/portfolios/${portfolio}/operations`, trade({ kind: 'SELL', occurredAt: '2026-01-01T18:00:00Z', fxAsOf: day1 }))).statusCode).toBe(422);
  });
  it('rejects mismatched units, unsupported commission currency, future market data and forged owners', async () => {
    expect((await call('POST', `/portfolios/${portfolio}/operations`, trade({ commissionCurrency: 'EUR' }))).statusCode).toBe(422);
    expect((await call('POST', `/instruments/${usd}/quotes`, { currency: 'PLN', price: '1', asOf: day2, source: 'manual' })).statusCode).toBe(422);
    expect((await call('POST', `/instruments/${usd}/quotes`, { currency: 'USD', price: '1', asOf: '2099-01-01T00:00:00Z', source: 'manual' })).statusCode).toBe(422);
    expect((await call('POST', '/fx-rates', { currency: 'USD', baseCurrency: 'PLN', rate: '4', asOf: '2099-01-01T00:00:00Z', source: 'manual' })).statusCode).toBe(422);
    expect((await call('POST', '/instruments', { ...metadata, symbol: 'FAKE', ownerId: ownerB })).statusCode).toBe(400);
    expect((await call('POST', '/instruments', metadata)).statusCode).toBe(409);
    expect((await call('GET', `/portfolios/${portfolio}/valuation?asOf=2099-01-01T00:00:00Z`)).statusCode).toBe(422);
    expect((await call('GET', `/portfolios/${portfolio}/valuation?asOf=invalid`)).statusCode).toBe(400);
  });
  it('selects eligible historical rates without overwriting current FX or historical transaction cost', async () => {
    await call('POST', '/fx-rates', { currency: 'USD', baseCurrency: 'PLN', rate: '4', asOf: day1, source: 'manual' });
    const past = await value(`?asOf=${day1}`);
    expect(past.positions).toHaveLength(0); expect(past.totalValue).toBe('1080'); expect(past.pnl).toBe('0');
    expect((await value()).positions[0]?.remainingCostBase).toBe('42');
    expect((await value()).totalValue).toBe('1137.15');
    expect(cashHistorySchema.parse((await call('GET', `/portfolios/${portfolio}/cash-operations`)).json()).items).toHaveLength(2);
    expect(operationHistorySchema.parse((await call('GET', `/portfolios/${portfolio}/operations`)).json()).items).toHaveLength(5);
  });
  it('enforces tenant and currency boundaries directly in PostgreSQL', async () => {
    await expect(db.insert(manualQuotes).values({ ownerId: ownerB, instrumentId: usd, currency: 'USD', price: '90', asOf: new Date(), source: 'manual' })).rejects.toThrow();
    await expect(db.insert(manualQuotes).values({ ownerId: ownerA, instrumentId: usd, currency: 'EUR', price: '90', asOf: new Date(), source: 'manual' })).rejects.toThrow();
    await expect(db.insert(cashOperations).values({ ownerId: ownerA, portfolioId: portfolio, instrumentId: foreign, kind: 'BUY', currency: 'USD', quantity: '1', unitPrice: '1', commission: '0', commissionCurrency: 'USD', fxToBase: '4', occurredAt: new Date(day2), fxAsOf: new Date(day2), fxSource: 'manual', idempotencyKey: randomUUID(), requestHash: 'test' })).rejects.toThrow();
  });
});
