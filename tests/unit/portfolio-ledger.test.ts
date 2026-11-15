import { describe, expect, it } from 'vitest';
import { FinancialDecimal, replayLedger } from '@investorkit/portfolio-engine';
const instrumentId = 'f6f92d67-ecaa-4ec6-a9ef-e80f1df4f763';
const instrument = { instrumentId, currency: 'USD', quantityScale: 10 };
const date = '2026-01-02T12:00:00Z';
const fx = { fxToBase: '4', fxAsOf: date, fxSource: 'manual', occurredAt: date };
const deposit = (amount: string, extra: Record<string, unknown> = {}) => ({ kind: 'DEPOSIT', amount, currency: 'USD', note: '', ...fx, ...extra });
const buy = (extra: Record<string, unknown> = {}) => ({ kind: 'BUY', instrumentId, quantity: '0.125', unitPrice: '80', commission: '0.5', currency: 'USD', commissionCurrency: 'USD', ...fx, ...extra });
const replay = (operations: readonly unknown[]) => replayLedger({ instruments: [instrument], operations, asOf: '2026-02-01T00:00:00Z' });

describe('P03 cash and historical FX', () => {
  it('starts with three real zero balances and zero net contributions', () => {
    expect(replay([]).balances).toEqual([{ currency: 'PLN', amount: '0' }, { currency: 'EUR', amount: '0' }, { currency: 'USD', amount: '0' }]);
    expect(replay([]).netContributionsBase).toBe('0');
  });
  it('golden3: fractional BUY costs42PLN and leaves9.5USD cash', () => {
    const result = replay([deposit('20'), buy()]);
    expect(result.balances.find(row => row.currency === 'USD')?.amount).toBe('9.5');
    expect(result.netContributionsBase).toBe('80');
    expect(result.positions[0]).toMatchObject({ remainingCostLocal: '10.5', remainingCostBase: '42', averageCostBase: '336' });
    // Reference arithmetic only; actual valuation/freshness remains P04.
    const value = FinancialDecimal.parse('0.125').times(FinancialDecimal.parse('90')).times(FinancialDecimal.parseFxRate('4.2'));
    expect(value.toString()).toBe('47.25');
    expect(value.minus(FinancialDecimal.parse('42')).toString()).toBe('5.25');
  });
  it('keeps the cost of each BUY at its historical FX and realizes SELL at sale FX', () => {
    const result = replay([deposit('100'), buy({ quantity: '1', unitPrice: '10', commission: '0' }),
      buy({ quantity: '1', unitPrice: '10', commission: '0', fxToBase: '5' }),
      buy({ kind: 'SELL', quantity: '1', unitPrice: '15', commission: '1', fxToBase: '6' })]);
    expect(result.positions[0]).toMatchObject({ quantity: '1', remainingCostLocal: '10', remainingCostBase: '45', realizedBase: '39' });
    expect(result.balances.find(row => row.currency === 'USD')?.amount).toBe('94');
    expect(result.netContributionsBase).toBe('400');
  });
  it('subtracts withdrawals using their own FX, including non-positive net contributions', () => {
    const result = replay([deposit('10'), deposit('10', { kind: 'WITHDRAWAL', fxToBase: '5' })]);
    expect(result.netContributionsBase).toBe('-10');
    expect(result.balances.find(row => row.currency === 'USD')?.amount).toBe('0');
  });
  it('preserves 12-digit FX precision and only rounds the final public money snapshot', () => {
    expect(FinancialDecimal.parseFxRate('4.123456789012').toString()).toBe('4.123456789012');
    expect(replay([deposit('10', { fxToBase: '4.123456789012' })]).netContributionsBase).toBe('41.2345678901');
    for (const rate of ['0', '-1', '1e2', '1\n', '1.0000000000001', '10000000000000000']) expect(() => FinancialDecimal.parseFxRate(rate)).toThrow();
  });
  it('rejects missing/zero FX, PLN FX other than1 and future timestamps', () => {
    expect(() => replay([deposit('1', { fxToBase: undefined })])).toThrow();
    expect(() => replay([deposit('1', { fxToBase: '0' })])).toThrow();
    expect(() => replay([deposit('1', { currency: 'PLN' })])).toThrow('INVALID_FX');
    expect(() => replay([deposit('1', { fxAsOf: '2026-01-03T00:00:00Z' })])).toThrow('FUTURE_FX');
    expect(() => replay([deposit('1', { occurredAt: '2099-01-01T00:00:00Z' })])).toThrow('FUTURE_OPERATION');
  });
  it('checks cash in the traded currency without automatic conversion', () => {
    expect(() => replay([deposit('100', { currency: 'PLN', fxToBase: '1' }), buy()])).toThrow('INSUFFICIENT_CASH');
    expect(() => replay([deposit('10'), buy()])).toThrow('INSUFFICIENT_CASH');
    expect(() => replay([deposit('1'), deposit('2', { kind: 'WITHDRAWAL' })])).toThrow('INSUFFICIENT_CASH');
  });
  it('checks cash coverage of SELL fees even when there is enough quantity', () => {
    expect(() => replay([deposit('1'), buy({ quantity: '1', unitPrice: '1', commission: '0' }), buy({ kind: 'SELL', quantity: '1', unitPrice: '0.5', commission: '1' })])).toThrow('INSUFFICIENT_CASH');
  });
  it('sorts chronologically and validates every intermediate state after backdated insertion', () => {
    const earlier = '2026-01-01T00:00:00Z';
    expect(() => replay([deposit('10'), deposit('5', { kind: 'WITHDRAWAL', occurredAt: earlier, fxAsOf: earlier })])).toThrow('INSUFFICIENT_CASH');
    expect(replay([deposit('5', { kind: 'WITHDRAWAL' }), deposit('10', { occurredAt: earlier, fxAsOf: earlier })]).balances[2]?.amount).toBe('5');
  });
  it('closes base cost exactly and keeps original operation objects unchanged', () => {
    const operations = [Object.freeze(deposit('10')), Object.freeze(buy({ quantity: '3', unitPrice: '1', commission: '1' })),
      ...Array.from({ length: 3 }, () => Object.freeze(buy({ kind: 'SELL', quantity: '1', unitPrice: '2', commission: '0' })))];
    const before = JSON.stringify(operations);
    expect(replay(operations).positions[0]).toMatchObject({ quantity: '0', remainingCostBase: '0', averageCostBase: null, realizedBase: '8' });
    expect(JSON.stringify(operations)).toBe(before);
    expect(replay(operations)).toEqual(replay(operations));
  });
});
