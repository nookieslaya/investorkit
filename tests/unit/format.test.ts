import { expect, it } from 'vitest';
import { formatAmount, formatPercent, formatRounded, formatMoney, formatQuantity, formatCash, formatAverageCosts } from '../../apps/web/src/lib/format.js';
it('formats financial strings beyond binary safe integers and preserves tiny quantities', () => {
  expect(formatAmount('9007199254740993.0000000001')).toBe('9 007 199 254 740 993,0000000001');
  expect(formatAmount('0.0000000001')).toBe('0,0000000001');
});
it('rounds presentation HALF_EVEN including negative ties without negative zero', () => {
  expect(formatPercent('2.345')).toBe('2,34%'); expect(formatPercent('2.355')).toBe('2,36%');
  expect(formatPercent('-2.345')).toBe('-2,34%'); expect(formatPercent('-0.005')).toBe('0,00%');
  expect(formatRounded('1.33333333333333333333', 10)).toBe('1,3333333333');
});

it('formats money with exactly two places, HALF_EVEN, large amounts and no negative zero', () => {
  expect(formatMoney('1234.1')).toBe('1 234,10');
  expect(formatMoney('1.20')).toBe('1,20');
  expect(formatMoney('2.345')).toBe('2,34');
  expect(formatMoney('-0.005')).toBe('0,00');
  expect(formatMoney('9007199254740993.125')).toBe('9 007 199 254 740 993,12');
});
it('caps primary quantities at six decimals, trims zeros and labels approximation', () => {
  expect(formatQuantity('10.0000000000')).toBe('10');
  expect(formatQuantity('0.125000')).toBe('0,125');
  expect(formatQuantity('1.123456')).toBe('1,123456');
  expect(formatQuantity('1.12345678')).toBe('≈1,123457');
  expect(formatQuantity('0.0000000001')).toBe('≈0');
  expect(formatQuantity('9007199254740993.000001')).toBe('9 007 199 254 740 993,000001');
});
it('shows positive sub-cent cash without pretending it is zero', () => {
  expect(formatCash('0.00000000002', 'PLN')).toBe('<0,01 PLN');
  expect(formatCash('0.0099', 'USD')).toBe('<0,01 USD');
  expect(formatCash('0.000', 'EUR')).toBe('0,00 EUR');
  expect(formatCash('0.01', 'EUR')).toBe('0,01 EUR');
  expect(formatCash('1.234', 'PLN')).toBe('1,23 PLN');
});
it('reveals cost differences hidden by two decimal places using the same scale before/after', () => {
  expect(formatAverageCosts('100', '101.234')).toEqual({ before: '100,00', after: '101,23' });
  expect(formatAverageCosts('100.001', '100.002')).toEqual({ before: '100,001', after: '100,002' });
  expect(formatAverageCosts('1.00000000001', '1.00000000002')).toEqual({ before: '1,00000000001', after: '1,00000000002' });
  expect(formatAverageCosts('100.0010', '100.001')).toEqual({ before: '100,00', after: '100,00' });
  expect(formatAverageCosts(null, '0.0000000001')).toEqual({ before: '—', after: '0,0000000001' });
});
