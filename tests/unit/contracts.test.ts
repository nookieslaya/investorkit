import { describe, it, expect } from 'vitest';
import { createPortfolioSchema, decimalSchema, xtbAdapter } from '@investorkit/shared';
import { parseConfig } from '../../apps/api/src/config.js';
describe('API boundary contracts', () => {
  it('rejects forged owner and unsupported portfolio currency', () => {
    expect(createPortfolioSchema.safeParse({ name: 'Mój', ownerId: 'victim' }).success).toBe(false);
    expect(createPortfolioSchema.safeParse({ name: 'Mój', baseCurrency: 'USD' }).success).toBe(false);
    expect(createPortfolioSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
  it('never coerces binary numbers or unsupported decimals', () => {
    for (const value of [0.1, '1e5', '-1', '0.00000000001', '01.5', 'NaN', '1\n', '1\r', '1\u2028']) expect(decimalSchema.safeParse(value).success).toBe(false);
    expect(decimalSchema.parse('0.125')).toBe('0.125');
  });
  it('blocks unverified broker mapping', () => expect(xtbAdapter).toMatchObject({ available: false, blockedReason: 'SAMPLE_REQUIRED' }));
  it('fails closed without a secret or with an insecure production origin', () => {
    expect(() => parseConfig({})).toThrow();
    expect(() => parseConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://localhost/db', BETTER_AUTH_SECRET: 'x'.repeat(40), WEB_ORIGIN: 'http://localhost:5173', BETTER_AUTH_URL: 'http://localhost:5173' })).toThrow();
  });
});
