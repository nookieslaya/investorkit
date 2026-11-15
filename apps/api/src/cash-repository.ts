import { createHash } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { cashOperations, portfolios } from '@investorkit/db';
import type { Database } from '@investorkit/db';
import { cashOperationInputSchema, cashOperationSchema } from '@investorkit/shared';
import type { CashOperationInput } from '@investorkit/shared';
import { FinancialDecimal, replayLedger } from '@investorkit/portfolio-engine';

export class CashApiError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}
type Row = typeof cashOperations.$inferSelect;
export function cashInput(row: Row): CashOperationInput {
  return cashOperationInputSchema.parse({ kind: row.kind, currency: row.currency, amount: row.amount,
    fxToBase: row.fxToBase, fxAsOf: row.fxAsOf.toISOString(), occurredAt: row.occurredAt.toISOString(), fxSource: row.fxSource, note: row.note });
}
export function cashDto(row: Row) {
  return cashOperationSchema.parse({ ...cashInput(row), id: row.id, createdAt: row.createdAt.toISOString() });
}
const scope = (ownerId: string, portfolioId: string) => and(eq(cashOperations.ownerId, ownerId), eq(cashOperations.portfolioId, portfolioId));
const missing = () => new CashApiError(404, 'NOT_FOUND', 'Nie znaleziono portfela.');
function summary(rows: Row[], asOf: string) {
  const result = replayLedger({ operations: rows.map(cashInput), asOf });
  const { positions: _positions, ...cash } = result;
  return cash;
}
export function cashRepository(db: Database) {
  async function ownedRows(ownerId: string, id: string) {
    const [portfolio] = await db.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.ownerId, ownerId)));
    if (!portfolio) throw missing();
    return db.select().from(cashOperations).where(scope(ownerId, id)).orderBy(asc(cashOperations.occurredAt), asc(cashOperations.sequence));
  }
  return {
    async cashSummary(ownerId: string, id: string) { const rows = await ownedRows(ownerId, id); return summary(rows, new Date().toISOString()); },
    async cashHistory(ownerId: string, id: string) { return { items: (await ownedRows(ownerId, id)).reverse().map(cashDto), limit: 1000 as const }; },
    async createCashOperation(ownerId: string, portfolioId: string, input: CashOperationInput, key: string) {
      const normalized = { ...input, amount: FinancialDecimal.parse(input.amount).toString(),
        fxToBase: FinancialDecimal.parseFxRate(input.fxToBase).toString(),
        occurredAt: new Date(input.occurredAt).toISOString(), fxAsOf: new Date(input.fxAsOf).toISOString() };
      const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
      return db.transaction(async tx => {
        const [portfolio] = await tx.select({ id: portfolios.id }).from(portfolios)
          .where(and(eq(portfolios.id, portfolioId), eq(portfolios.ownerId, ownerId))).for('update');
        if (!portfolio) throw missing();
        const rows = await tx.select().from(cashOperations).where(scope(ownerId, portfolioId))
          .orderBy(asc(cashOperations.occurredAt), asc(cashOperations.sequence));
        const existing = rows.find(row => row.idempotencyKey === key);
        if (existing) {
          if (existing.requestHash !== hash) throw new CashApiError(409, 'IDEMPOTENCY_CONFLICT', 'Ten klucz został już użyty z innymi danymi.');
          return cashDto(existing);
        }
        if (rows.length >= 1000) throw new CashApiError(422, 'OPERATION_LIMIT', 'Osiągnięto limit 1000 operacji gotówkowych w tej wersji.');
        // Replay the entire proposed timeline, including every intermediate cash balance.
        replayLedger({ operations: [...rows.map(cashInput), normalized], asOf: new Date().toISOString() });
        const [row] = await tx.insert(cashOperations).values({ ...normalized, ownerId, portfolioId,
          occurredAt: new Date(normalized.occurredAt), fxAsOf: new Date(normalized.fxAsOf), idempotencyKey: key, requestHash: hash }).returning();
        if (!row) throw new Error('Cash operation insert returned no row');
        return cashDto(row);
      });
    },
  };
}
