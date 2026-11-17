import { z } from 'zod';
export const currencySchema = z.enum(['PLN', 'EUR', 'USD']);
// Accept canonical decimal strings only; never coerce JS numbers.
// The final lookahead enforces true EOF: JavaScript $ alone permits a final newline.
export const decimalSchema = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,10})?$(?![\s\S])/);
export const createPortfolioSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseCurrency: z.literal('PLN').default('PLN'),
}).strict();
export const portfolioSchema = z.object({
  id: z.uuid(), name: z.string(), baseCurrency: z.literal('PLN'), createdAt: z.iso.datetime(),
});
export const portfolioIdParamsSchema = z.object({ id: z.uuid() });
export const healthSchema = z.object({ status: z.literal('ok') });
export const unavailableSchema = z.object({ status: z.literal('unavailable') });
export const portfoliosSchema = z.object({ items: z.array(portfolioSchema) });
export type Portfolio = z.infer<typeof portfolioSchema>;
export type CreatePortfolio = z.infer<typeof createPortfolioSchema>;
export const apiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }) });
export interface ImportAdapter {
  readonly id: string;
  readonly version: string;
  readonly available: boolean;
  readonly blockedReason?: 'SAMPLE_REQUIRED';
}
export const xtbAdapter: ImportAdapter = {
  id: 'xtb-verified', version: '0', available: false, blockedReason: 'SAMPLE_REQUIRED',
};

// Pure position-calculation inputs; these do not register ledger API endpoints.
export const positionInstrumentSchema = z.object({
  instrumentId: z.uuid(), currency: currencySchema, quantityScale: z.number().int().min(0).max(10),
}).strict();
export const positionTradeSchema = z.object({
  kind: z.enum(['BUY', 'SELL']), instrumentId: z.uuid(), currency: currencySchema,
  quantity: decimalSchema, unitPrice: decimalSchema, commission: decimalSchema,
  commissionCurrency: currencySchema,
}).strict();
export type PositionInstrument = z.infer<typeof positionInstrumentSchema>;
export type PositionTrade = z.infer<typeof positionTradeSchema>;

export type Currency = z.infer<typeof currencySchema>;
export const fxRateSchema = z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,12})?$(?![\s\S])/);
const historicalFxShape = {
  fxToBase: fxRateSchema, fxAsOf: z.iso.datetime(), fxSource: z.literal('manual'), occurredAt: z.iso.datetime(),
};
export const cashOperationInputSchema = z.object({
  kind: z.enum(['DEPOSIT', 'WITHDRAWAL']), currency: currencySchema, amount: decimalSchema,
  ...historicalFxShape, note: z.string().max(300).default(''),
}).strict();
export const ledgerTradeSchema = positionTradeSchema.extend({ ...historicalFxShape, note: z.string().max(300).default('') });
export const ledgerOperationSchema = z.discriminatedUnion('kind', [cashOperationInputSchema, ledgerTradeSchema]);
export type CashOperationInput = z.infer<typeof cashOperationInputSchema>;
export const cashOperationSchema = cashOperationInputSchema.extend({ id: z.uuid(), createdAt: z.iso.datetime() });
export const cashHistorySchema = z.object({ items: z.array(cashOperationSchema), limit: z.literal(1000) });
const signedDecimalSchema = z.string().regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,10})?$(?![\s\S])/);
export const cashSummarySchema = z.object({
  balances: z.array(z.object({ currency: currencySchema, amount: decimalSchema })),
  netContributionsBase: signedDecimalSchema, baseCurrency: z.literal('PLN'), operationCount: z.number().int().nonnegative(),
});

export const createInstrumentSchema = z.object({
  type: z.enum(['STOCK', 'ETF']), symbol: z.string().trim().min(1).max(24).regex(/^[A-Z0-9._-]+$/),
  mic: z.string().regex(/^[A-Z0-9]{4}$/), name: z.string().trim().min(1).max(120), currency: currencySchema,
  quantityScale: z.number().int().min(0).max(10), isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/).nullable().default(null),
  issuerCountry: z.string().regex(/^[A-Z]{2}$/).nullable().default(null),
}).strict();
export const instrumentSchema = createInstrumentSchema.extend({ id: z.uuid(), createdAt: z.iso.datetime() });
export const instrumentsSchema = z.object({ items: z.array(instrumentSchema) });
export type CreateInstrument = z.infer<typeof createInstrumentSchema>;
export type Instrument = z.infer<typeof instrumentSchema>;
export const quoteInputSchema = z.object({ price: decimalSchema, currency: currencySchema, asOf: z.iso.datetime(), source: z.literal('manual') }).strict();
export const quoteSchema = quoteInputSchema.extend({ id: z.uuid(), instrumentId: z.uuid(), createdAt: z.iso.datetime() });
export const quotesSchema = z.object({ items: z.array(quoteSchema) });
export const fxInputSchema = z.object({ currency: currencySchema, baseCurrency: z.literal('PLN'), rate: fxRateSchema, asOf: z.iso.datetime(), source: z.literal('manual') }).strict();
export const fxSchema = fxInputSchema.extend({ id: z.uuid(), createdAt: z.iso.datetime() });
export const operationSchema = z.discriminatedUnion('kind', [cashOperationSchema, ledgerTradeSchema.extend({ id: z.uuid(), createdAt: z.iso.datetime() })]);
export const operationHistorySchema = z.object({ items: z.array(operationSchema), limit: z.literal(1000) });
export type LedgerOperation = z.infer<typeof ledgerOperationSchema>;
export const valuationQuerySchema = z.object({ asOf: z.iso.datetime().optional() }).strict();
export const valuationTimeSchema = z.iso.datetime();
const computedDecimalSchema = z.string().regex(/^-?(0|[1-9]\d*)(\.\d+)?$(?![\s\S])/);
export const valuationIssueSchema = z.enum(['MISSING_QUOTE', 'STALE_QUOTE', 'FUTURE_QUOTE', 'MISSING_FX', 'STALE_FX', 'FUTURE_FX']);
export const valuationQuoteSchema = quoteInputSchema.extend({ source: z.enum(['manual', 'scenario']) });
const quoteUsedSchema = valuationQuoteSchema.omit({ currency: true });
const fxUsedSchema = z.object({ rate: fxRateSchema, asOf: z.iso.datetime().nullable(), source: z.enum(['manual', 'identity']) });
export const valuationSchema = z.object({
  asOf: z.iso.datetime(), engineVersion: z.string(), complete: z.boolean(), baseCurrency: z.literal('PLN'),
  totalValue: signedDecimalSchema.nullable(), pricedSubtotal: signedDecimalSchema, netContributionsBase: signedDecimalSchema,
  pnl: signedDecimalSchema.nullable(), pnlPct: computedDecimalSchema.nullable(),
  pnlPctReason: z.enum(['INCOMPLETE_VALUATION', 'NON_POSITIVE_BASE']).nullable(), realizedBase: signedDecimalSchema,
  quoteMaxAgeHours: z.number(), fxMaxAgeHours: z.number(), valuationRange: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }).nullable(),
  positions: z.array(z.object({
    instrumentId: z.uuid(), name: z.string(), symbol: z.string(), currency: currencySchema, quantity: computedDecimalSchema,
    remainingCostBase: signedDecimalSchema, averageCostLocal: computedDecimalSchema.nullable(),
    valueBase: signedDecimalSchema.nullable(), unrealizedBase: signedDecimalSchema.nullable(), unrealizedPct: computedDecimalSchema.nullable(),
    weightPct: computedDecimalSchema.nullable(), quote: quoteUsedSchema.nullable(), fx: fxUsedSchema.nullable(), issues: z.array(valuationIssueSchema),
  })),
  cash: z.array(z.object({ currency: currencySchema, amount: decimalSchema, valueBase: signedDecimalSchema.nullable(), fx: fxUsedSchema.nullable(), issues: z.array(valuationIssueSchema) })),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type FxInput = z.infer<typeof fxInputSchema>;
export type TradeOperation = z.infer<typeof ledgerTradeSchema>;
export type Valuation = z.infer<typeof valuationSchema>;

export const simulationInputSchema = z.object({
  instrumentId: z.uuid(), budget: decimalSchema, unitPrice: decimalSchema, commission: decimalSchema,
  funding: z.enum(['NEW_MONEY', 'EXISTING_CASH']),
}).strict();
export const simulationSchema = z.object({
  assumptions: simulationInputSchema.extend({
    currency: currencySchema, quantityScale: z.number().int().min(0).max(10),
    reference: quoteUsedSchema.nullable(), fx: fxUsedSchema,
  }),
  quantity: decimalSchema, actualCost: computedDecimalSchema, budgetRemaining: computedDecimalSchema,
  remainingCash: computedDecimalSchema, before: valuationSchema, after: valuationSchema,
  delta: z.object({ totalValue: signedDecimalSchema.nullable(), positionValue: signedDecimalSchema.nullable() }),
  impact: z.object({ newMoneyBase: decimalSchema, commissionBase: decimalSchema, priceDifferenceBase: signedDecimalSchema.nullable(), netEffectBase: signedDecimalSchema.nullable(), netEffectPct: computedDecimalSchema.nullable() }),
});
export type SimulationInput = z.infer<typeof simulationInputSchema>;
export type Simulation = z.infer<typeof simulationSchema>;

export const percentageSchema = z.string().regex(/^(?:(?:0|[1-9]\d?)(?:\.\d{1,10})?|100(?:\.0{1,10})?)$(?![\s\S])/);
export const riskSettingsInputSchema = z.object({
  maxPositionPct: percentageSchema, top3Pct: percentageSchema, top5Pct: percentageSchema,
  quoteMaxAgeHours: z.number().int().min(1).max(8760), fxMaxAgeHours: z.number().int().min(1).max(8760),
}).strict();
export const riskSettingsSchema = riskSettingsInputSchema.extend({ revision: z.number().int().min(0).max(2147483647) });
export const DEFAULT_RISK_SETTINGS = Object.freeze({ maxPositionPct: '25', top3Pct: '60', top5Pct: '80', quoteMaxAgeHours: 72, fxMaxAgeHours: 72 });
export const riskInstrumentSchema = z.object({ instrumentId: z.uuid(), type: z.enum(['STOCK', 'ETF']), issuerCountry: z.string().regex(/^[A-Z]{2}$/).nullable() }).strict();
const allocationSchema = z.object({ key: z.string(), valueBase: signedDecimalSchema.nullable(), weightPct: computedDecimalSchema.nullable() });
export const riskSchema = z.object({
  valuation: valuationSchema, settings: riskSettingsSchema,
  concentration: z.object({
    largestPositionPct: computedDecimalSchema.nullable(), top3Pct: computedDecimalSchema.nullable(), top5Pct: computedDecimalSchema.nullable(),
    maxPositionExceeded: z.boolean().nullable(), top3Exceeded: z.boolean().nullable(), top5Exceeded: z.boolean().nullable(),
    positions: z.array(z.object({ instrumentId: z.uuid(), weightPct: computedDecimalSchema.nullable(), exceedsLimit: z.boolean().nullable() })),
    reason: z.enum(['INCOMPLETE_VALUATION', 'NON_POSITIVE_BASE']).nullable(),
  }),
  allocations: z.object({ assetType: z.array(allocationSchema), currency: z.array(allocationSchema), issuerCountry: z.array(allocationSchema) }),
});
export const stressInputSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('SECURITIES'), dropPct: percentageSchema }).strict(),
  z.object({ scope: z.literal('INSTRUMENT'), instrumentId: z.uuid(), dropPct: percentageSchema }).strict(),
]);
export const stressSchema = z.object({
  before: valuationSchema,
  after: z.object({ totalValue: signedDecimalSchema.nullable(), cash: valuationSchema.shape.cash,
    positions: z.array(z.object({ instrumentId: z.uuid(), name: z.string(), symbol: z.string(), currency: currencySchema,
      valueBase: signedDecimalSchema.nullable(), weightPct: computedDecimalSchema.nullable(),
      referencePrice: computedDecimalSchema.nullable(), scenarioPrice: computedDecimalSchema.nullable(),
    })),
  }),
  lossBase: signedDecimalSchema.nullable(), lossPct: computedDecimalSchema.nullable(),
  reason: z.enum(['INCOMPLETE_VALUATION', 'NON_POSITIVE_BASE']).nullable(),
  assumptions: z.object({ scope: z.enum(['INSTRUMENT', 'SECURITIES']), instrumentId: z.uuid().nullable(), dropPct: percentageSchema,
    fxConstant: z.literal(true), cashUnaffected: z.literal(true), quoteMaxAgeHours: z.number(), fxMaxAgeHours: z.number(),
  }),
});
export type RiskSettingsInput = z.infer<typeof riskSettingsInputSchema>;
export type RiskSettings = z.infer<typeof riskSettingsSchema>;
export type Risk = z.infer<typeof riskSchema>;
export type StressInput = z.infer<typeof stressInputSchema>;
export type Stress = z.infer<typeof stressSchema>;

export const journalInputSchema = z.object({
  instrumentId: z.uuid().nullable().default(null), decidedAt: z.iso.datetime(),
  reason: z.string().trim().min(1).max(500), horizon: z.string().trim().max(500).default(''),
  thesis: z.string().trim().min(1).max(5000), risks: z.string().trim().max(3000).default(''),
  reviewConditions: z.string().trim().max(3000).default(''), notes: z.string().trim().max(10000).default(''),
}).strict();
export const journalEntrySchema = journalInputSchema.extend({
  id: z.uuid(), portfolioId: z.uuid(), revision: z.number().int().min(1).max(2147483647),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const journalListSchema = z.object({ items: z.array(journalEntrySchema), limit: z.literal(100) });
export const journalDeletedSchema = z.object({ id: z.uuid(), deleted: z.literal(true) });
export type JournalInput = z.infer<typeof journalInputSchema>;
export type JournalEntry = z.infer<typeof journalEntrySchema>;

export const snapshotInputSchema = z.object({}).strict();
export const snapshotSummarySchema = z.object({
  id: z.uuid(), portfolioId: z.uuid(), asOf: z.iso.datetime(), createdAt: z.iso.datetime(),
  complete: z.boolean(), valueBase: signedDecimalSchema.nullable(), pricedSubtotal: signedDecimalSchema,
  netContributionsBase: signedDecimalSchema, pnl: signedDecimalSchema.nullable(), pnlPct: computedDecimalSchema.nullable(),
  pnlPctReason: valuationSchema.shape.pnlPctReason, engineVersion: z.string(),
  quoteMaxAgeHours: z.number(), fxMaxAgeHours: z.number(), valuationRange: valuationSchema.shape.valuationRange,
});
export const snapshotSchema = snapshotSummarySchema.extend({ valuation: valuationSchema, inputsHash: z.string().regex(/^[0-9a-f]{64}$/) });
export const portfolioHistoryQuerySchema = z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() }).strict();
export const portfolioHistorySchema = z.object({
  items: z.array(snapshotSummarySchema), limit: z.literal(366), from: z.iso.datetime(), to: z.iso.datetime(),
  missingDays: z.array(z.iso.date()), dayTimeZone: z.literal('Europe/Warsaw'),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type SnapshotSummary = z.infer<typeof snapshotSummarySchema>;
export type PortfolioHistoryQuery = z.infer<typeof portfolioHistoryQuerySchema>;
