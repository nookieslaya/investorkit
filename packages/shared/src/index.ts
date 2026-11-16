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
