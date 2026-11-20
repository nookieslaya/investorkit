import { z } from 'zod';
import { currencySchema, decimalSchema } from '@investorkit/shared';
export class MarketDataError extends Error {
  constructor(readonly code: string) { super('Nie udało się pobrać danych rynkowych.'); }
}
const symbol = z.string().min(1).max(64).regex(/^[A-Za-z0-9.^:_/-]+$/);
const mic = z.string().regex(/^[A-Z0-9]{4}$/);
const date = z.string().transform(s => s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).pipe(z.iso.datetime({ offset: true }));
const catalog = z.object({ pagination: z.object({ total: z.number().int().nonnegative() }), data: z.array(z.object({
  ticker: symbol, name: z.string().max(200), has_eod: z.boolean(), stock_exchange: z.object({ mic, name: z.string() }),
})).max(10) });
const bars = z.object({ data: z.array(z.object({ symbol, exchange: mic, price_currency: currencySchema,
  close: decimalSchema, date,
})).max(1) });
export type Listing = { symbol: string; name: string; mic: string };
export type EodPrice = { price: string; currency: z.infer<typeof currencySchema>; asOf: string; sessionDate: string; fetchedAt: string };
export interface MarketDataProvider {
  search(query: string, exchange: string): Promise<{ items: Listing[]; partial: boolean }>;
  latest(listing: Listing): Promise<EodPrice>;
}
/** Node24 preserves the JSON number lexeme; never convert prices through binary Number. */
export function parseMarketJson(body: string): unknown {
  return JSON.parse(body, (key: string, value: unknown, context?: { source?: string }) => {
    if (key === 'close' && typeof value === 'number') {
      if (!context?.source) throw new MarketDataError('INVALID_RESPONSE');
      return context.source;
    }
    return value;
  });
}
export function marketstackProvider(key: string, reserve: () => Promise<void>,
  block: (code: string) => Promise<void>, transport: typeof fetch = fetch): MarketDataProvider {
  async function request<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      await reserve(); // Committed separately, including failures and retry attempts.
      const url = new URL(`https://api.marketstack.com/v2/${path}`);
      url.search = new URLSearchParams({ ...params, access_key: key }).toString();
      try {
        const response = await transport(url, { redirect: 'error', signal: AbortSignal.timeout(4000) });
        const body = await response.text();
        if (body.includes(key)) throw new MarketDataError('INVALID_RESPONSE');
        if (response.status === 401 || response.status === 429) {
          const code = response.status === 401 ? 'AUTH_ERROR' : 'QUOTA_ERROR';
          await block(code); throw new MarketDataError(code);
        }
        if (response.status === 403) throw new MarketDataError('ACCESS_DENIED');
        if (!response.ok) throw new MarketDataError(response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR');
        let raw: unknown;
        try { raw = parseMarketJson(body); } catch { throw new MarketDataError('INVALID_RESPONSE'); }
        const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(raw);
        if (error.success) {
          const code = ['invalid_access_key', 'inactive_user'].includes(error.data.error.code) ? 'AUTH_ERROR'
            : ['usage_limit_reached', 'rate_limit_reached'].includes(error.data.error.code) ? 'QUOTA_ERROR' : 'ACCESS_DENIED';
          if (code !== 'ACCESS_DENIED') await block(code);
          throw new MarketDataError(code);
        }
        const result = schema.safeParse(raw);
        if (!result.success) throw new MarketDataError('INVALID_RESPONSE');
        return result.data;
      } catch (error) {
        const safe = error instanceof MarketDataError ? error : new MarketDataError('NETWORK_ERROR');
        if (attempt === 0 && ['NETWORK_ERROR', 'PROVIDER_UNAVAILABLE'].includes(safe.code)) continue;
        throw safe;
      }
    }
    throw new MarketDataError('PROVIDER_UNAVAILABLE');
  }
  return {
    async search(query, exchange) {
      const result = await request('tickerslist', { search: query, exchange, limit: '10', offset: '0' }, catalog);
      const items = result.data.filter(row => row.has_eod && row.name.trim() && row.stock_exchange.mic === exchange)
        .map(row => ({ symbol: row.ticker, name: row.name, mic: row.stock_exchange.mic }));
      return { items: items.slice(0, 3), partial: result.pagination.total > items.slice(0, 3).length };
    },
    async latest(listing) {
      symbol.parse(listing.symbol); mic.parse(listing.mic);
      const result = await request('eod/latest', { symbols: listing.symbol, exchange: listing.mic, limit: '1', offset: '0' }, bars);
      const bar = result.data[0];
      if (!bar) throw new MarketDataError('NO_EOD');
      if (bar.symbol !== listing.symbol || bar.exchange !== listing.mic || Date.parse(bar.date) > Date.now()) throw new MarketDataError('INVALID_RESPONSE');
      return { price: bar.close, currency: bar.price_currency, asOf: new Date(bar.date).toISOString(),
        sessionDate: bar.date.slice(0, 10), fetchedAt: new Date().toISOString() };
    },
  };
}
