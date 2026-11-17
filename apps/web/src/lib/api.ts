import { createAuthClient } from 'better-auth/react';
import { snapshotSchema, portfolioHistorySchema, journalListSchema, journalEntrySchema, journalDeletedSchema, portfoliosSchema, portfolioSchema, apiErrorSchema, cashSummarySchema, cashHistorySchema, cashOperationSchema, instrumentsSchema, instrumentSchema, quoteSchema, quotesSchema, fxSchema, operationSchema, operationHistorySchema, valuationSchema, simulationSchema, riskSchema, riskSettingsSchema, stressSchema } from '@investorkit/shared';
import type { PortfolioHistoryQuery, JournalInput, CreatePortfolio, CashOperationInput, CreateInstrument, QuoteInput, FxInput, TradeOperation, SimulationInput, RiskSettingsInput, StressInput } from '@investorkit/shared';
export const auth = createAuthClient();
export class ApiRequestError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); }
}
async function request(path: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include', ...options });
  const data: unknown = await response.json();
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    throw new ApiRequestError(parsed.success ? parsed.data.error.message : 'Nie można pobrać danych. Spróbuj ponownie.', parsed.success ? parsed.data.error.code : 'REQUEST_FAILED', response.status);
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

export async function loadRisk(id: string) { return riskSchema.parse(await request(`/portfolios/${id}/risk`)); }
export async function saveRiskSettings(id: string, settings: RiskSettingsInput, revision: number) {
  return riskSettingsSchema.parse(await request(`/portfolios/${id}/risk-settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `"${revision}"` }, body: JSON.stringify(settings) }));
}
export async function runStress(id: string, input: StressInput) {
  return stressSchema.parse(await request(`/portfolios/${id}/stress-tests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
}

export async function loadJournal(id: string) { return journalListSchema.parse(await request(`/portfolios/${id}/journal`)); }
export async function saveJournal(portfolioId: string, input: JournalInput, existing?: { id: string; revision: number }) {
  return journalEntrySchema.parse(await request(existing ? `/journal/${existing.id}` : `/portfolios/${portfolioId}/journal`, {
    method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', ...(existing ? { 'If-Match': `"${existing.revision}"` } : {}) }, body: JSON.stringify(input),
  }));
}
export async function deleteJournal(id: string, revision: number) {
  return journalDeletedSchema.parse(await request(`/journal/${id}`, { method: 'DELETE', headers: { 'If-Match': `"${revision}"` } }));
}

export async function loadPortfolioHistory(id: string, days: number, range?: PortfolioHistoryQuery) {
  const from = range?.from ?? new Date(Date.now() - days * 86400000).toISOString();
  // Let the server choose the range end; client clock skew must not request future history.
  return portfolioHistorySchema.parse(await request(`/portfolios/${id}/history?${new URLSearchParams({ from, ...(range?.to ? { to: range.to } : {}) })}`));
}
export async function captureValuation(id: string) {
  return snapshotSchema.parse(await request(`/portfolios/${id}/snapshots`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
}
export async function loadValuationSnapshot(id: string) { return snapshotSchema.parse(await request(`/valuation-snapshots/${id}`)); }
