import { and, asc, eq } from 'drizzle-orm';
import { instruments, portfolios } from '@investorkit/db';
import type { Database } from '@investorkit/db';
import type { CsvPreviewInput } from '@investorkit/shared';
import { CashApiError } from '../domain-error.js';
import { instrumentDto } from '../market-repository.js';
import { genericCsvParser } from './csv-parser.js';
export function csvRepository(db: Database) {
  return {
    csvPreview(ownerId: string, portfolioId: string, input: CsvPreviewInput) {
      return db.transaction(async tx => {
        const [portfolio] = await tx.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, portfolioId), eq(portfolios.ownerId, ownerId)));
        if (!portfolio) throw new CashApiError(404, 'NOT_FOUND', 'Nie znaleziono portfela.');
        const ownInstruments = await tx.select().from(instruments).where(eq(instruments.ownerId, ownerId)).orderBy(asc(instruments.id));
        return genericCsvParser.preview(input, ownInstruments.map(instrumentDto), new Date().toISOString());
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    },
  };
}
