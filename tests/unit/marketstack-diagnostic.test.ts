import { describe, expect, it, vi } from 'vitest';
import { diagnose, MarketstackDiagnostic } from '../../scripts/lib/marketstack-diagnostic.mjs';

const secret = 'fixture-secret-not-a-real-key';
const candidate = { ticker: 'XTB.WA', name: 'XTB S.A.', has_eod: true,
  stock_exchange: { mic: 'XWAR', name: 'Warsaw' } };
const catalog = (data = [candidate], total = data.length) => ({ pagination: { total, count: data.length }, data });
const bar = { symbol: 'XTB.WA', exchange: 'XWAR', price_currency: 'PLN', close: 139.72, date: '2026-11-16T00:00:00+0000' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const mock = (body: unknown, status = 200) => vi.fn<typeof fetch>().mockImplementation(async () => reply(body, status));

describe('Marketstack local diagnostic (fixtures only, no external API)', () => {
  it('does not call the provider without a key', async () => {
    const transport = mock({});
    const client = new MarketstackDiagnostic(undefined, 10, transport);
    expect((await client.search('XTB', 'XWAR')).status).toBe('missing_key');
    expect(client.used).toBe(0);
    expect(transport).not.toHaveBeenCalled();
  });
  it('uses the catalog ticker and MIC, single symbol, unadjusted close and original session date', async () => {
    const transport = mock({ data: [{ ...bar, adj_close: 1 }] });
    const client = new MarketstackDiagnostic(secret, 10, transport);
    const result = await client.latest(candidate);
    expect(result.status).toBe('ok');
    expect(result.data?.data[0]).toMatchObject({ close: 139.72, date: '2026-11-16T00:00:00+00:00', price_currency: 'PLN' });
    const url = new URL(String(transport.mock.calls[0]?.[0]));
    expect(url.origin).toBe('https://api.marketstack.com');
    expect(url.searchParams.get('symbols')).toBe('XTB.WA');
    expect(url.searchParams.get('exchange')).toBe('XWAR');
    expect(transport.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) });
  });
  it('bounds searches and distinguishes an empty catalog from denial or missing coverage', async () => {
    const transport = mock(catalog([]));
    const result = await new MarketstackDiagnostic(secret, 10, transport).search('Orlen', 'XWAR');
    expect(result.status).toBe('empty');
    const url = new URL(String(transport.mock.calls[0]?.[0]));
    expect(url.searchParams.get('search')).toBe('Orlen');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('offset')).toBe('0');
  });
  it.each([
    [403, 'function_access_restricted', 'plan_denied'],
    [403, 'unrecognized_denial', 'forbidden'],
    [401, 'invalid_access_key', 'auth_error'],
    [429, 'rate_limit_reached', 'quota_error'],
    [404, 'not_found', 'not_found'],
    [500, 'internal_error', 'provider_error'],
  ] as const)('classifies HTTP %s / %s without exposing provider errors', async (status, code, expected) => {
    const transport = mock({ error: { code, message: `https://example.invalid?access_key=${secret}` } }, status);
    const result = await new MarketstackDiagnostic(secret, 10, transport).search('PKO', 'XWAR');
    expect(result.status).toBe(expected);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain('example.invalid');
  });
  it.each([401, 429])('stops after HTTP %s without retries or further quota consumption', async status => {
    const transport = mock({}, status);
    const client = new MarketstackDiagnostic(secret, 10, transport);
    await client.search('XTB', 'XWAR');
    await client.search('PKO', 'XWAR');
    expect(client.used).toBe(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('reserves budget including failures and blocks additional calls', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error(`url?access_key=${secret}`));
    const client = new MarketstackDiagnostic(secret, 1, transport);
    expect(await client.search('XTB', 'XWAR')).toEqual({ status: 'network_error' });
    expect(await client.search('PKO', 'XWAR')).toEqual({ status: 'budget_exhausted' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(() => new MarketstackDiagnostic(secret, 11, transport)).toThrow();
  });
  it('rejects a reflected secret, malformed data, missing currency and future or mismatched quotes', async () => {
    for (const value of [{ data: [{ ...bar, price_currency: null }] },
      { data: [{ ...bar, symbol: 'OTHER' }] }, { data: [{ ...bar, exchange: 'XNAS' }] },
      { data: [{ ...bar, date: '2099-01-01T00:00:00+0000' }] },
      { data: [{ ...bar, name: secret }] }, {}]) {
      const result = await new MarketstackDiagnostic(secret, 10, mock(value)).latest(candidate);
      expect(result.status).toBe('invalid_response');
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });
  it('does not replace empty EOD with zero', async () => {
    expect((await new MarketstackDiagnostic(secret, 10, mock({ data: [] })).latest(candidate)).status).toBe('empty');
  });
  it('does not assume GPW coverage from catalog flags or a plan denial', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async url => String(url).includes('tickerslist')
      ? reply(catalog()) : reply({ error: { code: 'function_access_restricted' } }, 403));
    const result = await diagnose(new MarketstackDiagnostic(secret, 10, transport));
    expect(result.gpwVerified).toBe(false);
    expect(result.rows[0]?.quote?.status).toBe('plan_denied');
  });
  it('does not fetch EOD for an ambiguous or truncated search result', async () => {
    for (const value of [catalog([candidate, { ...candidate, ticker: 'OTHER.WA' }]), catalog([candidate], 11)]) {
      const transport = mock(value);
      const result = await diagnose(new MarketstackDiagnostic(secret, 10, transport));
      expect(result.rows[0]?.quote).toBeNull();
      expect(transport.mock.calls.every(call => String(call[0]).includes('tickerslist'))).toBe(true);
    }
  });
  it('does not accept the wrong currency as verified coverage', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async url => String(url).includes('tickerslist')
      ? reply(catalog()) : reply({ data: [{ ...bar, price_currency: 'EUR' }] }));
    const result = await diagnose(new MarketstackDiagnostic(secret, 10, transport));
    expect(result.rows[0]?.verified).toBe(false);
  });
  it('stops repeated catalog calls after an endpoint-wide denial', async () => {
    const transport = mock({ error: { code: 'function_access_restricted' } }, 403);
    const result = await diagnose(new MarketstackDiagnostic(secret, 10, transport));
    expect(result.used).toBe(1);
    expect(result.rows[1]?.search).toBe('skipped_catalog_denied');
    expect(result.gpwVerified).toBe(false);
  });
});

describe('complete diagnostic evidence (fixtures only)', () => {
  it('confirms all GPW examples only with unique catalog mappings, EOD and matching currency', async () => {
    const tickers = [candidate,
      { ...candidate, ticker: 'PKO.WA', name: 'Powszechna Kasa Oszczednosci Bank Polski' },
      { ...candidate, ticker: 'PKN.WA', name: 'Orlen S.A.' },
      { ...candidate, ticker: 'AAPL', name: 'Apple Inc', stock_exchange: { mic: 'XNAS', name: 'Nasdaq' } },
      { ...candidate, ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', stock_exchange: { mic: 'ARCX', name: 'Arca' } }];
    let index = 0;
    const transport = vi.fn<typeof fetch>().mockImplementation(async input => {
      const url = new URL(String(input));
      const current = tickers[index];
      if (!current) throw new Error('unexpected request');
      if (url.pathname.endsWith('tickerslist')) return reply(catalog([current]));
      index++;
      return reply({ data: [{ ...bar, symbol: current.ticker, exchange: current.stock_exchange.mic,
        price_currency: index <= 3 ? 'PLN' : 'USD' }] });
    });
    const result = await diagnose(new MarketstackDiagnostic(secret, 10, transport));
    expect(result.used).toBe(10);
    expect(result.gpwVerified).toBe(true);
    expect(result.rows.every(row => row.verified)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe('single-symbol billing protection', () => {
  it('rejects a multi-symbol catalog entry before it can consume an EOD request', async () => {
    const transport = mock(catalog([{ ...candidate, ticker: 'XTB.WA,PKO.WA' }]));
    const client = new MarketstackDiagnostic(secret, 10, transport);
    expect((await client.search('XTB', 'XWAR')).status).toBe('invalid_response');
    expect((await client.latest({ ...candidate, ticker: 'XTB.WA,PKO.WA' })).status).toBe('invalid_response');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(client.used).toBe(1);
  });
});
