import { and, eq } from 'drizzle-orm';
import { portfolios, riskSettings } from '@investorkit/db';
import type { Database } from '@investorkit/db';
import { DEFAULT_RISK_SETTINGS, riskSettingsSchema } from '@investorkit/shared';
import type { RiskSettingsInput } from '@investorkit/shared';
import { validateRiskSettings } from '@investorkit/portfolio-engine';
import { CashApiError } from './domain-error.js';
type ReadDb = Pick<Database, 'select'>;
const dto = (row: typeof riskSettings.$inferSelect) => riskSettingsSchema.parse({ maxPositionPct: row.maxPositionPct, top3Pct: row.top3Pct, top5Pct: row.top5Pct, quoteMaxAgeHours: row.quoteMaxAgeHours, fxMaxAgeHours: row.fxMaxAgeHours, revision: row.revision });
export async function readRiskSettings(executor: ReadDb, ownerId: string, portfolioId: string) {
  const [row] = await executor.select().from(riskSettings).where(and(eq(riskSettings.portfolioId, portfolioId), eq(riskSettings.ownerId, ownerId)));
  return row ? dto(row) : riskSettingsSchema.parse({ ...DEFAULT_RISK_SETTINGS, revision: 0 });
}
export function riskSettingsRepository(db: Database) {
  const missing = () => new CashApiError(404, 'NOT_FOUND', 'Nie znaleziono portfela.');
  return {
    async getRiskSettings(ownerId: string, id: string) {
      const [portfolio] = await db.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.ownerId, ownerId)));
      if (!portfolio) throw missing();
      return readRiskSettings(db, ownerId, id);
    },
    async updateRiskSettings(ownerId: string, id: string, input: RiskSettingsInput, expectedRevision: number) {
      const settings = validateRiskSettings(input);
      return db.transaction(async tx => {
        const [portfolio] = await tx.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.ownerId, ownerId))).for('update');
        if (!portfolio) throw missing();
        const current = await readRiskSettings(tx, ownerId, id);
        if (current.revision !== expectedRevision) throw new CashApiError(409, 'REVISION_CONFLICT', 'Ustawienia zmieniły się w innym oknie. Odśwież je przed zapisem.');
        if (current.revision >= 2147483647) throw new CashApiError(422, 'REVISION_LIMIT', 'Osiągnięto limit zmian ustawień.');
        const fields = { ...settings, revision: current.revision + 1 };
        const [row] = current.revision === 0
          ? await tx.insert(riskSettings).values({ ...fields, portfolioId: id, ownerId }).returning()
          : await tx.update(riskSettings).set(fields).where(and(eq(riskSettings.portfolioId, id), eq(riskSettings.ownerId, ownerId))).returning();
        if (!row) throw new Error('Settings write returned no row');
        return dto(row);
      });
    },
  };
}
