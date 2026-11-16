import { describe, expect, it } from 'vitest';
import { analyzeRisk, stressPortfolio, validateRiskSettings } from '@investorkit/portfolio-engine';
import { DEFAULT_RISK_SETTINGS } from '@investorkit/shared';
const ids = ['22e5e45b-1bdb-4a92-8298-8a44cc6c6dd1', '22e5e45b-1bdb-4a92-8298-8a44cc6c6dd2', '22e5e45b-1bdb-4a92-8298-8a44cc6c6dd3'];
const asOf = '2026-11-16T12:00:00Z';
const historical = { fxToBase: '1', fxAsOf: asOf, occurredAt: asOf, fxSource: 'manual', note: '' };
const deposit = { kind: 'DEPOSIT', currency: 'PLN', amount: '1100', ...historical };
const instruments = ids.map(instrumentId => ({ instrumentId, currency: 'PLN', quantityScale: 10 }));
const values = ['600', '300', '100'];
const operations = [deposit, ...ids.map((instrumentId, i) => ({ kind: 'BUY', instrumentId, currency: 'PLN', quantity: '1', unitPrice: values[i]!, commission: '0', commissionCurrency: 'PLN', ...historical }))];
const quotes = ids.map((instrumentId, i) => ({ instrumentId, currency: 'PLN' as const, price: values[i]!, asOf, source: 'manual' as const }));
const metadata = ids.map((instrumentId, i) => ({ instrumentId, type: i === 2 ? 'ETF' : 'STOCK', issuerCountry: i === 2 ? null : i === 1 ? 'US' : 'PL' }));
const context = { instruments, operations, quotes, fxRates: [], asOf };
const market = { scope: 'SECURITIES', dropPct: '50' };
const expectCode = (run: () => unknown, code: string) => { try { run(); throw new Error('Expected failure'); } catch (error) { expect(error).toMatchObject({ code }); } };
describe('P06 concentration and scenarios', () => {
  it('golden5 includes cash in all denominators while Top3/5 include securities only', () => {
    const result = analyzeRisk(context, metadata);
    expect(result.valuation.totalValue).toBe('1100');
    expect(result.concentration).toMatchObject({ largestPositionPct: '54.54545454545454545454545454545454545455', top3Pct: '90.90909090909090909090909090909090909091', top5Pct: '90.90909090909090909090909090909090909091', maxPositionExceeded: true, top3Exceeded: true, top5Exceeded: true, reason: null });
    expect(result.concentration.positions.map(row => row.instrumentId)).toEqual(ids);
    expect(result.allocations.assetType.find(row => row.key === 'CASH')?.valueBase).toBe('100');
  });
  it('retains unknown metadata and distinguishes issuer country from quote currency', () => {
    const result = analyzeRisk(context, metadata);
    expect(result.allocations.issuerCountry.map(row => row.key)).toEqual(['CASH', 'PL', 'UNKNOWN', 'US']);
    expect(result.allocations.issuerCountry.find(row => row.key === 'UNKNOWN')).toMatchObject({ valueBase: '100', weightPct: '9.090909090909090909090909090909090909091' });
    expect(result.allocations.currency).toEqual([{ key: 'PLN', valueBase: '1100', weightPct: '100' }]);
    const unknown = analyzeRisk(context, []);
    expect(unknown.allocations.assetType.find(row => row.key === 'UNKNOWN')?.valueBase).toBe('1000');
    expect(unknown.concentration.top3Pct).toBe(result.concentration.top3Pct);
    expectCode(() => analyzeRisk(context, [...metadata, metadata[0]]), 'DUPLICATE_CLASSIFICATION');
  });
  it('golden5 reduces all securities by 50% while keeping cash and original FX unchanged', () => {
    const result = stressPortfolio(context, market);
    expect(result).toMatchObject({ after: { totalValue: '600' }, lossBase: '500', lossPct: '45.45454545454545454545454545454545454545', assumptions: { fxConstant: true, cashUnaffected: true } });
    expect(result.after.cash).toEqual(result.before.cash);
    expect(result.after.positions.map(row => row.valueBase)).toEqual(['300', '150', '50']);
    expect(result.after.positions[0]).toMatchObject({ referencePrice: '600', scenarioPrice: '300', weightPct: '50' });
  });
  it('shocks a single held position and uses the entire after portfolio for new weights', () => {
    const result = stressPortfolio(context, { scope: 'INSTRUMENT', instrumentId: ids[0], dropPct: '50' });
    expect(result).toMatchObject({ after: { totalValue: '800' }, lossBase: '300' });
    expect(result.after.positions.map(row => row.valueBase)).toEqual(['300', '300', '100']);
    expect(result.after.positions.map(row => row.weightPct)).toEqual(['37.5', '37.5', '12.5']);
    expect(result.after.positions[1]?.scenarioPrice).toBe('300');
    expectCode(() => stressPortfolio(context, { scope: 'INSTRUMENT', instrumentId: 'fa0bc353-348d-4117-8aa1-a1b44ca43212', dropPct: '10' }), 'TARGET_NOT_HELD');
  });
  it('accepts the 0% and 100% boundaries and never shocks cash', () => {
    const zero = stressPortfolio(context, { ...market, dropPct: '0' });
    expect(zero.after.totalValue).toBe('1100'); expect(zero.lossBase).toBe('0'); expect(zero.lossPct).toBe('0');
    const full = stressPortfolio(context, { ...market, dropPct: '100' });
    expect(full.after.totalValue).toBe('100'); expect(full.lossBase).toBe('1000');
    expect(full.after.positions.every(row => row.valueBase === '0')).toBe(true);
    const noCash = stressPortfolio({ ...context, operations: [{ ...deposit, amount: '1000' }, ...operations.slice(1)] }, { ...market, dropPct: '100' });
    expect(noCash.after.totalValue).toBe('0'); expect(noCash.after.positions.every(row => row.weightPct === null)).toBe(true); expect(noCash.lossPct).toBe('100');
  });
  it('does not invent totals, rankings or threshold outcomes when an open position lacks a quote', () => {
    const partial = { ...context, quotes: quotes.slice(1) };
    const risk = analyzeRisk(partial, metadata);
    expect(risk.valuation.pricedSubtotal).toBe('500');
    expect(risk.concentration).toMatchObject({ largestPositionPct: null, top3Pct: null, top5Pct: null, maxPositionExceeded: null, top3Exceeded: null, reason: 'INCOMPLETE_VALUATION' });
    expect(risk.concentration.positions.every(row => row.weightPct === null)).toBe(true);
    expect(risk.allocations.currency[0]).toMatchObject({ valueBase: null, weightPct: null });
    const stress = stressPortfolio(partial, market);
    expect(stress).toMatchObject({ after: { totalValue: null }, lossBase: null, lossPct: null, reason: 'INCOMPLETE_VALUATION' });
  });
  it('treats empty and cash-only portfolios explicitly without division by zero', () => {
    const empty = { ...context, operations: [] };
    expect(analyzeRisk(empty, metadata).concentration).toMatchObject({ top3Pct: null, reason: 'NON_POSITIVE_BASE', maxPositionExceeded: null });
    expect(stressPortfolio(empty, market)).toMatchObject({ lossBase: '0', lossPct: null, after: { totalValue: '0' }, reason: 'NON_POSITIVE_BASE' });
    const cashOnly = { ...context, operations: [deposit] };
    expect(analyzeRisk(cashOnly, metadata).concentration).toMatchObject({ top3Pct: '0', largestPositionPct: '0', maxPositionExceeded: false });
    expect(stressPortfolio(cashOnly, market)).toMatchObject({ lossBase: '0', after: { totalValue: '1100' } });
  });
  it('uses strict threshold comparison and validates threshold ordering and decimal boundaries', () => {
    const settings = { ...DEFAULT_RISK_SETTINGS, maxPositionPct: '60', top3Pct: '100', top5Pct: '100' };
    const equal = analyzeRisk({ ...context, operations: [{ ...deposit, amount: '1000' }, ...operations.slice(1)] }, metadata, settings);
    expect(equal.concentration).toMatchObject({ maxPositionExceeded: false, top3Exceeded: false, top5Exceeded: false });
    expectCode(() => validateRiskSettings({ ...settings, top3Pct: '59' }), 'INVALID_THRESHOLDS');
    for (const invalid of ['-1', '100.0000000001', 'NaN', '1e2', ' 10', 10]) {
      expect(() => validateRiskSettings({ ...settings, maxPositionPct: invalid })).toThrow();
      expect(() => stressPortfolio(context, { ...market, dropPct: invalid })).toThrow();
    }
    expect(() => stressPortfolio(context, { ...market, instrumentId: ids[0] })).toThrow();
    expect(() => validateRiskSettings({ ...settings, quoteMaxAgeHours: 0 })).toThrow();
    expect(() => validateRiskSettings({ ...settings, fxMaxAgeHours: 8761 })).toThrow();
    expect(validateRiskSettings({ ...settings, maxPositionPct: '0', quoteMaxAgeHours: 1, fxMaxAgeHours: 8760 }).maxPositionPct).toBe('0');
  });
  it('applies configurable freshness, preserving the existing age==threshold rule', () => {
    const old = { ...context, quotes: quotes.map(row => ({ ...row, asOf: '2026-11-16T10:00:00Z' })) };
    expect(analyzeRisk(old, metadata).valuation.complete).toBe(true);
    const settings = { ...DEFAULT_RISK_SETTINGS, quoteMaxAgeHours: 2 };
    expect(analyzeRisk(old, metadata, settings).valuation.complete).toBe(true);
    expect(analyzeRisk({ ...old, asOf: '2026-11-16T12:00:00.001Z' }, metadata, settings).concentration.reason).toBe('INCOMPLETE_VALUATION');
    const future = analyzeRisk({ ...context, quotes: quotes.map(row => ({ ...row, asOf: '2026-11-17T12:00:00Z' })) }, metadata);
    expect(future.valuation.positions[0]?.issues).toContain('FUTURE_QUOTE'); expect(future.concentration.top3Pct).toBeNull();
  });
  it('values foreign holdings at the unchanged current FX, with historical cost retained', () => {
    const usd = { ...context, instruments: [{ ...instruments[0]!, currency: 'USD' }], operations: [
      { ...deposit, currency: 'USD', amount: '20', fxToBase: '4' },
      { ...operations[1]!, instrumentId: ids[0], currency: 'USD', commissionCurrency: 'USD', quantity: '0.125', unitPrice: '80', commission: '0.5', fxToBase: '4' },
    ], quotes: [{ ...quotes[0]!, currency: 'USD' as const, price: '90' }], fxRates: [{ currency: 'USD' as const, baseCurrency: 'PLN' as const, rate: '4.2', asOf, source: 'manual' as const }] };
    const result = stressPortfolio(usd, market);
    expect(result).toMatchObject({ before: { totalValue: '87.15' }, after: { totalValue: '63.525' }, lossBase: '23.625' });
    expect(result.before.positions[0]?.remainingCostBase).toBe('42');
    expect(result.after.cash).toEqual(result.before.cash);
    expect(result.after.cash[2]?.valueBase).toBe('39.9');
    const stale = { ...usd, fxRates: [{ ...usd.fxRates[0]!, asOf: '2026-11-10T12:00:00Z' }] };
    expect(stressPortfolio(stale, market).lossBase).toBeNull();
    expect(analyzeRisk({ ...usd, fxRates: [] }, metadata).concentration.top3Pct).toBeNull();
  });
  it('computes losses and scenario prices before rounding valuation snapshots', () => {
    const tiny = { ...context, instruments: [instruments[0]!], operations: [{ ...deposit, amount: '1' }, { ...operations[1]!, quantity: '0.6', unitPrice: '0.0000000003' }], quotes: [{ ...quotes[0]!, price: '0.0000000004' }] };
    const result = stressPortfolio(tiny, market);
    expect(result.before.totalValue).toBe('1.0000000001'); expect(result.after.totalValue).toBe('0.9999999999');
    expect(result.lossBase).toBe('0.0000000001');
    expect(stressPortfolio(tiny, { ...market, dropPct: '33.3333333333' }).after.positions[0]?.scenarioPrice).toBe('0.0000000002666666666668');
  });
  it('keeps inputs immutable and gives repeatable results with deterministic ranking ties', () => {
    const saved = structuredClone(context);
    expect(stressPortfolio(context, market)).toEqual(stressPortfolio(context, market));
    expect(analyzeRisk(context, metadata)).toEqual(analyzeRisk(context, metadata)); expect(context).toEqual(saved);
    const tied = { ...context, quotes: quotes.map(row => ({ ...row, price: '100' })) };
    expect(analyzeRisk(tied, metadata).concentration.positions.map(row => row.instrumentId)).toEqual(ids);
  });
});
