import { createHash } from 'node:crypto';
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { instruments, marketBindings, marketQuotes, marketSelections, marketBudget, cashOperations } from '@investorkit/db';
import type { Database } from '@investorkit/db';
import { marketStatesSchema, marketSearchSchema, marketStateSchema } from '@investorkit/shared';
import type { Config } from './config.js';
import { CashApiError } from './domain-error.js';
import { marketstackProvider, MarketDataError } from './market-data-provider.js';
import type { MarketDataProvider } from './market-data-provider.js';
const unavailable = () => new CashApiError(503, 'MARKET_UNAVAILABLE', 'Automatyczne dane są wyłączone. Ręczne ceny pozostają dostępne.');
const missing = () => new CashApiError(404, 'NOT_FOUND', 'Nie znaleziono zasobu.');
const day = () => new Date().toISOString().slice(0, 10);
export function marketDataService(db: Database, config: Config, injected?: MarketDataProvider) {
  const budgetId = () => `${createHash('sha256').update(config.MARKETSTACK_API_KEY ?? '').digest('hex').slice(0, 16)}:${day().slice(0, 7)}`;
  const enabled = config.MARKETSTACK_ENABLED;
  // One active market operation per process avoids connection-pool starvation while a binding is locked.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = queue.then(run, run); queue = next.catch(() => undefined); return next;
  }
  const provider = injected ?? marketstackProvider(config.MARKETSTACK_API_KEY ?? '', async () => {
    if (!enabled) throw unavailable();
    const rows = await db.insert(marketBudget).values({ id: budgetId(), used: 1 }).onConflictDoUpdate({
      target: marketBudget.id, set: { used: sql`${marketBudget.used} + 1` },
      setWhere: sql`${marketBudget.used} < ${config.MARKETSTACK_MONTHLY_BUDGET} AND ${marketBudget.blocked} IS NULL`,
    }).returning();
    if (!rows.length) throw new MarketDataError('BUDGET_BLOCKED');
  }, async code => { await db.update(marketBudget).set({ blocked: code }).where(eq(marketBudget.id, budgetId())); });
  async function state(ownerId: string, instrumentId: string) {
    const [row] = await db.select().from(marketBindings).where(and(eq(marketBindings.ownerId, ownerId), eq(marketBindings.instrumentId, instrumentId)));
    if (!row) throw missing();
    const [quote] = await db.select().from(marketQuotes).where(and(eq(marketQuotes.ownerId, ownerId), eq(marketQuotes.instrumentId, instrumentId), eq(marketQuotes.symbol, row.symbol), eq(marketQuotes.mic, row.mic))).orderBy(desc(marketQuotes.asOf)).limit(1);
    return marketStateSchema.parse({ ...row, lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
      quote: quote ? { price: quote.price, asOf: quote.asOf.toISOString(), sessionDate: quote.sessionDate, fetchedAt: quote.fetchedAt.toISOString() } : null });
  }
  async function refreshLocked(ownerId: string, instrumentId: string) {
    if (!enabled) throw unavailable();
    await db.transaction(async tx => {
      const [binding] = await tx.select().from(marketBindings).where(and(eq(marketBindings.ownerId, ownerId), eq(marketBindings.instrumentId, instrumentId))).for('update');
      if (!binding) throw missing();
      if (binding.mode !== 'marketstack') throw new CashApiError(422, 'MANUAL_MODE', 'Najpierw wybierz źródło Marketstack.');
      // A daily attempt is idempotent across jobs, processes and manual refreshes, including failures.
      if (binding.lastAttemptAt?.toISOString().slice(0, 10) === day()) return;
      const attemptedAt = new Date();
      let status = 'ok';
      try {
        const quote = await provider.latest({ symbol: binding.symbol, mic: binding.mic, name: '' });
        if (quote.currency !== binding.currency) throw new MarketDataError('CURRENCY_MISMATCH');
        await tx.insert(marketQuotes).values({ instrumentId, ownerId, symbol: binding.symbol, mic: binding.mic,
          currency: quote.currency, price: quote.price, sessionDate: quote.sessionDate,
          asOf: new Date(quote.asOf), fetchedAt: new Date(quote.fetchedAt) }).onConflictDoNothing();
      } catch (error) { status = error instanceof MarketDataError ? error.code : 'UPDATE_FAILED'; }
      await tx.update(marketBindings).set({ lastAttemptAt: attemptedAt, status }).where(and(eq(marketBindings.ownerId, ownerId), eq(marketBindings.instrumentId, instrumentId)));
    });
    return state(ownerId, instrumentId);
  }
  return {
    async states(ownerId: string) {
      const bindings = await db.select({ id: marketBindings.instrumentId }).from(marketBindings).where(eq(marketBindings.ownerId, ownerId)).orderBy(asc(marketBindings.instrumentId));
      const [budget] = await db.select().from(marketBudget).where(eq(marketBudget.id, budgetId()));
      return marketStatesSchema.parse({ enabled, used: budget?.used ?? 0, limit: config.MARKETSTACK_MONTHLY_BUDGET,
        items: await Promise.all(bindings.map(row => state(ownerId, row.id))) });
    },
    search(ownerId: string, query: string, mic: string) { return serial(async () => {
      if (!enabled) throw unavailable();
      const normalized = query.trim().toLowerCase();
      await db.delete(marketSelections).where(and(eq(marketSelections.ownerId, ownerId), lt(marketSelections.expiresAt, new Date())));
      const cached = await db.select().from(marketSelections).where(and(eq(marketSelections.ownerId, ownerId), eq(marketSelections.query, normalized), eq(marketSelections.mic, mic), gt(marketSelections.expiresAt, new Date()))).limit(3);
      const dto = (rows: typeof cached, partial: boolean, isCached: boolean) => marketSearchSchema.parse({
        items: rows.map(row => ({ id: row.id, symbol: row.symbol, name: row.name, mic: row.mic, currency: row.currency, type: null, hasEod: true })), partial, cached: isCached,
      });
      if (cached.length) return dto(cached, true, true);
      try {
        const result = await provider.search(query, mic);
        const rows: typeof cached = []; let partial = result.partial;
        for (const listing of result.items) {
          try {
            const quote = await provider.latest(listing);
            const [row] = await db.insert(marketSelections).values({ ownerId, query: normalized, name: listing.name,
              symbol: listing.symbol, mic: listing.mic, currency: quote.currency, price: quote.price,
              sessionDate: quote.sessionDate, asOf: new Date(quote.asOf), fetchedAt: new Date(quote.fetchedAt),
              expiresAt: new Date(Date.now() + 15 * 60_000) }).returning();
            if (row) rows.push(row);
          } catch (error) {
            if (error instanceof MarketDataError && ['NO_EOD', 'INVALID_RESPONSE', 'CURRENCY_MISMATCH'].includes(error.code)) { partial = true; continue; }
            throw error;
          }
        }
        return dto(rows, partial, false);
      } catch { throw new CashApiError(503, 'MARKET_SEARCH_FAILED', 'Nie udało się potwierdzić instrumentów i walut. Sprawdź limit lub spróbuj później. Możesz dodać instrument ręcznie.'); }
    }); },
    bind(ownerId: string, instrumentId: string, selectionId: string) { return serial(async () => {
      if (!enabled) throw unavailable();
      await db.transaction(async tx => {
        const [instrument] = await tx.select().from(instruments).where(and(eq(instruments.id, instrumentId), eq(instruments.ownerId, ownerId))).for('update');
        if (!instrument) throw missing();
        const [selection] = await tx.select().from(marketSelections).where(and(eq(marketSelections.id, selectionId), eq(marketSelections.ownerId, ownerId), gt(marketSelections.expiresAt, new Date())));
        if (!selection) throw new CashApiError(422, 'SELECTION_EXPIRED', 'Wyszukaj instrument ponownie; wybór wygasł.');
        if (instrument.currency !== selection.currency || instrument.mic !== selection.mic) throw new CashApiError(422, 'LISTING_MISMATCH', 'Giełda i waluta muszą odpowiadać instrumentowi. Wybierz właściwe notowanie.');
        const [existing] = await tx.select().from(marketBindings).where(and(eq(marketBindings.instrumentId, instrumentId), eq(marketBindings.ownerId, ownerId)));
        if (existing && (existing.symbol !== selection.symbol || existing.mic !== selection.mic)) throw new CashApiError(409, 'BINDING_EXISTS', 'Instrument ma już inne mapowanie dostawcy. Nie można go podmienić.');
        await tx.insert(marketBindings).values({ instrumentId, ownerId, currency: selection.currency, symbol: selection.symbol, mic: selection.mic,
          mode: 'marketstack', lastAttemptAt: selection.fetchedAt, status: 'ok' }).onConflictDoUpdate({ target: marketBindings.instrumentId, set: { mode: 'marketstack' } });
        await tx.insert(marketQuotes).values({ ownerId, instrumentId, currency: selection.currency, symbol: selection.symbol, mic: selection.mic,
          price: selection.price, asOf: selection.asOf, sessionDate: selection.sessionDate, fetchedAt: selection.fetchedAt }).onConflictDoNothing();
      });
      return state(ownerId, instrumentId);
    }); },
    mode(ownerId: string, instrumentId: string, mode: 'manual' | 'marketstack') { return serial(async () => {
      if (!enabled && mode === 'marketstack') throw unavailable();
      const rows = await db.update(marketBindings).set({ mode }).where(and(eq(marketBindings.ownerId, ownerId), eq(marketBindings.instrumentId, instrumentId))).returning();
      if (!rows.length) throw missing();
      return state(ownerId, instrumentId);
    }); },
    refresh(ownerId: string, instrumentId: string) { return serial(() => refreshLocked(ownerId, instrumentId)); },
    daily() { return serial(async () => {
      if (!enabled) return;
      // Only explicit automatic mappings with an open ledger quantity; no watchlist/full catalog fetches.
      const rows = await db.select().from(marketBindings).where(and(eq(marketBindings.mode, 'marketstack'), sql`EXISTS (
        SELECT 1 FROM ${cashOperations} c WHERE c.instrument_id = ${marketBindings.instrumentId} AND c.owner_id = ${marketBindings.ownerId}
        AND c.occurred_at <= now() GROUP BY c.instrument_id HAVING SUM(CASE WHEN c.kind = 'BUY' THEN c.quantity WHEN c.kind = 'SELL' THEN -c.quantity ELSE 0 END) > 0
      )`));
      for (const row of rows) await refreshLocked(row.ownerId, row.instrumentId);
    }); },
  };
}
export type MarketDataService = ReturnType<typeof marketDataService>;
