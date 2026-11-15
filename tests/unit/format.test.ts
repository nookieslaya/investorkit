import { expect, it } from 'vitest';
import { formatAmount, formatPercent, formatRounded } from '../../apps/web/src/lib/format.js';
it('formats financial strings beyond binary safe integers and preserves tiny quantities', () => {
  expect(formatAmount('9007199254740993.0000000001')).toBe('9 007 199 254 740 993,0000000001');
  expect(formatAmount('0.0000000001')).toBe('0,0000000001');
});
it('rounds presentation HALF_EVEN including negative ties without negative zero', () => {
  expect(formatPercent('2.345')).toBe('2,34%'); expect(formatPercent('2.355')).toBe('2,36%');
  expect(formatPercent('-2.345')).toBe('-2,34%'); expect(formatPercent('-0.005')).toBe('0,00%');
  expect(formatRounded('1.33333333333333333333', 10)).toBe('1,3333333333');
});
