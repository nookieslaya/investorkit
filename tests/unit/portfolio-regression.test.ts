import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { analyzeRisk, DecimalDomainError, LedgerDomainError, PositionDomainError, replayLedger, simulatePurchase, stressPortfolio, valuePortfolio } from '@investorkit/portfolio-engine';
import type { Currency } from '@investorkit/shared';

const instrumentId = 'a18c84a7-862f-41d8-9c0f-59d23d030365';
const asOf = '2026-11-01T12:00:00Z';
const instrument = { instrumentId, currency: 'PLN' as const, quantityScale: 10 };
const historical = { occurredAt: asOf, fxAsOf: asOf, fxToBase: '1', fxSource: 'manual' as const, note: '' };
const deposit = { ...historical, kind: 'DEPOSIT', currency: 'PLN', amount: '1000' };
const buy = { ...historical, kind: 'BUY', instrumentId, currency: 'PLN', commissionCurrency: 'PLN', quantity: '1', unitPrice: '10', commission: '0' };
const quote = { instrumentId, currency: 'PLN' as const, price: '10', source: 'manual' as const, asOf };
const context = { instruments: [instrument], operations: [deposit], quotes: [quote], fxRates: [], asOf };

describe('P07 regressions across replay, valuation, simulation and risk', () => {
  it('golden1/2 reconciles actual cash, realized38, unrealized58 and total profit96', () => {
    const input = { ...context, operations: [deposit,
      { ...buy, quantity: '2', unitPrice: '100', commission: '2' },
      { ...buy, quantity: '1', unitPrice: '130', commission: '1' },
      { ...buy, kind: 'SELL', quantity: '1', unitPrice: '150', commission: '1' },
    ], quotes: [{ ...quote, price: '140' }] };
    const saved = structuredClone(input);
    const ledger = replayLedger(input);
    expect(ledger.positions[0]).toMatchObject({ quantity: '2', remainingCostLocal: '222', remainingCostBase: '222', realizedBase: '38' });
    expect(ledger.balances[0]?.amount).toBe('816');
    const valuation = valuePortfolio(input);
    expect(valuation).toMatchObject({ totalValue: '1096', netContributionsBase: '1000', pnl: '96', realizedBase: '38', pnlPct: '9.6' });
    expect(valuation.positions[0]).toMatchObject({ valueBase: '280', unrealizedBase: '58', averageCostLocal: '111' });
    const risk = analyzeRisk(input, []);
    expect(risk.valuation).toEqual(valuation);
    expect(risk.concentration.maxPositionExceeded).toBe(true);
    const stress = stressPortfolio(input, { scope: 'SECURITIES', dropPct: '50' });
    expect(stress.before).toEqual(valuation);
    expect(stress).toMatchObject({ lossBase: '140', after: { totalValue: '956' } });
    expect(stress.after.cash).toEqual(valuation.cash);
    const simulation = simulatePurchase(input, { instrumentId, funding: 'EXISTING_CASH', budget: '140', unitPrice: '140', commission: '0' });
    expect(simulation.before).toEqual(valuation);
    expect(simulation.after).toMatchObject({ totalValue: '1096', pnl: '96', realizedBase: '38' });
    expect(simulation.after.positions[0]).toMatchObject({ quantity: '3', remainingCostBase: '362' });
    expect(valuePortfolio(input)).toEqual(valuation);
    expect(input).toEqual(saved);
  });

  it('golden6 preserves two legal identical ledger entries and validates equal-time prefixes', () => {
    const operations = [deposit, buy, buy];
    expect(replayLedger({ ...context, operations })).toMatchObject({ operationCount: 3, positions: [{ quantity: '2', remainingCostBase: '20' }] });
    const withdrawal = { ...deposit, kind: 'WITHDRAWAL' };
    expect(replayLedger({ ...context, operations: [deposit, withdrawal] }).balances[0]?.amount).toBe('0');
    expect(() => replayLedger({ ...context, operations: [withdrawal, deposit] })).toThrow(LedgerDomainError);
    expect(() => replayLedger({ ...context, operations: [withdrawal, deposit] })).toThrow('INSUFFICIENT_CASH');
  });

  it.each([
    { name: 'SELL from zero quantity', operation: { ...buy, kind: 'SELL' }, error: PositionDomainError, message: 'INSUFFICIENT_QUANTITY' },
    { name: 'BUY without cash', operation: buy, error: LedgerDomainError, message: 'INSUFFICIENT_CASH' },
    { name: 'negative fee', operation: { ...buy, commission: '-0.01' }, error: ZodError, message: undefined },
    { name: 'missing FX', operation: { ...deposit, currency: 'USD', fxToBase: undefined }, error: ZodError, message: undefined },
  ])('golden6 rejects $name through the common replay', ({ operation, error, message }) => {
    const run = () => replayLedger({ ...context, operations: [operation] });
    expect(run).toThrow(error);
    if (message) expect(run).toThrow(message);
  });

  it('golden7 keeps profit after withdrawing all original contributions with an open position', () => {
    const input = { ...context, operations: [{ ...deposit, amount: '100' },
      { ...buy, unitPrice: '50' }, { ...buy, kind: 'SELL', unitPrice: '100' },
      { ...deposit, kind: 'WITHDRAWAL', amount: '100' }, buy,
    ] };
    const result = valuePortfolio(input);
    expect(result).toMatchObject({ complete: true, totalValue: '50', netContributionsBase: '0', pnl: '50', pnlPct: null, pnlPctReason: 'NON_POSITIVE_BASE', realizedBase: '50' });
    expect(result.positions[0]?.weightPct).toBe('20');
    // Portfolio weights and shocks use current value, not net contributions as denominator.
    expect(analyzeRisk(input, []).concentration.largestPositionPct).toBe('20');
    expect(stressPortfolio(input, { scope: 'SECURITIES', dropPct: '100' })).toMatchObject({ after: { totalValue: '40' }, lossBase: '10', lossPct: '20' });
    const missing = valuePortfolio({ ...input, quotes: [] });
    expect(missing).toMatchObject({ complete: false, totalValue: null, pnl: null, pnlPct: null, pnlPctReason: 'INCOMPLETE_VALUATION', pricedSubtotal: '40' });
  });

  it('golden7 reports monetary profit with a negative historical contribution base without inventing a percentage', () => {
    const result = valuePortfolio({ ...context, operations: [
      { ...deposit, currency: 'USD', amount: '10', fxToBase: '4' },
      { ...deposit, kind: 'WITHDRAWAL', currency: 'USD', amount: '10', fxToBase: '5' },
    ] });
    expect(result).toMatchObject({ complete: true, totalValue: '0', netContributionsBase: '-10', pnl: '10', pnlPct: null, pnlPctReason: 'NON_POSITIVE_BASE' });
    expect(result.cash.every(row => row.amount === '0' && row.issues.length === 0)).toBe(true);
  });

  it('keeps sub-storage cash changes until replay ends and clears tiny position cost on full exit', () => {
    const tiny = { ...buy, quantity: '0.0000000001', unitPrice: '0.5' };
    const input = { ...context, operations: [{ ...deposit, amount: '1' }, tiny, tiny] };
    expect(replayLedger(input)).toMatchObject({ balances: [{ currency: 'PLN', amount: '0.9999999999' }, { currency: 'EUR', amount: '0' }, { currency: 'USD', amount: '0' }], positions: [{ quantity: '0.0000000002', remainingCostBase: '0.0000000001' }] });
    const closed = replayLedger({ ...input, operations: [...input.operations, { ...tiny, kind: 'SELL', quantity: '0.0000000002' }] });
    expect(closed.balances[0]?.amount).toBe('1');
    expect(closed.positions[0]).toMatchObject({ quantity: '0', remainingCostLocal: '0', remainingCostBase: '0', realizedBase: '0', averageCostBase: null });
  });

  it('rejects public money overflow at replay and valuation boundaries without wrapping or truncation', () => {
    const maximum = { ...deposit, amount: '999999999999999999.9999999999' };
    expect(replayLedger({ ...context, operations: [maximum] }).balances[0]?.amount).toBe(maximum.amount);
    const cases = [
      () => replayLedger({ ...context, operations: [maximum, { ...deposit, amount: '0.0000000001' }] }),
      () => replayLedger({ ...context, operations: [{ ...maximum, currency: 'USD', fxToBase: '2' }] }),
      () => valuePortfolio({ ...context, operations: [{ ...deposit, amount: '2' }, { ...buy, quantity: '2', unitPrice: '1' }], quotes: [{ ...quote, price: '999999999999999999' }] }),
    ];
    for (const run of cases) { expect(run).toThrow(DecimalDomainError); expect(run).toThrow('STORAGE_OVERFLOW'); }
  });

  it('uses separate quote and FX freshness windows, including the exact millisecond boundary', () => {
    const fxTime = '2026-11-01T11:00:00Z';
    const input = { ...context, instruments: [{ ...instrument, currency: 'EUR' }], operations: [{ ...deposit, currency: 'EUR', amount: '1', fxToBase: '4' }],
      fxRates: [{ currency: 'EUR' as const, baseCurrency: 'PLN' as const, rate: '4.5', source: 'manual' as const, asOf: fxTime }], quoteMaxAgeHours: 72, fxMaxAgeHours: 1 };
    expect(valuePortfolio(input)).toMatchObject({ complete: true, totalValue: '4.5', netContributionsBase: '4', pnl: '0.5' });
    const result = valuePortfolio({ ...input, asOf: '2026-11-01T12:00:00.001Z' });
    expect(result).toMatchObject({ complete: false, totalValue: null, pnl: null, pricedSubtotal: '0' });
    expect(result.cash[1]?.issues).toEqual(['STALE_FX']);
  });
});

const scales = [
  { scale: 0, quantity: '31', cost: '99.35', remainder: '0.9', cash: '900.65', newCash: '1000.9' },
  { scale: 3, quantity: '31.281', cost: '100.2492', remainder: '0.0008', cash: '899.7508', newCash: '1000.0008' },
  { scale: 10, quantity: '31.28125', cost: '100.25', remainder: '0', cash: '899.75', newCash: '1000' },
];
const currencies: { currency: Currency; rate: string; before: string; after: string; added: string; fee: string }[] = [
  { currency: 'PLN', rate: '1', before: '1000', after: '999.85', added: '100.25', fee: '0.15' },
  { currency: 'EUR', rate: '4.5', before: '4500', after: '4499.325', added: '451.125', fee: '0.675' },
  { currency: 'USD', rate: '4.2', before: '4200', after: '4199.37', added: '421.05', fee: '0.63' },
];
describe('P07 currency, precision and funding matrix', () => {
  for (const { currency, rate, before, after, added, fee } of currencies) {
    for (const funding of ['NEW_MONEY', 'EXISTING_CASH'] as const) {
      it(`${currency} / ${funding}: floors at scales0/3/10 and preserves fee and remainder`, () => {
        for (const { scale, quantity, cost, remainder, cash, newCash } of scales) {
          const input = { ...context, instruments: [{ ...instrument, currency, quantityScale: scale }],
            operations: [{ ...deposit, currency, fxToBase: rate }], quotes: [{ ...quote, currency, price: '3.2' }],
            fxRates: currency === 'PLN' ? [] : [{ currency, baseCurrency: 'PLN' as const, rate, source: 'manual' as const, asOf }] };
          const saved = structuredClone(input);
          const result = simulatePurchase(input, { instrumentId, funding, budget: '100.25', unitPrice: '3.2', commission: '0.15' });
          expect(result).toMatchObject({ quantity, actualCost: cost, budgetRemaining: remainder, before: { totalValue: before }, impact: { commissionBase: fee, priceDifferenceBase: '0', netEffectBase: `-${fee}`, newMoneyBase: funding === 'NEW_MONEY' ? added : '0' } });
          // Literal expected totals are independent of the simulator's arithmetic.
          const newTotals = { PLN: '1100.1', EUR: '4950.45', USD: '4620.42' };
          expect(result.after.totalValue).toBe(funding === 'NEW_MONEY' ? newTotals[currency] : after);
          expect(result.after.pnl).toBe(`-${fee}`);
          expect(result.remainingCash).toBe(funding === 'NEW_MONEY' ? newCash : cash);
          expect(result.after.cash.find(row => row.currency === currency)?.amount).toBe(result.remainingCash);
          expect(result.after.positions[0]?.quantity).toBe(quantity);
          expect(input).toEqual(saved);
        }
      });
    }
  }
});
