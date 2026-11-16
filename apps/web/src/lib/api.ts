import { createAuthClient } from 'better-auth/react';
import { portfoliosSchema, portfolioSchema, apiErrorSchema, cashSummarySchema, cashHistorySchema, cashOperationSchema, instrumentsSchema, instrumentSchema, quoteSchema, quotesSchema, fxSchema, operationSchema, operationHistorySchema, valuationSchema, simulationSchema } from '@investorkit/shared';
import type { CreatePortfolio, CashOperationInput, CreateInstrument, QuoteInput, FxInput, TradeOperation, SimulationInput } from '@investorkit/shared';
export const auth = createAuthClient();
async function request(path: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include', ...options });
  const data: unknown = await response.json();
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    throw new Error(parsed.success ? parsed.data.error.message : 'Nie można pobrać danych. Spróbuj ponownie.');
  }
  return data;
}
export async function listPortfolios() { return portfoliosSchema.parse(await request('/portfolios')).items; }
export async function createPortfolio(input: CreatePortfolio) {
  return portfolioSchema.parse(await request('/portfolios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
}

export async function loadCash(id: string) { return cashSummarySchema.parse(await request(`/portfolios/${id}/cash`)); }
export async function loadCashHistory(id: string) { return cashHistorySchema.parse(await request(`/portfolios/${id}/cash-operations`)); }
export async function saveCash(input: { portfolioId: string; operation: CashOperationInput; key: string }) {
  return cashOperationSchema.parse(await request(`/portfolios/${input.portfolioId}/cash-operations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.key }, body: JSON.stringify(input.operation),
  }));
}

export async function listInstruments() { return instrumentsSchema.parse(await request('/instruments')).items; }
export async function addInstrument(input: CreateInstrument) { return instrumentSchema.parse(await request('/instruments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })); }
export async function addQuote(id: string, input: QuoteInput) { return quoteSchema.parse(await request(`/instruments/${id}/quotes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })); }
export async function addFx(input: FxInput) { return fxSchema.parse(await request('/fx-rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })); }
export async function addTrade(id: string, input: TradeOperation, key: string) { return operationSchema.parse(await request(`/portfolios/${id}/operations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(input) })); }
export async function loadValuation(id: string) { return valuationSchema.parse(await request(`/portfolios/${id}/valuation`)); }
export async function loadOperations(id: string) { return operationHistorySchema.parse(await request(`/portfolios/${id}/operations`)); }

export async function simulatePurchase(id: string, input: SimulationInput) {
  return simulationSchema.parse(await request(`/portfolios/${id}/simulations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
}

export async function loadQuotes(id: string) { return quotesSchema.parse(await request(`/instruments/${id}/quotes`)).items; }
