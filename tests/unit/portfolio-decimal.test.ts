import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  DecimalDomainError, FinancialDecimal, parseAmount, parseCommission,
  parseQuantity, parseUnitPrice, sumDecimals,
} from '@investorkit/portfolio-engine';
const d = FinancialDecimal.parse;
function expectCode(action: () => unknown, code: string) {
  expect(action).toThrow(DecimalDomainError);
  expect(action).toThrow(code);
}

describe('financial arithmetic', () => {
  it('preserves fractions and values beyond the binary safe integer limit', () => {
    expect(sumDecimals([d('0.1'), d('0.2')]).toString()).toBe('0.3');
    expect(d('9007199254740993.0000000001').times(d('3')).toString()).toBe('27021597764222979.0000000003');
    expect(d('999999999999999999.9999999999').plus(d('0.0000000001')).toString()).toBe('1000000000000000000');
    expect(sumDecimals(Array.from({ length: 1000 }, () => d('0.01'))).toString()).toBe('10');
    expect(sumDecimals([]).toString()).toBe('0');
  });
  it('keeps 40 significant digits and does not round intermediate values to storage scale', () => {
    expect(d('1').dividedBy(d('3')).toString()).toBe(`0.${'3'.repeat(40)}`);
    expect(d('0.0000000001').times(d('0.0000000001')).toString()).toBe('0.00000000000000000001');
    const a = d('1').dividedBy(d('3'));
    expect(sumDecimals([a, a, a]).toStorageString()).toBe('1');
    expect(d('1').dividedBy(d('8')).times(d('8')).toString()).toBe('1');
  });
  it('does not mutate operands and serializes decimal strings without exponent or negative zero', () => {
    const value = d('0.125');
    value.plus(d('1')).times(d('2'));
    expect(value.toString()).toBe('0.125');
    expect(JSON.stringify({ value, zero: d('-0.000') })).toBe('{"value":"0.125","zero":"0"}');
    expect(d('-0.000').isNegative()).toBe(false);
    expect(d('0.1').minus(d('0.3')).toString()).toBe('-0.2');
    expect(d('0.1').compare(d('0.100'))).toBe(0);
    expect(d('-1').compare(d('0'))).toBe(-1);
  });
  it('isolates precision, rounding and exponent settings from global Decimal configuration', () => {
    const original = { precision: Decimal.precision, rounding: Decimal.rounding, minE: Decimal.minE, maxE: Decimal.maxE };
    try {
      Decimal.set({ precision: 2, rounding: Decimal.ROUND_UP, minE: -2, maxE: 2 });
      expect(d('1').dividedBy(d('3')).toString()).toBe(`0.${'3'.repeat(40)}`);
      expect(d('2.345').toFixed(2)).toBe('2.34');
      expect(d('0.0000000001').times(d('0.0000000001')).toString()).toBe('0.00000000000000000001');
      expect(d('9007199254740993').toString()).toBe('9007199254740993');
    } finally { Decimal.set(original); }
  });
  it('returns explicit diagnostics for non-positive percentage bases and rejects division by zero', () => {
    expectCode(() => d('1').dividedBy(d('0')), 'DIVISION_BY_ZERO');
    expectCode(() => d('0').dividedBy(d('-0')), 'DIVISION_BY_ZERO');
    for (const base of ['0', '-10']) expect(d('5').percentOf(d(base))).toEqual({ value: null, reason: 'NON_POSITIVE_BASE' });
    expect(d('5.25').percentOf(d('42')).value?.toString()).toBe('12.5');
    expect(d('-5').percentOf(d('10')).value?.toString()).toBe('-50');
    expect(d('0').percentOf(d('10')).value?.toString()).toBe('0');
  });
});

describe('decimal boundaries', () => {
  it('rejects coercion, unsupported notation and excessive input precision instead of rounding', () => {
    const invalid: unknown[] = [0.1, 1n, null, undefined, {}, new Decimal('1'), '', ' 1', '1 ', '1\n', '1\r', '1\u2028', '+1', '1e5', '0x10', 'NaN', 'Infinity', '-Infinity', '01.5', '.5', '1.', '1,5', '1_000', '0.00000000001', '1000000000000000000', '-1000000000000000000'];
    for (const value of invalid) expectCode(() => d(value), 'INVALID_DECIMAL');
    expect(d('999999999999999999.9999999999').toString()).toBe('999999999999999999.9999999999');
  });
  it('validates money, commissions, positive prices and instrument quantity scale', () => {
    expect(parseAmount('0').toString()).toBe('0');
    expect(parseCommission('0.5').toString()).toBe('0.5');
    expectCode(() => parseCommission('-0.01'), 'NEGATIVE_VALUE');
    expectCode(() => parseAmount('-1'), 'NEGATIVE_VALUE');
    expectCode(() => parseUnitPrice('0'), 'NON_POSITIVE_VALUE');
    expectCode(() => parseQuantity('0', 10), 'NON_POSITIVE_VALUE');
    expect(parseQuantity('0.125', 3).toString()).toBe('0.125');
    expect(parseQuantity('1.000', 0).toString()).toBe('1');
    expect(parseQuantity('0.0000000001', 10).toString()).toBe('0.0000000001');
    expectCode(() => parseQuantity('0.125', 2), 'QUANTITY_SCALE_EXCEEDED');
  });
  it('rejects invalid scales and floors quantities explicitly', () => {
    for (const scale of [-1, 1.5, 11, NaN, Infinity]) {
      expectCode(() => parseQuantity('1', scale), 'INVALID_SCALE');
      expectCode(() => d('1').floorToScale(scale), 'INVALID_SCALE');
      expectCode(() => d('1').toFixed(scale), 'INVALID_SCALE');
    }
    expect(d('3.999').floorToScale(0).toString()).toBe('3');
    expect(d('0.129').floorToScale(2).toString()).toBe('0.12');
    expect(d('-0.129').floorToScale(2).toString()).toBe('-0.13');
  });
  it.each([
    ['2.345', '2.34'], ['2.355', '2.36'], ['-2.345', '-2.34'],
    ['-2.355', '-2.36'], ['0.005', '0.00'], ['-0.005', '0.00'], ['0.015', '0.02'],
  ])('uses HALF_EVEN at the presentation boundary: %s → %s', (input, expected) => {
    expect(d(input).toFixed(2)).toBe(expected);
    expect(d(input).toString()).toBe(input);
  });
  it('rounds only at the explicit storage boundary and checks overflow after rounding', () => {
    expect(d('0.0000000001').dividedBy(d('2')).toStorageString()).toBe('0');
    expect(d('0.0000000003').dividedBy(d('2')).toStorageString()).toBe('0.0000000002');
    expect(d('-0.0000000003').dividedBy(d('2')).toStorageString()).toBe('-0.0000000002');
    const maximum = d('999999999999999999.9999999999');
    expect(maximum.toStorageString()).toBe(maximum.toString());
    const halfUnit = d('0.0000000001').dividedBy(d('2'));
    expectCode(() => maximum.plus(halfUnit).toStorageString(), 'STORAGE_OVERFLOW');
    expectCode(() => d('-999999999999999999.9999999999').minus(halfUnit).toStorageString(), 'STORAGE_OVERFLOW');
    expectCode(() => maximum.plus(d('1')).toStorageString(), 'STORAGE_OVERFLOW');
  });
});
