import { z } from 'zod';
import { createHash } from 'node:crypto';
import { and, asc, count, eq, gte, lte, sql } from 'drizzle-orm';
import { portfolios, valuationSnapshots } from '@investorkit/db';
import type { Database } from '@investorkit/db';
import { portfolioHistorySchema, snapshotSchema, snapshotSummarySchema, valuationSchema } from '@investorkit/shared';
import type { PortfolioHistoryQuery } from '@investorkit/shared';
import { FinancialDecimal, valuePortfolio, PORTFOLIO_ENGINE_VERSION } from '@investorkit/portfolio-engine';
import { readMarketSnapshot } from './cash-repository.js';
import { CashApiError } from './domain-error.js';
import { missingHistoryDays } from './history-dates.js';
const missing = () => new CashApiError(404, 'NOT_FOUND', 'Nie znaleziono portfela lub zapisanej wyceny.');
const provenance = z.object({ demo: z.boolean().optional() });
const summaryValuation = valuationSchema.omit({ positions: true, cash: true });
type Row = typeof valuationSnapshots.$inferSelect;
function summary(row: Omit<Row, 'valuation'> & { valuation: unknown }) {
  const value = summaryValuation.parse(row.valuation);
  return snapshotSummarySchema.parse({ demo: provenance.parse(row.valuation).demo ?? false, id: row.id, portfolioId: row.portfolioId, asOf: row.asOf.toISOString(), createdAt: row.createdAt.toISOString(), complete: row.complete, valueBase: row.valueBase === null ? null : FinancialDecimal.parse(row.valueBase).toString(), netContributionsBase: FinancialDecimal.parse(row.netContributionsBase).toString(),
    pricedSubtotal: value.pricedSubtotal, pnl: value.pnl, pnlPct: value.pnlPct, pnlPctReason: value.pnlPctReason, engineVersion: row.engineVersion, quoteMaxAgeHours: value.quoteMaxAgeHours, fxMaxAgeHours: value.fxMaxAgeHours, valuationRange: value.valuationRange });
}
const detail = (row: Row) => snapshotSchema.parse({ ...summary(row), valuation: row.valuation, inputsHash: row.inputsHash });
export function historyRepository(db: Database) {
  return {
    async captureValuation(ownerId: string, portfolioId: string) {
      // SERIALIZABLE + bounded retry keeps the input read and the capacity check consistent,
      // including concurrent writes to quotes/FX and concurrent snapshot requests.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await db.transaction(async tx => {
            const [portfolio] = await tx.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, portfolioId), eq(portfolios.ownerId, ownerId))).for('update');
            if (!portfolio) throw missing();
            const [total] = await tx.select({ value: count() }).from(valuationSnapshots).where(and(eq(valuationSnapshots.portfolioId, portfolioId), eq(valuationSnapshots.ownerId, ownerId)));
            if (total && total.value >= 366) throw new CashApiError(422, 'SNAPSHOT_LIMIT', 'Osiągnięto limit 366 zapisanych wycen w tej wersji.');
            const asOf = new Date().toISOString();
            const input = await readMarketSnapshot(tx, ownerId, portfolioId, asOf);
            const valuation = input.hydrate(valuePortfolio(input.context));
            const inputsHash = createHash('sha256').update(JSON.stringify({ context: input.context, metadata: input.metadata, settings: input.settings, engineVersion: PORTFOLIO_ENGINE_VERSION })).digest('hex');
            const fields = { ownerId, portfolioId, createdAt: new Date(), asOf: new Date(asOf), complete: valuation.complete, valueBase: valuation.totalValue, netContributionsBase: valuation.netContributionsBase, inputsHash, engineVersion: valuation.engineVersion, valuation };
            const [created] = await tx.insert(valuationSnapshots).values(fields).onConflictDoNothing({ target: [valuationSnapshots.portfolioId, valuationSnapshots.asOf, valuationSnapshots.inputsHash] }).returning();
            if (created) return detail(created);
            const [existing] = await tx.select().from(valuationSnapshots).where(and(eq(valuationSnapshots.portfolioId, portfolioId), eq(valuationSnapshots.ownerId, ownerId), eq(valuationSnapshots.asOf, fields.asOf), eq(valuationSnapshots.inputsHash, inputsHash)));
            if (!existing) throw new Error('Snapshot insert returned no row');
            return detail(existing);
          }, { isolationLevel: 'serializable' });
        } catch (error) {
          const code = (error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
          if (code !== '40001' && code !== '40P01') throw error;
          if (attempt === 2) throw new CashApiError(409, 'SNAPSHOT_CONFLICT', 'Dane zmieniły się podczas zapisu. Ponów zapis wyceny.');
        }
      }
      throw new Error('Unreachable snapshot retry');
    },
    async portfolioHistory(ownerId: string, portfolioId: string, query: PortfolioHistoryQuery) {
      const now = new Date();
      const to = query.to ?? now.toISOString();
      const from = query.from ?? new Date(Date.parse(to) - 30 * 86400000).toISOString();
      if (Date.parse(from) > Date.parse(to) || Date.parse(to) - Date.parse(from) > 366 * 86400000) throw new CashApiError(422, 'HISTORY_RANGE', 'Zakres historii musi mieć od 0 do 366 dni.');
      if (Date.parse(to) > now.getTime()) throw new CashApiError(422, 'FUTURE_HISTORY', 'Historia nie obejmuje przyszłych dat.');
      return db.transaction(async tx => {
        const [portfolio] = await tx.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, portfolioId), eq(portfolios.ownerId, ownerId)));
        if (!portfolio) throw missing();
        // Do not load all position/cash details for a timeline. They are fetched on demand.
        const rows = await tx.select({ id: valuationSnapshots.id, ownerId: valuationSnapshots.ownerId, portfolioId: valuationSnapshots.portfolioId, asOf: valuationSnapshots.asOf, createdAt: valuationSnapshots.createdAt, complete: valuationSnapshots.complete, valueBase: valuationSnapshots.valueBase, netContributionsBase: valuationSnapshots.netContributionsBase, inputsHash: valuationSnapshots.inputsHash, engineVersion: valuationSnapshots.engineVersion,
          valuation: sql<unknown>`${valuationSnapshots.valuation} - 'positions' - 'cash'`,
        }).from(valuationSnapshots).where(and(eq(valuationSnapshots.ownerId, ownerId), eq(valuationSnapshots.portfolioId, portfolioId), gte(valuationSnapshots.asOf, new Date(from)), lte(valuationSnapshots.asOf, new Date(to)))).orderBy(asc(valuationSnapshots.asOf), asc(valuationSnapshots.id)).limit(366);
        const items = rows.map(summary);
        return portfolioHistorySchema.parse({ items, limit: 366, from, to, dayTimeZone: 'Europe/Warsaw', missingDays: missingHistoryDays(from, to, items.filter(row => !row.demo).map(row => row.asOf)) });
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    },
    async valuationSnapshot(ownerId: string, id: string) {
      const [row] = await db.select().from(valuationSnapshots).where(and(eq(valuationSnapshots.id, id), eq(valuationSnapshots.ownerId, ownerId)));
      if (!row) throw missing();
      return detail(row);
    },
  };
}
