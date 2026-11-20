import { describe, it, expect, vi } from 'vitest';
import { marketstackProvider, parseMarketJson } from '../../apps/api/src/market-data-provider.js';
const key = 'fixture-key-only';
const listing = { symbol: 'XTB.WA', mic: 'XWAR', name: 'XTB S.A.' };
const response = (close = '139.72', currency = 'PLN', date = '2026-11-16T00:00:00+0000') => `{"data":[{"symbol":"XTB.WA","exchange":"XWAR","price_currency":"${currency}","close":${close},"adj_close":1,"date":"${date}"}]}`;
describe('Marketstack adapter — fixtures, no live API', () => {
  it('keeps the exact close decimal lexeme without binary rounding or adjusted close', async () => {
    const reserve = vi.fn(async () => {});
    const transport = vi.fn<typeof fetch>(async () => new Response(response('99999999999999999.1234567890')));
    const provider = marketstackProvider(key, reserve, async () => {}, transport);
    const quote = await provider.latest(listing);
    expect(quote.price).toBe('99999999999999999.1234567890');
    expect(quote.sessionDate).toBe('2026-11-16');
    expect(quote.asOf).toBe('2026-11-16T00:00:00.000Z');
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(quote)).not.toContain(key);
  });
  it('preserves actual zero and rejects missing currency, future dates and excess precision', async () => {
    for (const [body, ok] of [[response('0'), true], [response('1.12345678901'), false],
      [response('10', 'GBP'), false], [response('10', 'PLN', '2099-01-01T00:00:00+0000'), false],
      [response().replace('"PLN"', 'null'), false]] as const) {
      const provider = marketstackProvider(key, async () => {}, async () => {}, async () => new Response(body));
      if (ok) expect((await provider.latest(listing)).price).toBe('0');
      else await expect(provider.latest(listing)).rejects.toHaveProperty('code', 'INVALID_RESPONSE');
    }
  });
  it.each([401, 403, 429])('does not retry authentication, plan or quota failure %s', async status => {
    const reserve = vi.fn(async () => {}); const block = vi.fn(async () => {});
    const transport = vi.fn<typeof fetch>(async () => new Response('{}', { status }));
    await expect(marketstackProvider(key, reserve, block, transport).latest(listing)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1); expect(reserve).toHaveBeenCalledTimes(1);
    expect(block).toHaveBeenCalledTimes(status === 403 ? 0 : 1);
  });
  it('reserves another unit for a single transient retry and respects a budget failure', async () => {
    const reserve = vi.fn(async () => {});
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(new Response(response()));
    expect((await marketstackProvider(key, reserve, async () => {}, transport).latest(listing)).price).toBe('139.72');
    expect(reserve).toHaveBeenCalledTimes(2);
    const blocked = marketstackProvider(key, async () => { throw new Error('budget'); }, async () => {}, transport);
    await expect(blocked.latest(listing)).rejects.toThrow('budget');
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('removes provider errors and reflected secrets from safe errors', async () => {
    const provider = marketstackProvider(key, async () => {}, async () => {}, async () => { throw new Error(`url?access_key=${key}`); });
    try { await provider.latest(listing); } catch (error) { expect(String(error)).not.toContain(key); }
    await expect(marketstackProvider(key, async () => {}, async () => {}, async () => new Response(`{"secret":"${key}"}`)).latest(listing)).rejects.toHaveProperty('code', 'INVALID_RESPONSE');
  });
  it('limits search to3 listings on the requested MIC and preserves ambiguity for user selection', async () => {
    const data = [{ ticker: 'PKO.WA', name: 'Powszechna Kasa', has_eod: true, stock_exchange: { mic: 'XWAR', name: 'WSE' } },
      { ticker: 'PKOGD.WA', name: '', has_eod: true, stock_exchange: { mic: 'XWAR', name: 'WSE' } }];
    const provider = marketstackProvider(key, async () => {}, async () => {}, async () => new Response(JSON.stringify({ pagination: { total: 2 }, data })));
    const result = await provider.search('PKO', 'XWAR');
    expect(result.items).toEqual([{ symbol: 'PKO.WA', name: 'Powszechna Kasa', mic: 'XWAR' }]);
    expect(result.partial).toBe(true);
    expect(parseMarketJson('{"close":1.2345678901}')).toEqual({ close: '1.2345678901' });
  });
});

it('does not spend another request on malformed JSON or schema errors', async () => {
  for (const body of ['not-json', '{}']) {
    const transport = vi.fn<typeof fetch>(async () => new Response(body));
    await expect(marketstackProvider(key, async () => {}, async () => {}, transport).latest(listing)).rejects.toHaveProperty('code', 'INVALID_RESPONSE');
    expect(transport).toHaveBeenCalledTimes(1);
  }
});
