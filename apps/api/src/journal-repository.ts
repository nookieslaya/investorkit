import { and, desc, eq, count } from 'drizzle-orm';
import { instruments, journalEntries, portfolios } from '@investorkit/db';
import type { Database } from '@investorkit/db';
import { journalEntrySchema } from '@investorkit/shared';
import type { JournalInput } from '@investorkit/shared';
import { CashApiError } from './domain-error.js';
const missing = () => new CashApiError(404, 'NOT_FOUND', 'Nie znaleziono wpisu, portfela lub instrumentu.');
const conflict = () => new CashApiError(409, 'REVISION_CONFLICT', 'Wpis zmienił się w innym oknie. Wczytaj aktualny wpis przed ponownym zapisem.');
const dto = (row: typeof journalEntries.$inferSelect) => {
  const { ownerId: _owner, ...fields } = row;
  return journalEntrySchema.parse({ ...fields, decidedAt: row.decidedAt.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
};
type Executor = Pick<Database, 'select'>;
async function checkInstrument(executor: Executor, ownerId: string, id: string | null) {
  if (id === null) return;
  const [row] = await executor.select({ id: instruments.id }).from(instruments).where(and(eq(instruments.id, id), eq(instruments.ownerId, ownerId)));
  if (!row) throw missing();
}
function checkDate(input: JournalInput) {
  if (Date.parse(input.decidedAt) > Date.now()) throw new CashApiError(422, 'FUTURE_DECISION', 'Data decyzji nie może być w przyszłości.');
}
export function journalRepository(db: Database) {
  return {
    async listJournal(ownerId: string, portfolioId: string) {
      const [portfolio] = await db.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, portfolioId), eq(portfolios.ownerId, ownerId)));
      if (!portfolio) throw missing();
      const rows = await db.select().from(journalEntries).where(and(eq(journalEntries.ownerId, ownerId), eq(journalEntries.portfolioId, portfolioId))).orderBy(desc(journalEntries.decidedAt), desc(journalEntries.id)).limit(100);
      return { items: rows.map(dto), limit: 100 as const };
    },
    async createJournal(ownerId: string, portfolioId: string, input: JournalInput) {
      checkDate(input);
      return db.transaction(async tx => {
        const [portfolio] = await tx.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, portfolioId), eq(portfolios.ownerId, ownerId))).for('update');
        if (!portfolio) throw missing();
        await checkInstrument(tx, ownerId, input.instrumentId);
        const [total] = await tx.select({ value: count() }).from(journalEntries).where(and(eq(journalEntries.ownerId, ownerId), eq(journalEntries.portfolioId, portfolioId)));
        if (total && total.value >= 100) throw new CashApiError(422, 'JOURNAL_LIMIT', 'Dziennik mieści do 100 wpisów w tej wersji.');
        const [row] = await tx.insert(journalEntries).values({ ...input, decidedAt: new Date(input.decidedAt), ownerId, portfolioId }).returning();
        if (!row) throw new Error('Journal insert returned no row');
        return dto(row);
      });
    },
    async changeJournal(ownerId: string, id: string, revision: number, input: JournalInput | null) {
      return db.transaction(async tx => {
        const scope = and(eq(journalEntries.id, id), eq(journalEntries.ownerId, ownerId));
        const [current] = await tx.select().from(journalEntries).where(scope).for('update');
        if (!current) throw missing();
        if (current.revision !== revision) throw conflict();
        if (input === null) {
          await tx.delete(journalEntries).where(scope);
          return { id, deleted: true as const };
        }
        checkDate(input);
        await checkInstrument(tx, ownerId, input.instrumentId);
        if (current.revision >= 2147483647) throw new CashApiError(422, 'REVISION_LIMIT', 'Osiągnięto limit zmian wpisu.');
        const [row] = await tx.update(journalEntries).set({ ...input, decidedAt: new Date(input.decidedAt), revision: current.revision + 1 }).where(scope).returning();
        if (!row) throw new Error('Journal update returned no row');
        return dto(row);
      });
    },
  };
}
