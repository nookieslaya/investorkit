import { createAuthClient } from 'better-auth/react';
import { portfoliosSchema, portfolioSchema, apiErrorSchema } from '@investorkit/shared';
import type { CreatePortfolio } from '@investorkit/shared';
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
