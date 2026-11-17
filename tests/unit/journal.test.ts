import { expect, it } from 'vitest';
import { journalInputSchema } from '@investorkit/shared';
it('validates journal defaults, trims plain text and rejects forged or oversized fields', () => {
  const input = { decidedAt: '2026-01-01T00:00:00Z', reason: ' Powód ', thesis: ' <script>tekst</script> ' };
  expect(journalInputSchema.parse(input)).toEqual({ ...input, instrumentId: null, reason: 'Powód', thesis: '<script>tekst</script>', horizon: '', risks: '', reviewConditions: '', notes: '' });
  for (const extra of [{ ownerId: 'forged' }, { revision: 2 }, { reason: ' ' }, { thesis: '' }, { instrumentId: 'invalid' }, { decidedAt: 'bad' }, { horizon: 'x'.repeat(501) }, { reason: 'x'.repeat(501) }, { thesis: 'x'.repeat(5001) }, { risks: 'x'.repeat(3001) }, { reviewConditions: 'x'.repeat(3001) }, { notes: 'x'.repeat(10001) }]) expect(journalInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
});
