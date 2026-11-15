import { and, asc, eq } from 'drizzle-orm';
import { instruments, manualQuotes, fxRates, user } from '@investorkit/db';
import type { Database } from '@investorkit/db';
import { instrumentSchema, quoteSchema, fxSchema } from '@investorkit/shared';
import type { CreateInstrument, quoteInputSchema, fxInputSchema } from '@investorkit/shared';
import type { z } from 'zod';
import { FinancialDecimal } from '@investorkit/portfolio-engine';
import { CashApiError } from './domain-error.js';
export function instrumentDto(row: typeof instruments.$inferSelect) {
  const { ownerId: _owner, ...fields } = row;
  return instrumentSchema.parse({ ...fields, createdAt: row.createdAt.toISOString() });
}
export function quoteDto(row: typeof manualQuotes.$inferSelect) {
  return quoteSchema.parse({ id: row.id, instrumentId: row.instrumentId, currency: row.currency, price: row.price, asOf: row.asOf.toISOString(), source: row.source, createdAt: row.createdAt.toISOString() });
}
export function fxDto(row: typeof fxRates.$inferSelect) {
  return fxSchema.parse({ id: row.id, currency: row.currency, baseCurrency: row.baseCurrency, rate: row.rate, asOf: row.asOf.toISOString(), source: row.source, createdAt: row.createdAt.toISOString() });
}
function checkDate(asOf: string) {
  if (Date.parse(asOf) > Date.now()) throw new CashApiError(422, 'FUTURE_MARKET_DATA', 'Cena lub kurs nie mogą pochodzić z przyszłości.');
}
export function marketRepository(db: Database) {
  return {
    async listInstruments(ownerId: string) {
      return { items: (await db.select().from(instruments).where(eq(instruments.ownerId, ownerId)).orderBy(asc(instruments.createdAt), asc(instruments.id))).map(instrumentDto) };
    },
    async createInstrument(ownerId: string, input: CreateInstrument) {
      return db.transaction(async tx => {
        await tx.select({ id: user.id }).from(user).where(eq(user.id, ownerId)).for('update');
        const rows = await tx.select({ id: instruments.id }).from(instruments).where(eq(instruments.ownerId, ownerId));
        if (rows.length >= 100) throw new CashApiError(422, 'INSTRUMENT_LIMIT', 'Limit tej wersji to 100 instrumentów.');
        const [row] = await tx.insert(instruments).values({ ownerId, ...input }).returning();
        if (!row) throw new Error('Instrument insert returned no row');
        return instrumentDto(row);
      });
    },
    async createQuote(ownerId: string, instrumentId: string, input: z.infer<typeof quoteInputSchema>) {
      return db.transaction(async tx => {
        const [instrument] = await tx.select().from(instruments).where(and(eq(instruments.id, instrumentId), eq(instruments.ownerId, ownerId))).for('update');
        if (!instrument) throw new CashApiError(404, 'NOT_FOUND', 'Nie znaleziono instrumentu.');
        if (instrument.currency !== input.currency) throw new CashApiError(422, 'CURRENCY_MISMATCH', 'Cena musi być w walucie instrumentu.');
        checkDate(input.asOf);
        const rows = await tx.select({ id: manualQuotes.id }).from(manualQuotes).where(and(eq(manualQuotes.ownerId, ownerId), eq(manualQuotes.instrumentId, instrumentId)));
        if (rows.length >= 500) throw new CashApiError(422, 'QUOTE_LIMIT', 'Limit tej wersji to 500 cen na instrument.');
        const [row] = await tx.insert(manualQuotes).values({ ...input, ownerId, instrumentId, asOf: new Date(input.asOf) }).returning();
        if (!row) throw new Error('Quote insert returned no row');
        return quoteDto(row);
      });
    },
    async createFx(ownerId: string, input: z.infer<typeof fxInputSchema>) {
      checkDate(input.asOf);
      const rate = FinancialDecimal.parseFxRate(input.rate);
      if (input.currency === 'PLN' && rate.compare(FinancialDecimal.parse('1')) !== 0) throw new CashApiError(422, 'INVALID_FX', 'Kurs PLN musi wynosić 1.');
      return db.transaction(async tx => {
        await tx.select({ id: user.id }).from(user).where(eq(user.id, ownerId)).for('update');
        const rows = await tx.select({ id: fxRates.id }).from(fxRates).where(eq(fxRates.ownerId, ownerId));
        if (rows.length >= 1000) throw new CashApiError(422, 'FX_LIMIT', 'Limit tej wersji to 1000 kursów wyceny.');
        const [row] = await tx.insert(fxRates).values({ ...input, ownerId, asOf: new Date(input.asOf) }).returning();
        if (!row) throw new Error('FX insert returned no row');
        return fxDto(row);
      });
    },
  };
}
