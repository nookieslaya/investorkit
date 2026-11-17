import { expect, it } from 'vitest';
import { portfolioHistoryQuerySchema, snapshotInputSchema } from '@investorkit/shared';
import { historyDay, missingHistoryDays } from '../../apps/api/src/history-dates.js';
it('keeps Polish calendar coverage correct across midnight, leap day and daylight saving transitions', () => {
  expect(historyDay('2026-01-01T23:30:00Z')).toBe('2026-01-02');
  expect(missingHistoryDays('2024-02-28T12:00:00Z', '2024-03-01T12:00:00Z', ['2024-02-29T10:00:00Z'])).toEqual(['2024-02-28', '2024-03-01']);
  expect(missingHistoryDays('2026-03-28T23:00:00Z', '2026-03-30T21:59:59Z', ['2026-03-29T01:30:00Z'])).toEqual(['2026-03-30']);
  expect(missingHistoryDays('2026-10-24T22:00:00Z', '2026-10-26T22:59:59Z', ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z'])).toEqual(['2026-10-26']);
  expect(missingHistoryDays('2026-01-01T12:00:00Z', '2026-01-03T12:00:00Z', [])).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
});
it('rejects client valuations and dates when saving, and strictly validates history filters', () => {
  expect(snapshotInputSchema.parse({})).toEqual({});
  for (const input of [{ asOf: '2020-01-01T00:00:00Z' }, { totalValue: '100' }, { ownerId: 'forged' }]) expect(snapshotInputSchema.safeParse(input).success).toBe(false);
  expect(portfolioHistoryQuerySchema.parse({ from: '2026-01-01T00:00:00Z' })).toEqual({ from: '2026-01-01T00:00:00Z' });
  expect(portfolioHistoryQuerySchema.safeParse({ from: 'bad' }).success).toBe(false);
  expect(portfolioHistoryQuerySchema.safeParse({ limit: '9999' }).success).toBe(false);
});
