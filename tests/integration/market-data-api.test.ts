import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, like } from 'drizzle-orm';
import { createDatabase, user, marketBindings, marketQuotes, marketSelections, marketBudget } from '@investorkit/db';
import { marketSearchSchema, marketStatesSchema, marketStateSchema } from '@investorkit/shared';
import { marketDataService } from '../../apps/api/src/market-data-service.js';
import type { EodPrice } from '../../apps/api/src/market-data-provider.js';
import { MarketDataError } from '../../apps/api/src/market-data-provider.js';
import { buildApp } from '../../apps/api/src/app.js';
import { createAuth } from '../../apps/api/src/auth.js';
import { parseConfig } from '../../apps/api/src/config.js';
import { portfolioRepository } from '../../apps/api/src/portfolio-repository.js';
import { createContractValidator } from '../response-contract.js';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required');
const config = parseConfig({ DATABASE_URL: url, BETTER_AUTH_SECRET: 'integration-only-secret-32-characters-minimum', BETTER_AUTH_URL: 'http://localhost:5173', WEB_ORIGIN: 'http://localhost:5173', NODE_ENV: 'development', MARKETSTACK_ENABLED: 'true', MARKETSTACK_API_KEY: 'fixture-only' });
const { db, pool } = createDatabase(url);
const repo = portfolioRepository(db);
const price: EodPrice = { price: '100.1234567890', currency: 'PLN', sessionDate: new Date().toISOString().slice(0, 10), asOf: new Date(Date.now() - 3600000).toISOString(), fetchedAt: new Date().toISOString() };
const latest = vi.fn(async () => price);
const provider = { search: vi.fn(async () => ({ items: [{ symbol: 'PKO.WA', name: 'Powszechna Kasa Bank Polski', mic: 'XWAR' }], partial: false })), latest };
const market = marketDataService(db, config, provider);
const app = await buildApp(config, { market, auth: createAuth(db, config), portfolios: repo, ready: async () => {} }, false);
const validator = await createContractValidator();
const prefix = `market-${randomUUID()}`;
let owner = ''; let foreignOwner = ''; let cookie = ''; let id = ''; let otherId = ''; let portfolioId = ''; let selectionId = '';
async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: Record<string, unknown>) {
  const response = await app.inject({ method, url: `/api/v1${path}`, headers: { origin: config.WEB_ORIGIN, cookie }, ...(payload ? { payload } : {}) });
  await validator.assert(`/api/v1${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, '{id}')}`, method, response);
  return response;
}
beforeAll(async () => {
  const signup = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', headers: { origin: config.WEB_ORIGIN }, payload: { name: 'Market test', email: `${prefix}@example.com`, password: 'Test-only-passphrase-2026!' } });
  expect(signup.statusCode).toBe(200);
  const cookies = signup.headers['set-cookie']; cookie = (Array.isArray(cookies) ? cookies : [cookies ?? '']).map(x => x.split(';')[0]).join('; ');
  const [row] = await db.select().from(user).where(eq(user.email, `${prefix}@example.com`));
  if (!row) throw new Error('Missing user'); owner = row.id;
  foreignOwner = `${prefix}-other`;
  await db.insert(user).values({ id: foreignOwner, name: 'Foreign', email: `${prefix}-other@example.com` });
  const metadata = { name: 'PKO', symbol: 'PKO', mic: 'XWAR', type: 'STOCK' as const, currency: 'PLN' as const, quantityScale: 0, isin: null, issuerCountry: null };
  id = (await repo.createInstrument(owner, metadata)).id;
  otherId = (await repo.createInstrument(foreignOwner, metadata)).id;
  portfolioId = (await repo.create(owner, { name: 'Market tests', baseCurrency: 'PLN' })).id;
  const occurredAt = new Date(Date.now() - 7200000).toISOString();
  await repo.createCashOperation(owner, portfolioId, { kind: 'DEPOSIT', currency: 'PLN', amount: '1000', occurredAt, fxToBase: '1', fxAsOf: occurredAt, fxSource: 'manual', note: '' }, randomUUID());
  await repo.createOperation(owner, portfolioId, { kind: 'BUY', instrumentId: id, currency: 'PLN', quantity: '1', unitPrice: '80', commission: '0', commissionCurrency: 'PLN', occurredAt, fxToBase: '1', fxAsOf: occurredAt, fxSource: 'manual', note: '' }, randomUUID());
  await repo.createQuote(owner, id, { price: '70', currency: 'PLN', asOf: price.asOf, source: 'manual' });
});
afterAll(async () => { await db.delete(user).where(like(user.email, `${prefix}%`)); await app.close(); await validator.close(); await pool.end(); });
describe('Marketstack service on disposable PostgreSQL (fixture provider, no external API)', () => {
  it('requires authentication and validates search parameters', async () => {
    expect((await app.inject({ url: '/api/v1/market' })).statusCode).toBe(401);
    expect((await call('POST', '/market/search', { query: 'PK', mic: 'XWAR' })).statusCode).toBe(400);
  });
  it('caches validated currency results privately and excludes other owners', async () => {
    const first = marketSearchSchema.parse((await call('POST', '/market/search', { query: 'Powszechna Kasa', mic: 'XWAR' })).json());
    selectionId = first.items[0]!.id; expect(first.cached).toBe(false);
    const second = await market.search(owner, 'Powszechna Kasa', 'XWAR'); expect(second.cached).toBe(true);
    expect(provider.search).toHaveBeenCalledTimes(1); expect(latest).toHaveBeenCalledTimes(1);
    const foreign = await market.search(foreignOwner, 'Powszechna Kasa', 'XWAR');
    expect(foreign.items[0]?.id).not.toBe(selectionId); expect(provider.search).toHaveBeenCalledTimes(2);
    await expect(market.bind(owner, otherId, selectionId)).rejects.toHaveProperty('statusCode', 404);
    await expect(market.bind(foreignOwner, otherId, selectionId)).rejects.toHaveProperty('code', 'SELECTION_EXPIRED');
  });
  it('binds explicitly and uses the chosen price source without changing historical cost or manual prices', async () => {
    const result = await call('POST', `/instruments/${id}/market-binding`, { selectionId });
    expect(result.statusCode, result.body).toBe(200); expect(marketStateSchema.parse(result.json()).symbol).toBe('PKO.WA');
    const value = await repo.valuation(owner, portfolioId, new Date().toISOString());
    expect(value.positions[0]?.quote?.source).toBe('marketstack');
    expect(value.positions[0]?.quote?.price).toBe('100.1234567890');
    expect(value.positions[0]?.remainingCostBase).toBe('80');
    await call('PATCH', `/instruments/${id}/market-binding`, { mode: 'manual' });
    expect((await repo.valuation(owner, portfolioId, new Date().toISOString())).positions[0]?.quote?.price).toBe('70.0000000000');
    await market.mode(owner, id, 'marketstack');
    expect((await repo.listQuotes(owner, id)).items).toHaveLength(1);
  });
  it('shares idempotency between concurrent manual refreshes, processes and the daily job', async () => {
    await db.update(marketBindings).set({ lastAttemptAt: null }).where(eq(marketBindings.instrumentId, id)); latest.mockClear();
    const secondProcess = marketDataService(db, config, provider);
    await Promise.all([market.refresh(owner, id), market.refresh(owner, id), secondProcess.refresh(owner, id)]);
    await market.daily();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(await db.select().from(marketQuotes).where(eq(marketQuotes.instrumentId, id))).toHaveLength(1);
    expect((await call('POST', `/instruments/${id}/market-refresh`, {})).statusCode).toBe(200);
  });
  it('keeps the original price/date after failure and reports a separate attempt status', async () => {
    await db.update(marketBindings).set({ lastAttemptAt: null }).where(eq(marketBindings.instrumentId, id));
    latest.mockRejectedValueOnce(new MarketDataError('QUOTA_ERROR'));
    const failed = await market.refresh(owner, id);
    expect(failed.status).toBe('QUOTA_ERROR'); expect(failed.quote?.asOf).toBe(price.asOf);
    expect(failed.quote?.price).toBe('100.1234567890');
    const calls = latest.mock.calls.length; await market.refresh(owner, id); expect(latest).toHaveBeenCalledTimes(calls);
    expect(marketStatesSchema.parse((await call('GET', '/market')).json()).items[0]?.status).toBe('QUOTA_ERROR');
  });
  it('does not apply a currency mismatch or old date as a complete valuation', async () => {
    await db.update(marketBindings).set({ lastAttemptAt: null }).where(eq(marketBindings.instrumentId, id));
    latest.mockResolvedValueOnce({ ...price, currency: 'USD' });
    expect((await market.refresh(owner, id)).status).toBe('CURRENCY_MISMATCH');
    await db.update(marketQuotes).set({ asOf: new Date('2020-01-01T00:00:00Z') }).where(eq(marketQuotes.instrumentId, id));
    const stale = await repo.valuation(owner, portfolioId, new Date().toISOString());
    expect(stale.totalValue).toBeNull(); expect(stale.positions[0]?.issues).toContain('STALE_QUOTE');
  });
  it('rejects incompatible or expired selections and leaves mapping unchanged', async () => {
    const wrong = (await repo.createInstrument(owner, { name: 'USD', symbol: 'USD', mic: 'XNAS', type: 'STOCK', currency: 'USD', quantityScale: 0, isin: null, issuerCountry: null })).id;
    await expect(market.bind(owner, wrong, selectionId)).rejects.toHaveProperty('code', 'LISTING_MISMATCH');
    await db.update(marketSelections).set({ expiresAt: new Date(0) }).where(eq(marketSelections.id, selectionId));
    await expect(market.bind(owner, id, selectionId)).rejects.toHaveProperty('code', 'SELECTION_EXPIRED');
    expect((await db.select().from(marketBindings).where(and(eq(marketBindings.instrumentId, id), eq(marketBindings.ownerId, owner))))[0]?.symbol).toBe('PKO.WA');
    await expect(market.refresh(owner, otherId)).rejects.toHaveProperty('statusCode', 404);
  });
});


describe('durable provider budget', () => {
  it('blocks requests before I/O after budget exhaustion, including a second service instance', async () => {
    const key = `fixture-${randomUUID()}`;
    const budgetId = `${createHash('sha256').update(key).digest('hex').slice(0,16)}:${new Date().toISOString().slice(0,7)}`;
    await db.insert(marketBudget).values({ id: budgetId, used: 1 });
    try {
      const limitedConfig = { ...config, MARKETSTACK_API_KEY: key, MARKETSTACK_MONTHLY_BUDGET: 1 };
      for (let i = 0; i < 2; i++) await expect(marketDataService(db, limitedConfig).search(owner, 'uncached-budget', 'XNAS')).rejects.toHaveProperty('code', 'MARKET_SEARCH_FAILED');
      const [row] = await db.select().from(marketBudget).where(eq(marketBudget.id, budgetId));
      expect(row?.used).toBe(1);
    } finally { await db.delete(marketBudget).where(eq(marketBudget.id, budgetId)); }
  });
});
