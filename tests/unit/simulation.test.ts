import { describe, expect, it } from 'vitest';
import { simulatePurchase, SimulationDomainError, FinancialDecimal } from '@investorkit/portfolio-engine';
const id = 'aaf244d6-d1df-4af2-b8bb-8b6e27f56c98';
const other = '45a28878-4d91-440e-a77f-6d77cf59860a';
const asOf = '2026-11-16T12:00:00Z';
const deposit = { kind: 'DEPOSIT', currency: 'PLN', amount: '1000', fxToBase: '1', fxAsOf: asOf, fxSource: 'manual', occurredAt: asOf, note: '' };
const instrument = { instrumentId: id, currency: 'PLN', quantityScale: 0 };
const scenario = { instrumentId: id, budget: '1000', unitPrice: '300', commission: '5', funding: 'EXISTING_CASH' };
const context = { instruments: [instrument], operations: [deposit], quotes: [], fxRates: [], asOf };
const buy = { kind: 'BUY', instrumentId: id, currency: 'PLN', quantity: '1', unitPrice: '100', commission: '0', commissionCurrency: 'PLN', fxToBase: '1', fxAsOf: asOf, fxSource: 'manual', occurredAt: asOf, note: '' };
const quote = { instrumentId: id, price: '300', currency: 'PLN' as const, asOf, source: 'manual' as const };
function code(run: () => unknown, expected: string) {
  try { run(); throw new Error('Expected failure'); } catch (error) { expect(error).toMatchObject({ code: expected }); }
}
describe('P05 deterministic purchase simulator', () => {
  it('golden4 uses existing cash, includes the fee and keeps the remainder', () => {
    const result = simulatePurchase(context, scenario);
    expect(result).toMatchObject({ quantity: '3', actualCost: '905', budgetRemaining: '95', remainingCash: '95', before: { totalValue: '1000' }, after: { totalValue: '995', netContributionsBase: '1000', pnl: '-5' }, delta: { totalValue: '-5', positionValue: '900' } });
    expect(result.after.positions[0]).toMatchObject({ quantity: '3', averageCostLocal: '301.6666666666666666666666666666666666667', remainingCostBase: '905' });
    expect(result.assumptions.reference?.source).toBe('scenario');
    expect(result.after.positions[0]?.weightPct).toBe(FinancialDecimal.parse('900').percentOf(FinancialDecimal.parse('995')).value?.toString());
  });
  it('golden4 adds the entire new budget before purchase and leaves the original cash', () => {
    const result = simulatePurchase(context, { ...scenario, funding: 'NEW_MONEY' });
    expect(result).toMatchObject({ remainingCash: '1095', after: { totalValue: '1995', netContributionsBase: '2000', pnl: '-5' }, delta: { totalValue: '995' } });
  });
  it('explains the user example without treating a new deposit as profit', () => {
    const result = simulatePurchase({ ...context, operations: [{ ...deposit, amount: '80' }], quotes: [{ ...quote, price: '70' }] }, { ...scenario, funding: 'NEW_MONEY', unitPrice: '100', commission: '0' });
    expect(result.after).toMatchObject({ totalValue: '780', netContributionsBase: '1080', pnl: '-300' });
    expect(result.delta.totalValue).toBe('700');
    expect(result.impact).toEqual({ newMoneyBase: '1000', commissionBase: '0', priceDifferenceBase: '-300', netEffectBase: '-300', netEffectPct: '-30' });
    expect(result.assumptions.reference).toEqual({ price: '70', asOf, source: 'manual' });
    expect(result.before.cash[0]?.amount).toBe('80');
  });
  it('keeps deposits separate from the purchase result for either funding source and includes fees', () => {
    for (const funding of ['NEW_MONEY', 'EXISTING_CASH']) {
      const result = simulatePurchase({ ...context, quotes: [quote] }, { ...scenario, funding });
      expect(result.impact).toMatchObject({ newMoneyBase: funding === 'NEW_MONEY' ? '1000' : '0', commissionBase: '5', priceDifferenceBase: '0', netEffectBase: '-5' });
      expect(FinancialDecimal.parse(result.delta.totalValue!).minus(FinancialDecimal.parse(result.impact.newMoneyBase)).toString()).toBe('-5');
      const noFee = simulatePurchase({ ...context, quotes: [quote] }, { ...scenario, funding, commission: '0' });
      expect(noFee.impact.netEffectBase).toBe('0'); expect(noFee.impact.netEffectPct).toBe('0');
    }
    const gain = simulatePurchase({ ...context, quotes: [{ ...quote, price: '125' }] }, { ...scenario, funding: 'NEW_MONEY', unitPrice: '100', commission: '0' });
    expect(gain.impact).toMatchObject({ newMoneyBase: '1000', priceDifferenceBase: '250', netEffectBase: '250', netEffectPct: '25' });
  });
  it('floors fractional quantity and keeps sub-cent remainder without rounding money early', () => {
    const result = simulatePurchase({ ...context, instruments: [{ ...instrument, quantityScale: 3 }] }, { ...scenario, budget: '10', unitPrice: '3', commission: '0.1' });
    expect(result).toMatchObject({ quantity: '3.3', actualCost: '10', budgetRemaining: '0', remainingCash: '990' });
    const fraction = simulatePurchase({ ...context, instruments: [{ ...instrument, quantityScale: 3 }] }, { ...scenario, budget: '10', unitPrice: '3', commission: '0' });
    expect(fraction).toMatchObject({ quantity: '3.333', actualCost: '9.999', budgetRemaining: '0.001' });
  });
  it('requires the whole existing-cash budget even when the rounded purchase would fit', () => {
    code(() => simulatePurchase(context, { ...scenario, budget: '1001', unitPrice: '700' }), 'INSUFFICIENT_CASH');
    code(() => simulatePurchase(context, { ...scenario, budget: '5' }), 'BUDGET_TOO_SMALL');
    code(() => simulatePurchase(context, { ...scenario, budget: '200' }), 'BUDGET_TOO_SMALL');
    code(() => simulatePurchase(context, { ...scenario, unitPrice: '0' }), 'NON_POSITIVE_VALUE');
    expect(() => simulatePurchase(context, { ...scenario, commission: '-1' })).toThrow();
    expect(() => simulatePurchase(context, { ...scenario, budget: 1000 })).toThrow();
  });
  it('uses reference price separately from purchase price and averages with held quantity and fees', () => {
    const result = simulatePurchase({ ...context, operations: [deposit, buy], quotes: [{ ...quote, price: '150' }] }, { ...scenario, budget: '610', unitPrice: '300', commission: '10' });
    expect(result).toMatchObject({ quantity: '2', actualCost: '610', before: { totalValue: '1050' }, after: { totalValue: '740' } });
    expect(result.after.positions[0]).toMatchObject({ quantity: '3', valueBase: '450', remainingCostBase: '710', averageCostLocal: '236.6666666666666666666666666666666666667' });
    expect(result.assumptions.reference).toEqual({ price: '150', asOf, source: 'manual' });
  });
  it('never invents a reference quote for an existing holding, or overwrites stale/future/zero quotes', () => {
    const held = simulatePurchase({ ...context, operations: [deposit, buy] }, { ...scenario, budget: '300', commission: '0' });
    expect(held.impact.netEffectBase).toBeNull(); expect(held.after.complete).toBe(false); expect(held.after.positions[0]?.issues).toContain('MISSING_QUOTE');
    for (const [date, issue] of [['2026-01-01T12:00:00Z', 'STALE_QUOTE'], ['2027-01-01T12:00:00Z', 'FUTURE_QUOTE']]) {
      const result = simulatePurchase({ ...context, quotes: [{ ...quote, asOf: date! }] }, scenario);
      expect(result.after.totalValue).toBeNull(); expect(result.after.positions[0]?.issues).toContain(issue);
      expect(result.impact.netEffectBase).toBeNull(); expect(result.impact.priceDifferenceBase).toBeNull(); expect(result.impact.netEffectPct).toBeNull();
    }
    const zero = simulatePurchase({ ...context, quotes: [{ ...quote, price: '0' }] }, scenario);
    expect(zero.after.totalValue).toBe('95'); expect(zero.assumptions.reference?.source).toBe('manual');
  });
  it('retains incomplete valuations on unrelated positions', () => {
    const result = simulatePurchase({ ...context, instruments: [instrument, { ...instrument, instrumentId: other }], operations: [deposit, { ...buy, instrumentId: other }] }, { ...scenario, budget: '300', commission: '0' });
    expect(result.before.totalValue).toBeNull(); expect(result.after.totalValue).toBeNull(); expect(result.delta.totalValue).toBeNull();
    expect(result.after.positions.find(item => item.instrumentId === id)?.weightPct).toBeNull();
    expect(result.impact.netEffectBase).toBe('0');
  });
  it('uses fresh current FX for the hypothetical deposit/BUY, keeping historic costs intact', () => {
    const usdContext = { ...context, instruments: [{ ...instrument, currency: 'USD', quantityScale: 3 }], operations: [{ ...deposit, currency: 'USD', amount: '20', fxToBase: '4' }], fxRates: [{ currency: 'USD' as const, baseCurrency: 'PLN' as const, rate: '4.2', asOf, source: 'manual' as const }] };
    const result = simulatePurchase(usdContext, { ...scenario, funding: 'NEW_MONEY', budget: '10.5', unitPrice: '80', commission: '0.5' });
    expect(result).toMatchObject({ quantity: '0.125', actualCost: '10.5', after: { totalValue: '126', netContributionsBase: '124.1', pnl: '1.9' }, assumptions: { fx: { rate: '4.2', asOf, source: 'manual' } } });
    expect(result.after.positions[0]?.remainingCostBase).toBe('44.1');
    expect(result.impact).toEqual({ newMoneyBase: '44.1', commissionBase: '2.1', priceDifferenceBase: '0', netEffectBase: '-2.1', netEffectPct: '-4.761904761904761904761904761904761904762' });
    for (const rates of [[], [{ ...usdContext.fxRates[0]!, asOf: '2026-01-01T12:00:00Z' }], [{ ...usdContext.fxRates[0]!, asOf: '2027-01-01T12:00:00Z' }]]) {
      code(() => simulatePurchase({ ...usdContext, operations: [], fxRates: rates }, { ...scenario, funding: 'NEW_MONEY' }), 'SCENARIO_FX_REQUIRED');
    }
  });
  it('accepts FX at exactly the freshness boundary and rejects it just after', () => {
    const fxAsOf = new Date(Date.parse(asOf) - 72 * 3600000).toISOString();
    const ctx = { ...context, instruments: [{ ...instrument, currency: 'USD' }], operations: [], fxRates: [{ currency: 'USD' as const, baseCurrency: 'PLN' as const, rate: '4', asOf: fxAsOf, source: 'manual' as const }] };
    expect(simulatePurchase(ctx, { ...scenario, funding: 'NEW_MONEY' }).after.complete).toBe(true);
    code(() => simulatePurchase({ ...ctx, asOf: new Date(Date.parse(asOf) + 1).toISOString() }, { ...scenario, funding: 'NEW_MONEY' }), 'SCENARIO_FX_REQUIRED');
  });
  it('computes deltas before rounding the before/after presentation snapshots', () => {
    const result = simulatePurchase({ ...context, instruments: [{ ...instrument, quantityScale: 1 }], operations: [{ ...deposit, amount: '1' }, { ...buy, quantity: '0.6', unitPrice: '0.0000000003' }], quotes: [{ ...quote, price: '0.0000000004' }] }, { ...scenario, budget: '0.0000000002', unitPrice: '0.0000000003', commission: '0' });
    expect(result.before.totalValue).toBe('1.0000000001');
    expect(result.after.totalValue).toBe('1.0000000001');
    expect(result.delta.totalValue).toBe('0.0000000001');
    expect(result.actualCost).toBe('0.00000000018');
    expect(result.budgetRemaining).toBe('0.00000000002');
  });
  it('does not mutate inputs or leave effects across repeated runs', () => {
    const original = structuredClone(context);
    const first = simulatePurchase(context, scenario);
    expect(simulatePurchase(context, scenario)).toEqual(first); expect(context).toEqual(original);
    code(() => simulatePurchase(context, { ...scenario, instrumentId: other }), 'UNKNOWN_INSTRUMENT');
    expect(SimulationDomainError.prototype).toBeInstanceOf(Error);
  });
  it('handles the largest representable quantity and refuses a quantity outside the ledger range', () => {
    expect(simulatePurchase({ ...context, operations: [] }, { ...scenario, funding: 'NEW_MONEY', budget: '999999999999999999', unitPrice: '1', commission: '0' }).quantity).toBe('999999999999999999');
    expect(() => simulatePurchase({ ...context, operations: [] }, { ...scenario, funding: 'NEW_MONEY', budget: '999999999999999999', unitPrice: '0.0000000001' })).toThrow();
  });
  it('floors before division rounding can cross an almost-integer boundary', () => {
    const numerator = FinancialDecimal.parse('999999999999999999.9999999999').times(FinancialDecimal.parse('0.0000000001'));
    const denominator = FinancialDecimal.parse('100000000');
    // A 40-digit recurring quotient and maximum scale retain the correct lower unit.
    expect(numerator.dividedByFloor(denominator, 10).toString()).toBe('0.9999999999');
    const near = FinancialDecimal.parse('1').minus(FinancialDecimal.parse('0.0000000001').times(FinancialDecimal.parse('0.0000000001')).times(FinancialDecimal.parse('0.0000000001')).times(FinancialDecimal.parse('0.0000000001')));
    expect(near.dividedByFloor(FinancialDecimal.parse('1'), 0).toString()).toBe('0');
  });
});
