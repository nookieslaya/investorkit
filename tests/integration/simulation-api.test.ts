import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { createDatabase, user, instruments, cashOperations, manualQuotes, fxRates } from '@investorkit/db';
import { instrumentSchema, portfolioSchema, simulationSchema } from '@investorkit/shared';
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
const prefix = `simulation-${randomUUID()}`;
let a = ''; let b = ''; let owner = ''; let portfolio = ''; let pln = ''; let usd = ''; let foreign = '';
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
async function call(method: 'GET' | 'POST', path: string, payload?: Record<string, unknown>, session = a, origin = config.WEB_ORIGIN) {
  const response = await app.inject({ method, url: `/api/v1${path}`, headers: { origin, cookie: session, 'idempotency-key': randomUUID() }, ...(payload ? { payload } : {}) });
  await validator.assert(`/api/v1${path.replace(uuid, '{id}')}`, method, response);
  return response;
}
const input = (extra: Record<string, unknown> = {}) => ({ instrumentId: pln, budget: '1000', unitPrice: '300', commission: '5', funding: 'EXISTING_CASH', ...extra });
const simulate = (body = input(), session = a) => call('POST', `/portfolios/${portfolio}/simulations`, body, session);
async function storedState() {
  return { operations: await db.select().from(cashOperations).where(eq(cashOperations.ownerId, owner)), instruments: await db.select().from(instruments).where(eq(instruments.ownerId, owner)), quotes: await db.select().from(manualQuotes).where(eq(manualQuotes.ownerId, owner)), rates: await db.select().from(fxRates).where(eq(fxRates.ownerId, owner)) };
}
beforeAll(async () => {
  for (const label of ['a', 'b']) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', headers: { origin: config.WEB_ORIGIN }, payload: { name: label, email: `${prefix}-${label}@example.com`, password: 'Test-only-passphrase-2026!' } });
    expect(response.statusCode).toBe(200);
    const raw = response.headers['set-cookie']; const cookie = (Array.isArray(raw) ? raw : [raw ?? '']).map(item => item.split(';')[0]).join('; ');
    if (label === 'a') { a = cookie; const [row] = await db.select().from(user).where(eq(user.email, `${prefix}-${label}@example.com`)); owner = row!.id; } else b = cookie;
  }
  portfolio = portfolioSchema.parse((await call('POST', '/portfolios', { name: 'Simulation tests' })).json()).id;
  const metadata = { type: 'STOCK', symbol: 'SIM', mic: 'XWAR', name: 'Simulation security', currency: 'PLN', quantityScale: 0 };
  pln = instrumentSchema.parse((await call('POST', '/instruments', metadata)).json()).id;
  usd = instrumentSchema.parse((await call('POST', '/instruments', { ...metadata, currency: 'USD' })).json()).id;
  foreign = instrumentSchema.parse((await call('POST', '/instruments', metadata, b)).json()).id;
  const date = '2026-01-01T12:00:00Z';
  expect((await call('POST', `/portfolios/${portfolio}/cash-operations`, { kind: 'DEPOSIT', currency: 'PLN', amount: '1000', fxToBase: '1', fxAsOf: date, occurredAt: date, fxSource: 'manual', note: '' })).statusCode).toBe(201);
});
afterAll(async () => { await db.delete(user).where(like(user.email, `${prefix}%`)); await app.close(); await validator.close(); await pool.end(); });
describe('A06 private read-only simulation API', () => {
  it('enforces session, origin, portfolio/instrument ownership and strict decimal DTOs', async () => {
    expect((await simulate(input(), '')).statusCode).toBe(401);
    expect((await simulate(input(), b)).statusCode).toBe(404);
    expect((await simulate(input({ instrumentId: foreign }))).statusCode).toBe(404);
    expect((await call('POST', `/portfolios/${portfolio}/simulations`, input(), a, 'https://other.example')).statusCode).toBe(403);
    for (const invalid of [{ budget: 1000 }, { ownerId: owner }, { funding: 'AUTO_FX' }, { commission: '-1' }]) expect((await simulate(input(invalid))).statusCode).toBe(400);
  });
  it('returns the golden4 comparison and clearly labels the hypothetical reference price', async () => {
    const response = await simulate(); expect(response.statusCode, response.body).toBe(200);
    expect(simulationSchema.parse(response.json())).toMatchObject({ quantity: '3', actualCost: '905', budgetRemaining: '95', remainingCash: '95', before: { totalValue: '1000' }, after: { totalValue: '995' }, assumptions: { reference: { source: 'scenario' } } });
    const fresh = await simulate(input({ funding: 'NEW_MONEY' })); expect(fresh.statusCode).toBe(200);
    expect(simulationSchema.parse(fresh.json()).after.totalValue).toBe('1995');
  });
  it('returns domain errors and never silently exchanges another subaccount', async () => {
    const original = await storedState();
    for (const [body, code] of [[input({ budget: '1001' }), 'INSUFFICIENT_CASH'], [input({ budget: '5' }), 'BUDGET_TOO_SMALL'], [input({ unitPrice: '0' }), 'NON_POSITIVE_VALUE'], [input({ instrumentId: usd }), 'INSUFFICIENT_CASH'], [input({ instrumentId: usd, funding: 'NEW_MONEY' }), 'SCENARIO_FX_REQUIRED']] as const) {
      const response = await simulate(body); expect(response.statusCode, response.body).toBe(422); expect(response.json()).toMatchObject({ error: { code } });
    }
    expect(await storedState()).toEqual(original);
  });
  it('does not persist hypothetical deposits, BUYs, quotes, or balances across repeated and parallel runs', async () => {
    const original = await storedState();
    const cash = (await call('GET', `/portfolios/${portfolio}/cash`)).json();
    const responses = await Promise.all([simulate(), simulate(), simulate(input({ funding: 'NEW_MONEY' })), simulate(input({ funding: 'NEW_MONEY' }))]);
    expect(responses.map(item => item.statusCode)).toEqual([200, 200, 200, 200]);
    expect(await storedState()).toEqual(original);
    expect((await call('GET', `/portfolios/${portfolio}/cash`)).json()).toEqual(cash);
    expect((await call('GET', `/portfolios/${portfolio}/operations`)).json().items).toHaveLength(1);
  });
  it('reads current own FX and reference quote separately from the hypothetical buy price', async () => {
    const date = new Date().toISOString();
    expect((await call('POST', '/fx-rates', { currency: 'USD', baseCurrency: 'PLN', rate: '4.2', asOf: date, source: 'manual' })).statusCode).toBe(201);
    expect((await call('POST', `/instruments/${usd}/quotes`, { currency: 'USD', price: '350', asOf: date, source: 'manual' })).statusCode).toBe(201);
    const original = await storedState();
    const response = await simulate(input({ instrumentId: usd, funding: 'NEW_MONEY' })); expect(response.statusCode, response.body).toBe(200);
    const result = simulationSchema.parse(response.json());
    expect(result).toMatchObject({ assumptions: { reference: { price: '350.0000000000', source: 'manual' }, fx: { rate: '4.200000000000' } }, after: { totalValue: '5809', netContributionsBase: '5200', pnl: '609' } });
    expect(await storedState()).toEqual(original);
  });
});
