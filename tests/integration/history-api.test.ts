import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, like } from 'drizzle-orm';
import { createDatabase, user, valuationSnapshots, cashOperations, manualQuotes, fxRates, riskSettings } from '@investorkit/db';
import { DEFAULT_RISK_SETTINGS, instrumentSchema, portfolioSchema, portfolioHistorySchema, snapshotSchema, valuationSchema } from '@investorkit/shared';
import { valuePortfolio } from '@investorkit/portfolio-engine';
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
const prefix = `history-${randomUUID()}`;
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
let a = ''; let b = ''; let owner = ''; let ownerB = ''; let portfolio = ''; let portfolioB = ''; let instrument = '';
let partial: ReturnType<typeof snapshotSchema.parse>; let full: ReturnType<typeof snapshotSchema.parse>;
const day = '2026-01-01T12:00:00Z';
async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: Record<string, unknown>, cookie = a, origin = config.WEB_ORIGIN, revision?: number) {
  const response = await app.inject({ method, url: `/api/v1${path}`, headers: { cookie, origin, 'idempotency-key': randomUUID(), ...(revision === undefined ? {} : { 'if-match': `"${revision}"` }) }, ...(payload ? { payload } : {}) });
  await validator.assert(`/api/v1${path.split('?')[0]!.replace(uuid, '{id}')}`, method, response);
  expect(response.headers['cache-control']).toBe('no-store'); return response;
}
const endpoint = (suffix: string) => `/portfolios/${portfolio}/${suffix}`;
const capture = () => call('POST', endpoint('snapshots'), {});
const history = async (query = '') => {
  const response = await call('GET', endpoint(`history${query}`)); expect(response.statusCode, response.body).toBe(200); return portfolioHistorySchema.parse(response.json());
};
async function financialRows() { return { ledger: await db.select().from(cashOperations).where(eq(cashOperations.ownerId, owner)).orderBy(asc(cashOperations.sequence)), quotes: await db.select().from(manualQuotes).where(eq(manualQuotes.ownerId, owner)).orderBy(asc(manualQuotes.sequence)), fx: await db.select().from(fxRates).where(eq(fxRates.ownerId, owner)).orderBy(asc(fxRates.sequence)), settings: await db.select().from(riskSettings).where(eq(riskSettings.ownerId, owner)) }; }
beforeAll(async () => {
  for (const label of ['a', 'b']) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', headers: { origin: config.WEB_ORIGIN }, payload: { name: label, email: `${prefix}-${label}@example.com`, password: 'Test-only-passphrase-2026!' } });
    expect(response.statusCode).toBe(200);
    const raw = response.headers['set-cookie']; const cookie = (Array.isArray(raw) ? raw : [raw ?? '']).map(item => item.split(';')[0]).join('; ');
    const [row] = await db.select().from(user).where(eq(user.email, `${prefix}-${label}@example.com`)); if (!row) throw new Error('Missing user');
    if (label === 'a') { a = cookie; owner = row.id; } else { b = cookie; ownerB = row.id; }
  }
  portfolio = portfolioSchema.parse((await call('POST', '/portfolios', { name: 'History' })).json()).id;
  portfolioB = portfolioSchema.parse((await call('POST', '/portfolios', { name: 'History B' }, b)).json()).id;
  instrument = instrumentSchema.parse((await call('POST', '/instruments', { type: 'ETF', symbol: 'HIST', mic: 'XNAS', name: 'History instrument', currency: 'USD', quantityScale: 3 })).json()).id;
  const common = { currency: 'USD', fxToBase: '4', occurredAt: day, fxAsOf: day, fxSource: 'manual', note: '' };
  expect((await call('POST', endpoint('cash-operations'), { ...common, kind: 'DEPOSIT', amount: '20' })).statusCode).toBe(201);
  expect((await call('POST', endpoint('operations'), { ...common, kind: 'BUY', instrumentId: instrument, quantity: '0.125', unitPrice: '80', commission: '0.5', commissionCurrency: 'USD' })).statusCode).toBe(201);
});
afterAll(async () => { await db.delete(user).where(like(user.email, `${prefix}%`)); await app.close(); await validator.close(); await pool.end(); });
describe('A09 recorded valuation history', () => {
  it('does not create snapshots on reads, valuations or scenarios, and exposes empty coverage honestly', async () => {
    const before = await financialRows();
    const result = await history(); expect(result.items).toEqual([]); expect(result.missingDays.length).toBeGreaterThanOrEqual(30);
    expect((await call('GET', endpoint('valuation'))).statusCode).toBe(200);
    expect((await call('GET', endpoint('risk'))).statusCode).toBe(200);
    expect((await call('POST', endpoint('stress-tests'), { scope: 'SECURITIES', dropPct: '40' })).statusCode).toBe(200);
    expect((await call('POST', endpoint('simulations'), { instrumentId: instrument, budget: '10', unitPrice: '10', commission: '0', funding: 'NEW_MONEY' })).statusCode).toBe(422);
    expect((await history()).items).toEqual([]); expect(await financialRows()).toEqual(before);
  });
  it('captures incomplete values and diagnostics without changing finances, and uses server time only', async () => {
    const before = await financialRows(); const started = Date.now();
    const response = await capture(); expect(response.statusCode, response.body).toBe(201);
    partial = snapshotSchema.parse(response.json());
    expect(partial).toMatchObject({ complete: false, valueBase: null, pnl: null, pnlPct: null, pricedSubtotal: '0' });
    expect(partial.valuation.positions[0]?.issues).toEqual(['MISSING_QUOTE', 'MISSING_FX']);
    expect(partial.inputsHash).toMatch(/^[0-9a-f]{64}$/); expect(partial).not.toHaveProperty('ownerId');
    expect(Date.parse(partial.asOf)).toBeGreaterThanOrEqual(started); expect(Date.parse(partial.asOf)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(partial.createdAt)).toBeGreaterThanOrEqual(Date.parse(partial.asOf));
    expect(await financialRows()).toEqual(before);
  });
  it('preserves golden3 and the old incomplete snapshot after fresh data, backdated flows and changed settings', async () => {
    expect((await call('POST', `/instruments/${instrument}/quotes`, { currency: 'USD', price: '90', asOf: new Date().toISOString(), source: 'manual' })).statusCode).toBe(201);
    expect((await call('POST', '/fx-rates', { currency: 'USD', baseCurrency: 'PLN', rate: '4.2', asOf: new Date().toISOString(), source: 'manual' })).statusCode).toBe(201);
    const response = await capture(); expect(response.statusCode, response.body).toBe(201); full = snapshotSchema.parse(response.json());
    expect(full).toMatchObject({ valueBase: '87.15', netContributionsBase: '80', pnl: '7.15', pricedSubtotal: '87.15', complete: true });
    expect(full.valuation.positions[0]).toMatchObject({ quantity: '0.125', valueBase: '47.25', remainingCostBase: '42', unrealizedBase: '5.25', quote: { price: '90.0000000000', source: 'manual' }, fx: { rate: '4.200000000000', source: 'manual' } });
    expect((await call('POST', endpoint('cash-operations'), { currency: 'PLN', fxToBase: '1', kind: 'DEPOSIT', amount: '100', occurredAt: day, fxAsOf: day, fxSource: 'manual', note: '' })).statusCode).toBe(201);
    expect((await call('PATCH', endpoint('risk-settings'), { ...DEFAULT_RISK_SETTINGS, quoteMaxAgeHours: 1 }, a, config.WEB_ORIGIN, 0)).statusCode).toBe(200);
    const current = valuationSchema.parse((await call('GET', endpoint('valuation'))).json()); expect(current.totalValue).toBe('187.15'); expect(current.quoteMaxAgeHours).toBe(1);
    expect(snapshotSchema.parse((await call('GET', `/valuation-snapshots/${partial.id}`)).json())).toEqual(partial);
    expect(snapshotSchema.parse((await call('GET', `/valuation-snapshots/${full.id}`)).json())).toEqual(full);
  });
  it('requires session/origin, owner scopes all reads and captures, and refuses client-supplied prices or timestamps', async () => {
    for (const path of [endpoint('history'), `/valuation-snapshots/${full.id}`]) {
      expect((await call('GET', path, undefined, '')).statusCode).toBe(401);
      expect((await call('GET', path, undefined, b)).statusCode).toBe(404);
    }
    expect((await call('POST', endpoint('snapshots'), {}, b)).statusCode).toBe(404);
    expect((await call('POST', endpoint('snapshots'), {}, '')).statusCode).toBe(401);
    expect((await call('POST', endpoint('snapshots'), {}, a, 'https://other.example')).statusCode).toBe(403);
    for (const payload of [{ asOf: day }, { totalValue: '1000' }, { ownerId: ownerB }]) expect((await call('POST', endpoint('snapshots'), payload)).statusCode).toBe(400);
  });
  it('filters actual records by inclusive timestamps and returns calendar gaps without writing or reconstructing', async () => {
    const rows = await db.select().from(valuationSnapshots).where(eq(valuationSnapshots.ownerId, owner)).orderBy(asc(valuationSnapshots.id));
    const bounded = await history(`?${new URLSearchParams({ from: full.asOf, to: full.asOf })}`);
    expect(bounded.items).toHaveLength(1); expect(bounded.items[0]?.id).toBe(full.id); expect(bounded.missingDays).toEqual([]);
    const empty = await history('?from=2026-03-28T23%3A00%3A00Z&to=2026-03-30T21%3A59%3A59Z');
    expect(empty.items).toEqual([]); expect(empty.missingDays).toEqual(['2026-03-29', '2026-03-30']);
    for (const query of ['?from=bad', '?limit=9999']) expect((await call('GET', endpoint(`history${query}`))).statusCode).toBe(400);
    for (const query of ['?from=2025-01-01T00:00:00Z', '?from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z', '?to=2099-01-01T00:00:00Z']) expect((await call('GET', endpoint(`history${query}`))).statusCode).toBe(422);
    expect(await db.select().from(valuationSnapshots).where(eq(valuationSnapshots.ownerId, owner)).orderBy(asc(valuationSnapshots.id))).toEqual(rows);
  });
  it('enforces owner, completeness, hash and unique-point constraints directly in PostgreSQL', async () => {
    const [original] = await db.select().from(valuationSnapshots).where(eq(valuationSnapshots.id, full.id)); if (!original) throw new Error('Missing snapshot');
    for (const extra of [{ ownerId: ownerB }, { complete: false }, { valueBase: null }, { valueBase: '-1' }, { inputsHash: 'bad' }, { engineVersion: '' }, {}]) {
      await expect(db.insert(valuationSnapshots).values({ ...original, id: randomUUID(), ...extra })).rejects.toThrow();
    }
  });
  it('serializes captures at the capacity boundary and records real zero-value portfolios', async () => {
    const empty = valuePortfolio({ instruments: [], operations: [], quotes: [], fxRates: [], asOf: day });
    await db.insert(valuationSnapshots).values(Array.from({ length: 365 }, (_, index) => {
      const asOf = new Date(Date.parse(day) + index * 60000);
      return { ownerId: ownerB, portfolioId: portfolioB, asOf, valueBase: '0', netContributionsBase: '0', complete: true, inputsHash: 'a'.repeat(64), engineVersion: empty.engineVersion, valuation: { ...empty, asOf: asOf.toISOString() } };
    }));
    const results = await Promise.all([call('POST', `/portfolios/${portfolioB}/snapshots`, {}, b), call('POST', `/portfolios/${portfolioB}/snapshots`, {}, b)]);
    expect(results.map(row => row.statusCode).sort()).toEqual([201, 422]);
    const recorded = snapshotSchema.parse(results.find(row => row.statusCode === 201)!.json()); expect(recorded).toMatchObject({ valueBase: '0', pnl: '0', pnlPct: null, complete: true });
    expect((await db.select().from(valuationSnapshots).where(and(eq(valuationSnapshots.ownerId, ownerB), eq(valuationSnapshots.portfolioId, portfolioB))))).toHaveLength(366);
  });
});
