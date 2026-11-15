import { describe, expect, it } from 'vitest';
import { valuePortfolio } from '@investorkit/portfolio-engine';
const instrumentId = 'f6f92d67-ecaa-4ec6-a9ef-e80f1df4f763';
const instrument = { instrumentId, currency: 'USD' as const, quantityScale: 10 };
const asOf = '2026-01-05T12:00:00Z';
const time = '2026-01-02T12:00:00Z';
const historical = { fxToBase: '4', fxSource: 'manual', fxAsOf: time, occurredAt: time };
const deposit = { kind: 'DEPOSIT', currency: 'USD', amount: '20', note: '', ...historical };
const buy = { kind: 'BUY', currency: 'USD', commissionCurrency: 'USD', instrumentId, quantity: '0.125', unitPrice: '80', commission: '0.5', ...historical };
const quote = { instrumentId, currency: 'USD' as const, price: '90', source: 'manual' as const, asOf };
const fx = { currency: 'USD' as const, baseCurrency: 'PLN' as const, rate: '4.2', source: 'manual' as const, asOf };
function value(extra: Partial<Parameters<typeof valuePortfolio>[0]> = {}) {
  return valuePortfolio({ instruments: [instrument], operations: [deposit, buy], quotes: [quote], fxRates: [fx], asOf, ...extra });
}
describe('P04 valuation completeness and P/L', () => {
  it('golden3 values position47.25, cash39.9 and nominal portfolio gain7.15 including FX', () => {
    const result = value();
    expect(result.complete).toBe(true);
    expect(result.positions[0]).toMatchObject({ valueBase: '47.25', remainingCostBase: '42', unrealizedBase: '5.25', unrealizedPct: '12.5', issues: [] });
    expect(result.totalValue).toBe('87.15'); expect(result.pricedSubtotal).toBe('87.15');
    expect(result.netContributionsBase).toBe('80'); expect(result.pnl).toBe('7.15'); expect(result.pnlPct).toBe('8.9375');
    expect(result.valuationRange).toEqual({ from: asOf, to: asOf });
  });
  it('does not invent a full value or P/L without a quote, but reports fresh cash subtotal', () => {
    const result = value({ quotes: [] });
    expect(result.complete).toBe(false); expect(result.totalValue).toBeNull(); expect(result.pnl).toBeNull(); expect(result.pnlPct).toBeNull();
    expect(result.pnlPctReason).toBe('INCOMPLETE_VALUATION'); expect(result.pricedSubtotal).toBe('39.9');
    expect(result.positions[0]?.issues).toContain('MISSING_QUOTE'); expect(result.positions[0]?.weightPct).toBeNull();
  });
  it('requires current FX for both positions and foreign cash rather than reusing historical transaction FX', () => {
    const result = value({ fxRates: [] });
    expect(result.complete).toBe(false); expect(result.pricedSubtotal).toBe('0');
    expect(result.positions[0]?.issues).toContain('MISSING_FX'); expect(result.cash[2]?.issues).toContain('MISSING_FX');
  });
  it('accepts the exact72h boundary and rejects older data without including stale estimates in subtotal', () => {
    expect(value({ quotes: [{ ...quote, asOf: time }], fxRates: [{ ...fx, asOf: time }] }).complete).toBe(true);
    const old = '2026-01-02T11:59:59Z';
    const result = value({ quotes: [{ ...quote, asOf: old }], fxRates: [{ ...fx, asOf: old }] });
    expect(result.complete).toBe(false); expect(result.positions[0]?.issues).toEqual(['STALE_QUOTE', 'STALE_FX']);
    expect(result.cash[2]?.issues).toEqual(['STALE_FX']); expect(result.pricedSubtotal).toBe('0');
    expect(result.valuationRange).toBeNull(); expect(result.positions[0]?.quote?.asOf).toBe(old);
  });
  it('excludes future market data, selecting the latest eligible older value', () => {
    const future = '2026-01-06T00:00:00Z';
    expect(value({ quotes: [{ ...quote, asOf: future }] }).positions[0]?.issues).toContain('FUTURE_QUOTE');
    expect(value({ fxRates: [{ ...fx, asOf: future }] }).cash[2]?.issues).toContain('FUTURE_FX');
    expect(value({ quotes: [quote, { ...quote, asOf: future, price: '999' }], fxRates: [fx, { ...fx, asOf: future, rate: '999' }] }).totalValue).toBe('87.15');
  });
  it('calculates historical asOf using only operations at or before that time', () => {
    expect(value({ asOf: '2026-01-01T00:00:00Z' }).totalValue).toBe('0');
    const result = value({ asOf: time, quotes: [{ ...quote, asOf: time }], fxRates: [{ ...fx, asOf: time }] });
    expect(result.totalValue).toBe('87.15');
  });
  it('needs no FX for PLN or empty foreign subaccounts and no quote for closed positions', () => {
    const result = valuePortfolio({ instruments: [], operations: [{ ...deposit, currency: 'PLN', amount: '100', fxToBase: '1' }], quotes: [], fxRates: [], asOf });
    expect(result.complete).toBe(true); expect(result.totalValue).toBe('100'); expect(result.pnl).toBe('0');
    const closed = value({ operations: [deposit, buy, { ...buy, kind: 'SELL', unitPrice: '80', commission: '0' }], quotes: [] });
    expect(closed.positions).toHaveLength(0); expect(closed.complete).toBe(true); expect(closed.realizedBase).toBe('-2');
  });
  it('treats explicitly entered zero price as zero rather than missing', () => {
    const result = value({ quotes: [{ ...quote, price: '0' }] });
    expect(result.complete).toBe(true); expect(result.positions[0]?.valueBase).toBe('0'); expect(result.positions[0]?.unrealizedBase).toBe('-42');
  });
  it('returns null percentage after withdrawing all net contributions instead of Infinity', () => {
    const result = valuePortfolio({ instruments: [], operations: [deposit, { ...deposit, kind: 'WITHDRAWAL' }], quotes: [], fxRates: [], asOf });
    expect(result.complete).toBe(true); expect(result.pnl).toBe('0'); expect(result.pnlPct).toBeNull(); expect(result.pnlPctReason).toBe('NON_POSITIVE_BASE');
  });
  it('uses full internal precision and rounds only the final money snapshot', () => {
    const tinyInstrument = { ...instrument, currency: 'PLN' as const };
    const operations = [{ ...deposit, currency: 'PLN', amount: '1', fxToBase: '1' },
      { ...buy, currency: 'PLN', commissionCurrency: 'PLN', quantity: '0.0000000001', unitPrice: '0.5', commission: '0', fxToBase: '1' }];
    const result = valuePortfolio({ instruments: [tinyInstrument], operations, quotes: [{ ...quote, currency: 'PLN', price: '0.5' }], fxRates: [], asOf });
    expect(result.totalValue).toBe('1'); expect(result.pnl).toBe('0');
  });
  it('uses configurable age limits, stable equal timestamps and does not mutate inputs', () => {
    const quotes = Object.freeze([Object.freeze(quote), Object.freeze({ ...quote, price: '100' })]);
    const before = JSON.stringify(quotes);
    expect(value({ quotes }).positions[0]?.valueBase).toBe('52.5'); expect(JSON.stringify(quotes)).toBe(before);
    expect(value({ quoteMaxAgeHours: 1, quotes: [{ ...quote, asOf: time }] }).positions[0]?.issues).toContain('STALE_QUOTE');
    expect(() => value({ quoteMaxAgeHours: 0 })).toThrow('INVALID_MAX_AGE');
    expect(() => value({ quotes: [{ ...quote, currency: 'EUR' }] })).toThrow('QUOTE_CURRENCY_MISMATCH');
    expect(() => value({ fxRates: [{ ...fx, rate: '0' }] })).toThrow();
  });
});
