import { createAuthClient } from 'better-auth/react';
import { portfoliosSchema, portfolioSchema, apiErrorSchema, cashSummarySchema, cashHistorySchema, cashOperationSchema } from '@investorkit/shared';
import type { CreatePortfolio, CashOperationInput } from '@investorkit/shared';
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
