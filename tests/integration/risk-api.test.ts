import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { createDatabase, user, riskSettings, cashOperations, manualQuotes, fxRates } from '@investorkit/db';
import { DEFAULT_RISK_SETTINGS, portfolioSchema, instrumentSchema, riskSchema, stressSchema, riskSettingsSchema, valuationSchema, simulationSchema } from '@investorkit/shared';
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
const prefix = `risk-${randomUUID()}`;
let a = ''; let b = ''; let owner = ''; let ownerB = ''; let portfolio = ''; let foreign = ''; let idle = '';
const ids: string[] = [];
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: Record<string, unknown>, session = a, revision?: number | string, origin = config.WEB_ORIGIN) {
  const response = await app.inject({ method, url: `/api/v1${path}`, headers: { origin, cookie: session, 'idempotency-key': randomUUID(), ...(revision === undefined ? {} : { 'if-match': typeof revision === 'number' ? `"${revision}"` : revision }) }, ...(payload ? { payload } : {}) });
  await validator.assert(`/api/v1${path.replace(uuid, '{id}')}`, method, response);
  return response;
}
const endpoint = (suffix: string) => `/portfolios/${portfolio}/${suffix}`;
const stress = (extra: Record<string, unknown> = {}) => call('POST', endpoint('stress-tests'), { scope: 'SECURITIES', dropPct: '50', ...extra });
async function records() {
  return { ledger: await db.select().from(cashOperations).where(eq(cashOperations.ownerId, owner)), quotes: await db.select().from(manualQuotes).where(eq(manualQuotes.ownerId, owner)), fx: await db.select().from(fxRates).where(eq(fxRates.ownerId, owner)), settings: await db.select().from(riskSettings).where(eq(riskSettings.ownerId, owner)) };
}
beforeAll(async () => {
  for (const label of ['a', 'b']) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', headers: { origin: config.WEB_ORIGIN }, payload: { name: label, email: `${prefix}-${label}@example.com`, password: 'Test-only-passphrase-2026!' } });
    expect(response.statusCode).toBe(200);
    const raw = response.headers['set-cookie']; const cookie = (Array.isArray(raw) ? raw : [raw ?? '']).map(item => item.split(';')[0]).join('; ');
    const [row] = await db.select().from(user).where(eq(user.email, `${prefix}-${label}@example.com`));
    if (label === 'a') { a = cookie; owner = row!.id; } else { b = cookie; ownerB = row!.id; }
  }
  portfolio = portfolioSchema.parse((await call('POST', '/portfolios', { name: 'Risk integration' })).json()).id;
  const instrument = { type: 'STOCK', symbol: 'A', mic: 'XWAR', name: 'Risk instrument', currency: 'PLN', quantityScale: 10, issuerCountry: 'PL' };
  const day = '2026-01-01T12:00:00Z';
  const common = { currency: 'PLN', occurredAt: day, fxAsOf: day, fxToBase: '1', fxSource: 'manual', note: '' };
  await call('POST', endpoint('cash-operations'), { ...common, kind: 'DEPOSIT', amount: '1100' });
  for (const [symbol, price, country] of [['A', '600', 'PL'], ['B', '300', 'US'], ['C', '100', null]]) {
    const id = instrumentSchema.parse((await call('POST', '/instruments', { ...instrument, symbol, type: symbol === 'C' ? 'ETF' : 'STOCK', issuerCountry: country })).json()).id;
    ids.push(id);
    expect((await call('POST', endpoint('operations'), { ...common, kind: 'BUY', instrumentId: id, quantity: '1', unitPrice: price, commission: '0', commissionCurrency: 'PLN' })).statusCode).toBe(201);
    expect((await call('POST', `/instruments/${id}/quotes`, { currency: 'PLN', price, asOf: new Date(Date.now() - 2 * 3600000).toISOString(), source: 'manual' })).statusCode).toBe(201);
  }
  idle = instrumentSchema.parse((await call('POST', '/instruments', { ...instrument, symbol: 'IDLE' })).json()).id;
  foreign = instrumentSchema.parse((await call('POST', '/instruments', instrument, b)).json()).id;
});
afterAll(async () => { await db.delete(user).where(like(user.email, `${prefix}%`)); await app.close(); await validator.close(); await pool.end(); });
describe('P06/A07 concentration, scenarios and settings', () => {
  it('reads defaults without creating settings rows', async () => {
    const response = await call('GET', endpoint('risk-settings')); expect(response.statusCode).toBe(200);
    expect(riskSettingsSchema.parse(response.json())).toEqual({ ...DEFAULT_RISK_SETTINGS, revision: 0 });
    expect(response.headers.etag).toBe('"0"'); expect((await records()).settings).toEqual([]);
  });
  it('enforces session, origin, portfolio ownership and target ownership', async () => {
    for (const suffix of ['risk', 'risk-settings']) {
      expect((await call('GET', endpoint(suffix), undefined, '')).statusCode).toBe(401);
      expect((await call('GET', endpoint(suffix), undefined, b)).statusCode).toBe(404);
    }
    expect((await call('POST', endpoint('stress-tests'), { scope: 'SECURITIES', dropPct: '50' }, b)).statusCode).toBe(404);
    expect((await stress({ scope: 'INSTRUMENT', instrumentId: foreign })).statusCode).toBe(404);
    expect((await stress({ scope: 'INSTRUMENT', instrumentId: idle })).statusCode).toBe(422);
    expect((await call('PATCH', endpoint('risk-settings'), DEFAULT_RISK_SETTINGS, b, 0)).statusCode).toBe(404);
    expect((await call('PATCH', endpoint('risk-settings'), DEFAULT_RISK_SETTINGS, a, 0, 'https://other.example')).statusCode).toBe(403);
  });
  it('returns golden5 values including unknown country, cash and the single-position case', async () => {
    const response = await call('GET', endpoint('risk')); expect(response.statusCode, response.body).toBe(200);
    const result = riskSchema.parse(response.json());
    expect(result).toMatchObject({ valuation: { totalValue: '1100' }, concentration: { largestPositionPct: '54.54545454545454545454545454545454545455', top3Pct: '90.90909090909090909090909090909090909091', maxPositionExceeded: true } });
    expect(result.allocations.issuerCountry.find(row => row.key === 'UNKNOWN')?.valueBase).toBe('100');
    expect(result.allocations.assetType.find(row => row.key === 'CASH')?.valueBase).toBe('100');
    const whole = stressSchema.parse((await stress()).json());
    expect(whole).toMatchObject({ before: { totalValue: '1100' }, after: { totalValue: '600' }, lossBase: '500' }); expect(whole.after.cash).toEqual(whole.before.cash);
    const single = stressSchema.parse((await stress({ scope: 'INSTRUMENT', instrumentId: ids[0] })).json());
    expect(single.after.totalValue).toBe('800'); expect(single.lossBase).toBe('300');
  });
  it('keeps ledger, balances, settings, quotes and FX unchanged after repeated/concurrent scenarios', async () => {
    const original = await records(); const cash = (await call('GET', endpoint('cash'))).json();
    const responses = await Promise.all([stress(), stress(), stress({ dropPct: '100' }), call('GET', endpoint('risk'))]);
    expect(responses.map(row => row.statusCode)).toEqual([200, 200, 200, 200]);
    expect(await records()).toEqual(original); expect((await call('GET', endpoint('cash'))).json()).toEqual(cash);
  });
  it('validates decimal percentages and requires an If-Match revision for settings writes', async () => {
    for (const dropPct of ['-1', '101', 50, '1e2']) expect((await stress({ dropPct })).statusCode).toBe(400);
    expect((await stress({ ownerId: ownerB })).statusCode).toBe(400);
    expect((await call('PATCH', endpoint('risk-settings'), DEFAULT_RISK_SETTINGS)).statusCode).toBe(428);
    expect((await call('PATCH', endpoint('risk-settings'), DEFAULT_RISK_SETTINGS, a, '0')).statusCode).toBe(400);
    expect((await call('PATCH', endpoint('risk-settings'), { ...DEFAULT_RISK_SETTINGS, top3Pct: '20' }, a, 0)).statusCode).toBe(422);
    expect((await call('PATCH', endpoint('risk-settings'), { ...DEFAULT_RISK_SETTINGS, quoteMaxAgeHours: 0 }, a, 0)).statusCode).toBe(400);
  });
  it('applies saved freshness coherently to risk, valuation, purchase simulation and stress', async () => {
    const response = await call('PATCH', endpoint('risk-settings'), { ...DEFAULT_RISK_SETTINGS, quoteMaxAgeHours: 1 }, a, 0);
    expect(response.statusCode, response.body).toBe(200); expect(response.headers.etag).toBe('"1"');
    expect(riskSettingsSchema.parse(response.json()).revision).toBe(1);
    const risk = riskSchema.parse((await call('GET', endpoint('risk'))).json());
    expect(risk.valuation.complete).toBe(false); expect(risk.concentration.top3Pct).toBeNull(); expect(risk.settings.quoteMaxAgeHours).toBe(1);
    expect(valuationSchema.parse((await call('GET', endpoint('valuation'))).json()).complete).toBe(false);
    const scenario = await call('POST', endpoint('simulations'), { funding: 'NEW_MONEY', instrumentId: ids[0], budget: '100', unitPrice: '600', commission: '0' });
    expect(scenario.statusCode).toBe(200); expect(simulationSchema.parse(scenario.json()).after.complete).toBe(false);
    expect(stressSchema.parse((await stress()).json())).toMatchObject({ reason: 'INCOMPLETE_VALUATION', lossBase: null, after: { totalValue: null } });
  });
  it('serializes competing settings writes and refuses stale revisions without losing the winning change', async () => {
    const responses = await Promise.all([
      call('PATCH', endpoint('risk-settings'), { ...DEFAULT_RISK_SETTINGS, top5Pct: '90' }, a, 1),
      call('PATCH', endpoint('risk-settings'), { ...DEFAULT_RISK_SETTINGS, top5Pct: '95' }, a, 1),
    ]);
    expect(responses.map(row => row.statusCode).sort()).toEqual([200, 409]);
    const winner = riskSettingsSchema.parse(responses.find(row => row.statusCode === 200)!.json());
    expect(winner.revision).toBe(2);
    expect((await call('PATCH', endpoint('risk-settings'), DEFAULT_RISK_SETTINGS, a, 1)).statusCode).toBe(409);
    expect(riskSettingsSchema.parse((await call('GET', endpoint('risk-settings'))).json())).toEqual(winner);
    const restored = await call('PATCH', endpoint('risk-settings'), { ...DEFAULT_RISK_SETTINGS, maxPositionPct: '60', top3Pct: '100', top5Pct: '100' }, a, 2);
    expect(restored.statusCode).toBe(200);
    const result = riskSchema.parse((await call('GET', endpoint('risk'))).json());
    expect(result.valuation.complete).toBe(true); expect(result.concentration.maxPositionExceeded).toBe(false);
  });
  it('enforces tenant, ordering, freshness and revision constraints in PostgreSQL itself', async () => {
    const original = await records();
    await expect(db.update(riskSettings).set({ ownerId: ownerB }).where(eq(riskSettings.portfolioId, portfolio))).rejects.toThrow();
    await expect(db.update(riskSettings).set({ top3Pct: '10' }).where(eq(riskSettings.portfolioId, portfolio))).rejects.toThrow();
    await expect(db.update(riskSettings).set({ fxMaxAgeHours: 0 }).where(eq(riskSettings.portfolioId, portfolio))).rejects.toThrow();
    await expect(db.update(riskSettings).set({ revision: 0 }).where(eq(riskSettings.portfolioId, portfolio))).rejects.toThrow();
    expect(await records()).toEqual(original);
  });
});
