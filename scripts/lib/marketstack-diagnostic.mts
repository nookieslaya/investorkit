import { z } from 'zod';

const text = z.string().min(1).max(200);
const exchange = z.object({ mic: z.string().regex(/^[A-Z0-9]{4}$/), name: text });
const ticker = z.object({
  ticker: z.string().min(1).max(64).regex(/^[A-Za-z0-9.^:_/-]+$/), name: z.string().max(200), has_eod: z.boolean(), stock_exchange: exchange,
});
const catalog = z.object({
  pagination: z.object({ total: z.number().int().nonnegative(), count: z.number().int().nonnegative() }),
  data: z.array(ticker).max(10),
});
// Marketstack returns offsets such as +0000; normalize only the timestamp syntax.
const marketDate = z.string().transform(value => value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  .pipe(z.iso.datetime({ offset: true }));
const eod = z.object({ data: z.array(z.object({
  symbol: text, exchange: z.string().regex(/^[A-Z0-9]{4}$/),
  price_currency: z.string().regex(/^[A-Z]{3}$/),
  close: z.number().finite().nonnegative(), date: marketDate,
})).max(1) });
const providerError = z.object({ error: z.object({ code: z.union([z.string(), z.number()]) }) });
export type DiagnosticStatus = 'ok' | 'missing_key' | 'empty' | 'plan_denied' | 'forbidden' |
  'auth_error' | 'quota_error' | 'not_found' | 'provider_error' | 'invalid_response' |
  'network_error' | 'budget_exhausted';
export type DiagnosticResult<T> = { status: DiagnosticStatus; httpStatus?: number; validationIssues?: string[]; data?: T };

/** Local diagnostics only. No DB, API routes, retries, redirects or financial calculations. */
export class MarketstackDiagnostic {
  private consumed = 0;
  get used() { return this.consumed; }
  private stopped: DiagnosticStatus | undefined;
  constructor(private readonly key: string | undefined, readonly budget = 10,
    private readonly transport: typeof fetch = fetch) {
    if (!Number.isInteger(budget) || budget < 1 || budget > 10) throw new Error('Budget must be 1–10');
  }
  private async request<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<DiagnosticResult<T>> {
    if (!this.key?.trim()) return { status: 'missing_key' };
    if (this.stopped) return { status: this.stopped };
    if (this.used >= this.budget) return { status: 'budget_exhausted' };
    // Each operation contains at most one symbol. Reserve before I/O, including failures.
    this.consumed++;
    const url = new URL(`https://api.marketstack.com/v2/${path}`);
    url.search = new URLSearchParams({ ...params, access_key: this.key }).toString();
    try {
      const response = await this.transport(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
      const raw: unknown = await response.json().catch(() => null);
      const error = providerError.safeParse(raw);
      if (!response.ok || error.success) {
        const code = error.success ? String(error.data.error.code) : '';
        const status: DiagnosticStatus = response.status === 401 || ['invalid_access_key', 'missing_access_key', 'inactive_user'].includes(code) ? 'auth_error'
          : response.status === 429 || ['rate_limit_reached', 'usage_limit_reached'].includes(code) ? 'quota_error'
          : ['function_access_restricted', 'https_access_restricted'].includes(code) ? 'plan_denied'
          : response.status === 403 ? 'forbidden'
          : response.status === 404 ? 'not_found' : 'provider_error';
        if (status === 'auth_error' || status === 'quota_error') this.stopped = status;
        return { status, httpStatus: response.status };
      }
      // Reject reflected secrets before any response data can reach a report.
      if (JSON.stringify(raw).includes(this.key)) return { status: 'invalid_response', httpStatus: response.status };
      const parsed = schema.safeParse(raw);
      return parsed.success ? { status: 'ok', httpStatus: response.status, data: parsed.data }
        : { status: 'invalid_response', httpStatus: response.status,
          validationIssues: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.code}`) };
    } catch {
      // Never expose fetch errors, URLs, provider messages or validation payloads.
      return { status: 'network_error' };
    }
  }
  async search(query: string, mic: string) {
    const result = await this.request('tickerslist', { search: query, exchange: mic, limit: '10', offset: '0' }, catalog);
    return result.status === 'ok' && result.data?.data.length === 0 ? { ...result, status: 'empty' as const } : result;
  }
  async latest(candidate: z.infer<typeof ticker>): Promise<DiagnosticResult<z.infer<typeof eod>>> {
    if (!ticker.safeParse(candidate).success) return { status: 'invalid_response' };
    const result = await this.request('eod/latest', {
      symbols: candidate.ticker, exchange: candidate.stock_exchange.mic, limit: '1', offset: '0',
    }, eod);
    if (result.status !== 'ok' || !result.data) return result;
    const quote = result.data.data[0];
    if (!quote) return { ...result, status: 'empty' as const };
    if (quote.symbol !== candidate.ticker || quote.exchange !== candidate.stock_exchange.mic || Date.parse(quote.date) > Date.now()) {
      return { status: 'invalid_response', httpStatus: result.httpStatus ?? 200 };
    }
    return result;
  }
}

const targets = [
  { name: 'XTB (GPW)', query: 'XTB', mode: 'symbol', mic: 'XWAR', match: /\bXTB\b/i, currency: 'PLN' },
  { name: 'PKO (GPW)', query: 'Powszechna Kasa', mode: 'name', mic: 'XWAR', match: /^POWSZECHNA KASA.*BANK POLSKI/i, currency: 'PLN' },
  { name: 'Orlen (GPW)', query: 'Orlen', mode: 'name', mic: 'XWAR', match: /ORLEN/i, currency: 'PLN' },
  { name: 'Apple (USA)', query: 'Apple', mode: 'name', mic: 'XNAS', match: /^APPLE INC\.?$/i, currency: 'USD' },
  { name: 'Vanguard Total Stock Market ETF', query: 'VTI', mode: 'symbol', mic: 'ARCX', match: /VANGUARD.*TOTAL STOCK MARKET/i, currency: 'USD' },
] as const;

export async function diagnose(client: MarketstackDiagnostic) {
  const rows = [];
  let catalogBlocked = false;
  for (const target of targets) {
    if (catalogBlocked) {
      rows.push({ instrument: target.name, search: 'skipped_catalog_denied', candidates: [], quote: null });
      continue;
    }
    const search = await client.search(target.query, target.mic);
    if (search.status === 'plan_denied' || search.status === 'forbidden') catalogBlocked = true;
    const candidates = search.data?.data.filter(item => item.stock_exchange.mic === target.mic && target.match.test(item.name)) ?? [];
    // No ticker-only mappings; ambiguity stays unresolved, even if one result has EOD.
    const truncated = search.data ? search.data.pagination.total > search.data.pagination.count : null;
    const candidate = candidates.length === 1 && truncated === false ? candidates[0] : undefined;
    const quote = candidate ? await client.latest(candidate) : null;
    const bar = quote?.data?.data[0];
    rows.push({ instrument: target.name, query: target.query, mode: target.mode,
      search: search.status, searchHttp: search.httpStatus,
      truncated,
      candidates, quote,
      verified: candidate?.has_eod === true && quote?.status === 'ok' && bar?.price_currency === target.currency,
    });
  }
  return { checkedAt: new Date().toISOString(), used: client.used, budget: client.budget,
    gpwVerified: rows.slice(0, 3).every(row => 'verified' in row && row.verified === true), rows };
}
