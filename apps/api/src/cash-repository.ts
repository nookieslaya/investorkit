import { createHash } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { cashOperations, portfolios, instruments, manualQuotes, fxRates } from '@investorkit/db';
import type { Database } from '@investorkit/db';
import { cashOperationSchema, ledgerOperationSchema, operationSchema, valuationSchema, simulationSchema, riskSchema, stressSchema } from '@investorkit/shared';
import type { CashOperationInput, LedgerOperation, SimulationInput, StressInput } from '@investorkit/shared';
import { FinancialDecimal, replayLedger, valuePortfolio, simulatePurchase, analyzeRisk, stressPortfolio } from '@investorkit/portfolio-engine';
import { quoteDto, fxDto } from './market-repository.js';
import { readRiskSettings } from './risk-settings-repository.js';
import { CashApiError } from './domain-error.js';
export { CashApiError } from './domain-error.js';
type Row = typeof cashOperations.$inferSelect;
type ReadDb = Pick<Database, 'select'>;
export function operationInput(row: Row): LedgerOperation {
  const common = { kind: row.kind, currency: row.currency, fxToBase: row.fxToBase, fxAsOf: row.fxAsOf.toISOString(), occurredAt: row.occurredAt.toISOString(), fxSource: row.fxSource, note: row.note };
  return ledgerOperationSchema.parse(row.kind === 'DEPOSIT' || row.kind === 'WITHDRAWAL' ? { ...common, amount: row.amount }
    : { ...common, instrumentId: row.instrumentId, quantity: row.quantity, unitPrice: row.unitPrice, commission: row.commission, commissionCurrency: row.commissionCurrency });
}
function operationDto(row: Row) { return operationSchema.parse({ ...operationInput(row), id: row.id, createdAt: row.createdAt.toISOString() }); }
const scope = (ownerId: string, portfolioId: string) => and(eq(cashOperations.ownerId, ownerId), eq(cashOperations.portfolioId, portfolioId));
const missing = () => new CashApiError(404, 'NOT_FOUND', 'Nie znaleziono zasobu.');
const engineInstruments = (rows: (typeof instruments.$inferSelect)[]) => rows.map(row => ({ instrumentId: row.id, currency: row.currency, quantityScale: row.quantityScale }));
async function ownedLedgerRows(executor: ReadDb, ownerId: string, id: string) {
  const [portfolio] = await executor.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.ownerId, ownerId)));
  if (!portfolio) throw missing();
  return executor.select().from(cashOperations).where(scope(ownerId, id)).orderBy(asc(cashOperations.occurredAt), asc(cashOperations.sequence));
}
export async function readMarketSnapshot(executor: ReadDb, ownerId: string, id: string, asOf: string) {
  const rows = await ownedLedgerRows(executor, ownerId, id);
  const metadata = await executor.select().from(instruments).where(eq(instruments.ownerId, ownerId)).orderBy(asc(instruments.createdAt), asc(instruments.id));
  const quotes = await executor.select().from(manualQuotes).where(eq(manualQuotes.ownerId, ownerId)).orderBy(asc(manualQuotes.sequence));
  const rates = await executor.select().from(fxRates).where(eq(fxRates.ownerId, ownerId)).orderBy(asc(fxRates.sequence));
  const settings = await readRiskSettings(executor, ownerId, id);
  const hydrate = (result: ReturnType<typeof valuePortfolio>) => valuationSchema.parse({ ...result, positions: result.positions.map(position => {
    const instrument = metadata.find(row => row.id === position.instrumentId);
    if (!instrument) throw new Error('Missing position metadata');
    return { ...position, name: instrument.name, symbol: instrument.symbol };
  }) });
  return { metadata, hydrate, settings, context: { quoteMaxAgeHours: settings.quoteMaxAgeHours, fxMaxAgeHours: settings.fxMaxAgeHours, instruments: engineInstruments(metadata), operations: rows.map(operationInput), quotes: quotes.map(quoteDto), fxRates: rates.map(fxDto), asOf } };
}

export function cashRepository(db: Database) {
  async function createOperation(ownerId: string, portfolioId: string, input: LedgerOperation, key: string) {
    const common = { ...input, fxToBase: FinancialDecimal.parseFxRate(input.fxToBase).toString(), occurredAt: new Date(input.occurredAt).toISOString(), fxAsOf: new Date(input.fxAsOf).toISOString() };
    // Preserve the P03 canonical cash hash field order to retain existing retry keys.
    const normalized = 'amount' in input ? { ...common, amount: FinancialDecimal.parse(input.amount).toString() }
      : { ...common, instrumentId: input.instrumentId.toLowerCase(), quantity: FinancialDecimal.parse(input.quantity).toString(), unitPrice: FinancialDecimal.parse(input.unitPrice).toString(), commission: FinancialDecimal.parse(input.commission).toString() };
    const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    return db.transaction(async tx => {
      const [portfolio] = await tx.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, portfolioId), eq(portfolios.ownerId, ownerId))).for('update');
      if (!portfolio) throw missing();
      const rows = await tx.select().from(cashOperations).where(scope(ownerId, portfolioId)).orderBy(asc(cashOperations.occurredAt), asc(cashOperations.sequence));
      const existing = rows.find(row => row.idempotencyKey === key);
      if (existing) {
        if (existing.requestHash !== hash) throw new CashApiError(409, 'IDEMPOTENCY_CONFLICT', 'Ten klucz został już użyty z innymi danymi.');
        return operationDto(existing);
      }
      if (rows.length >= 1000) throw new CashApiError(422, 'OPERATION_LIMIT', 'Osiągnięto limit 1000 operacji w tej wersji.');
      const metadata = await tx.select().from(instruments).where(eq(instruments.ownerId, ownerId)).orderBy(asc(instruments.createdAt), asc(instruments.id));
      if (!('amount' in input) && !metadata.some(instrument => instrument.id === input.instrumentId.toLowerCase())) throw missing();
      replayLedger({ instruments: engineInstruments(metadata), operations: [...rows.map(operationInput), normalized], asOf: new Date().toISOString() });
      const fields = 'amount' in normalized ? { amount: normalized.amount } : {
        amount: null, instrumentId: normalized.instrumentId, quantity: normalized.quantity, unitPrice: normalized.unitPrice, commission: normalized.commission, commissionCurrency: normalized.commissionCurrency,
      };
      const [row] = await tx.insert(cashOperations).values({ ...fields, kind: input.kind, currency: input.currency, note: input.note,
        fxToBase: normalized.fxToBase, fxSource: input.fxSource, ownerId, portfolioId, occurredAt: new Date(normalized.occurredAt), fxAsOf: new Date(normalized.fxAsOf), idempotencyKey: key, requestHash: hash }).returning();
      if (!row) throw new Error('Operation insert returned no row');
      return operationDto(row);
    });
  }
  return {
    createOperation,
    async createCashOperation(ownerId: string, id: string, input: CashOperationInput, key: string) { return cashOperationSchema.parse(await createOperation(ownerId, id, input, key)); },
    async cashSummary(ownerId: string, id: string) {
      return db.transaction(async tx => {
        const rows = await ownedLedgerRows(tx, ownerId, id);
        const metadata = await tx.select().from(instruments).where(eq(instruments.ownerId, ownerId)).orderBy(asc(instruments.createdAt), asc(instruments.id));
        const { positions: _positions, ...cash } = replayLedger({ instruments: engineInstruments(metadata), operations: rows.map(operationInput), asOf: new Date().toISOString() });
        return cash;
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    },
    async cashHistory(ownerId: string, id: string) {
      return { items: (await ownedLedgerRows(db, ownerId, id)).filter(row => row.kind === 'DEPOSIT' || row.kind === 'WITHDRAWAL').reverse().map(row => cashOperationSchema.parse(operationDto(row))), limit: 1000 as const };
    },
    async operationHistory(ownerId: string, id: string) { return { items: (await ownedLedgerRows(db, ownerId, id)).reverse().map(operationDto), limit: 1000 as const }; },
    async simulate(ownerId: string, id: string, input: SimulationInput) {
      return db.transaction(async tx => {
        const snapshot = await readMarketSnapshot(tx, ownerId, id, new Date().toISOString());
        const instrumentId = input.instrumentId.toLowerCase();
        if (!snapshot.metadata.some(row => row.id === instrumentId)) throw missing();
        const result = simulatePurchase(snapshot.context, { ...input, instrumentId });
        return simulationSchema.parse({ ...result, before: snapshot.hydrate(result.before), after: snapshot.hydrate(result.after) });
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    },
    async risk(ownerId: string, id: string) {
      return db.transaction(async tx => {
        const snapshot = await readMarketSnapshot(tx, ownerId, id, new Date().toISOString());
        const { revision: _revision, ...settings } = snapshot.settings;
        const result = analyzeRisk(snapshot.context, snapshot.metadata.map(row => ({ instrumentId: row.id, type: row.type, issuerCountry: row.issuerCountry })), settings);
        return riskSchema.parse({ ...result, settings: snapshot.settings, valuation: snapshot.hydrate(result.valuation) });
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    },
    async stress(ownerId: string, id: string, input: StressInput) {
      return db.transaction(async tx => {
        const snapshot = await readMarketSnapshot(tx, ownerId, id, new Date().toISOString());
        const normalized = input.scope === 'INSTRUMENT' ? { ...input, instrumentId: input.instrumentId.toLowerCase() } : input;
        if (normalized.scope === 'INSTRUMENT' && !snapshot.metadata.some(row => row.id === normalized.instrumentId)) throw missing();
        const result = stressPortfolio(snapshot.context, normalized);
        return stressSchema.parse({ ...result, before: snapshot.hydrate(result.before), after: { ...result.after, positions: result.after.positions.map(position => {
          const instrument = snapshot.metadata.find(row => row.id === position.instrumentId)!;
          return { ...position, name: instrument.name, symbol: instrument.symbol };
        }) } });
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    },
    async valuation(ownerId: string, id: string, asOf: string) {
      if (Date.parse(asOf) > Date.now()) throw new CashApiError(422, 'FUTURE_VALUATION', 'Data wyceny nie może być przyszła.');
      return db.transaction(async tx => {
        const snapshot = await readMarketSnapshot(tx, ownerId, id, asOf);
        return snapshot.hydrate(valuePortfolio(snapshot.context));
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    },
  };
}
