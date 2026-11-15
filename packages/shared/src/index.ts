import { z } from 'zod';
export const currencySchema = z.enum(['PLN', 'EUR', 'USD']);
// Accept canonical decimal strings only; never coerce JS numbers.
export const decimalSchema = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,10})?$/);
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
