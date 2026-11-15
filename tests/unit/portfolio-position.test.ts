import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { FinancialDecimal, Position, PositionDomainError, sumDecimals } from '@investorkit/portfolio-engine';
const instrumentId = 'f6f92d67-ecaa-4ec6-a9ef-e80f1df4f763';
const otherId = '9096e290-6bca-4f9c-91de-45c75952d1d6';
const instrument = { instrumentId, currency: 'PLN', quantityScale: 10 };
const empty = () => Position.empty(instrument);
function trade(kind: 'BUY' | 'SELL', quantity: string, unitPrice: string, commission = '0', extra: Record<string, unknown> = {}) {
  return { kind, instrumentId, quantity, unitPrice, commission, currency: 'PLN', commissionCurrency: 'PLN', ...extra };
}
function goldenPosition() {
  return empty().applyTrade(trade('BUY', '2', '100', '2')).position
    .applyTrade(trade('BUY', '1', '130', '1')).position;
}
function expectCode(action: () => unknown, code: string) {
  expect(action).toThrow(PositionDomainError);
  expect(action).toThrow(code);
}

describe('local analytical position cost — golden cases 1/2', () => {
  it('starts with no position cost and no average instead of dividing by zero', () => {
    expect(empty().snapshot()).toEqual({ ...instrument, quantity: '0', remainingCostLocal: '0', averageCostLocal: null });
  });
  it('includes each BUY commission in the weighted average: quantity3 / cost333 / average111', () => {
    expect(goldenPosition().snapshot()).toEqual({ ...instrument, quantity: '3', remainingCostLocal: '333', averageCostLocal: '111' });
    const first = empty().applyTrade(trade('BUY', '2', '100', '2'));
    expect(first.cashDeltaLocal.toString()).toBe('-202');
    expect(first.grossLocal.toString()).toBe('200');
    expect(first.commissionLocal.toString()).toBe('2');
    expect(first.realizedLocal.toString()).toBe('0');
    expect(first.releasedCostLocal.toString()).toBe('0');
  });
  it('releases proportional cost and deducts SELL commission: realized38 / remaining222', () => {
    const result = goldenPosition().applyTrade(trade('SELL', '1', '150', '1'));
    expect(result.releasedCostLocal.toString()).toBe('111');
    expect(result.realizedLocal.toString()).toBe('38');
    expect(result.cashDeltaLocal.toString()).toBe('149');
    expect(result.position.snapshot()).toEqual({ ...instrument, quantity: '2', remainingCostLocal: '222', averageCostLocal: '111' });
    // Reference arithmetic for golden case2; quote freshness/valuation belongs to P04.
    expect(result.position.quantity.times(FinancialDecimal.parse('140')).minus(result.position.remainingCostLocal).toString()).toBe('58');
  });
  it('recalculates weighted cost when buying again after a partial sale', () => {
    const partial = goldenPosition().applyTrade(trade('SELL', '1', '150', '1')).position;
    const bought = partial.applyTrade(trade('BUY', '1', '100', '2')).position;
    expect(bought.snapshot()).toMatchObject({ quantity: '3', remainingCostLocal: '324', averageCostLocal: '108' });
  });
  it('closes all cost and quantity, and a later BUY starts a fresh cost basis', () => {
    const partial = goldenPosition().applyTrade(trade('SELL', '1', '150', '1'));
    const closed = partial.position.applyTrade(trade('SELL', '2', '140', '2'));
    expect(closed.position.snapshot()).toEqual(empty().snapshot());
    expect(closed.releasedCostLocal.toString()).toBe('222');
    expect(closed.realizedLocal.toString()).toBe('56');
    expect(sumDecimals([partial.realizedLocal, closed.realizedLocal]).toString()).toBe('94');
    const reopened = closed.position.applyTrade(trade('BUY', '1', '40', '1')).position;
    expect(reopened.averageCostLocal?.toString()).toBe('41');
  });
});

describe('fractions, fees and immutable states', () => {
  it('keeps fractional USD cost local and explicitly labelled, with no implicit FX', () => {
    const usd = Position.empty({ ...instrument, currency: 'USD' });
    const result = usd.applyTrade(trade('BUY', '0.125', '80', '0.5', { currency: 'USD', commissionCurrency: 'USD' }));
    expect(result.currency).toBe('USD');
    expect(result.position.snapshot()).toEqual({ ...instrument, currency: 'USD', quantity: '0.125', remainingCostLocal: '10.5', averageCostLocal: '84' });
    expect(result.cashDeltaLocal.toString()).toBe('-10.5');
    const sale = result.position.applyTrade(trade('SELL', '0.025', '90', '0.1', { currency: 'USD', commissionCurrency: 'USD' }));
    expect(sale.releasedCostLocal.toString()).toBe('2.1');
    expect(sale.realizedLocal.toString()).toBe('0.05');
    expect(sale.position.quantity.toString()).toBe('0.1');
    expect(sale.position.remainingCostLocal.toString()).toBe('8.4');
  });
  it('releases the last remainder exactly after recurring proportional divisions', () => {
    let position = empty().applyTrade(trade('BUY', '3', '0.3333333333', '0.0000000001')).position;
    const released: FinancialDecimal[] = [];
    const realized: FinancialDecimal[] = [];
    for (let i = 0; i < 3; i++) {
      const sale = position.applyTrade(trade('SELL', '1', '1'));
      released.push(sale.releasedCostLocal); realized.push(sale.realizedLocal);
      position = sale.position;
    }
    expect(position.snapshot()).toEqual(empty().snapshot());
    expect(sumDecimals(released).toString()).toBe('1');
    expect(sumDecimals(realized).toString()).toBe('2');
  });
  it('does not round average cost before allocating a partial sale', () => {
    const position = empty().applyTrade(trade('BUY', '3', '1', '1')).position;
    expect(position.averageCostLocal?.toFixed(2)).toBe('1.33');
    const sale = position.applyTrade(trade('SELL', '2', '2'));
    expect(sale.releasedCostLocal.toString()).toBe(`2.${'6'.repeat(38)}7`);
    expect(sale.position.remainingCostLocal.plus(sale.releasedCostLocal).toString()).toBe('4');
  });
  it('preserves very small amounts through trades instead of rounding to storage scale', () => {
    const buy = empty().applyTrade(trade('BUY', '0.0000000001', '0.0000000001'));
    expect(buy.position.remainingCostLocal.toString()).toBe('0.00000000000000000001');
    const sell = buy.position.applyTrade(trade('SELL', '0.0000000001', '0.0000000002'));
    expect(sell.realizedLocal.toString()).toBe('0.00000000000000000001');
    expect(sell.position.snapshot()).toEqual(empty().snapshot());
  });
  it('returns a loss and a negative cash movement when sale fees exceed proceeds', () => {
    const position = empty().applyTrade(trade('BUY', '1', '1')).position;
    const sale = position.applyTrade(trade('SELL', '1', '1', '2'));
    expect(sale.cashDeltaLocal.toString()).toBe('-1');
    expect(sale.realizedLocal.toString()).toBe('-2');
    expect(sale.position.snapshot()).toEqual(empty().snapshot());
  });
  it('never mutates metadata, states or trade input and does not deduplicate legitimate identical buys', () => {
    const metadata = { ...instrument };
    const initial = Position.empty(metadata);
    metadata.currency = 'USD';
    const input = Object.freeze(trade('BUY', '1', '100', '1'));
    const first = initial.applyTrade(input).position;
    const second = first.applyTrade(input).position;
    expect(initial.snapshot()).toEqual(empty().snapshot());
    expect(first.snapshot()).toMatchObject({ currency: 'PLN', quantity: '1', remainingCostLocal: '101' });
    expect(second.snapshot()).toMatchObject({ quantity: '2', remainingCostLocal: '202' });
    expect(Object.isFrozen(first.instrument)).toBe(true);
    expect(Object.isFrozen(first.snapshot())).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
  });
});

describe('position trade boundaries', () => {
  it('rejects overselling, including an empty position, without changing the prior state', () => {
    expectCode(() => empty().applyTrade(trade('SELL', '1', '100')), 'INSUFFICIENT_QUANTITY');
    const position = empty().applyTrade(trade('BUY', '0.125', '80')).position;
    const before = position.snapshot();
    expectCode(() => position.applyTrade(trade('SELL', '0.1250000001', '80')), 'INSUFFICIENT_QUANTITY');
    expect(position.snapshot()).toEqual(before);
  });
  it('rejects instrument, currency and fee currency mismatches instead of assuming a conversion', () => {
    expectCode(() => empty().applyTrade(trade('BUY', '1', '1', '0', { instrumentId: otherId })), 'INSTRUMENT_MISMATCH');
    expectCode(() => empty().applyTrade(trade('BUY', '1', '1', '0', { currency: 'USD', commissionCurrency: 'USD' })), 'CURRENCY_MISMATCH');
    expectCode(() => empty().applyTrade(trade('BUY', '1', '1', '0', { commissionCurrency: 'USD' })), 'COMMISSION_CURRENCY_MISMATCH');
  });
  it.each([
    { quantity: '0' }, { quantity: '-1' }, { unitPrice: '0' }, { unitPrice: '-1' },
    { commission: '-0.01' }, { quantity: 1 }, { unitPrice: '1e2' }, { commission: '1\n' },
    { kind: 'DIVIDEND' }, { currency: 'GBP' }, { instrumentId: 'invalid' },
    { ownerId: 'forged' }, { fxToBase: '1' }, { commissionCurrency: undefined },
  ])('rejects invalid input: %j', extra => {
    expect(() => empty().applyTrade(trade('BUY', '1', '1', '0', extra))).toThrow();
  });
  it('validates metadata and instrument quantity scale', () => {
    expect(() => Position.empty({ ...instrument, quantityScale: 11 })).toThrow(ZodError);
    expect(() => Position.empty({ ...instrument, quantityScale: 0.5 })).toThrow(ZodError);
    expect(() => Position.empty({ ...instrument, currency: 'GBP' })).toThrow(ZodError);
    expect(() => Position.empty({ ...instrument, instrumentId: 'invalid' })).toThrow(ZodError);
    const whole = Position.empty({ ...instrument, quantityScale: 0 });
    expect(() => whole.applyTrade(trade('BUY', '0.5', '1'))).toThrow('QUANTITY_SCALE_EXCEEDED');
    expect(whole.applyTrade(trade('BUY', '1.000', '1')).position.quantity.toString()).toBe('1');
  });
});
