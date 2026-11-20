import { csvPreviewInputSchema } from '@investorkit/shared';
import { previewCsv } from '../../apps/api/src/imports/csv-parser.js';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../apps/api/src/openapi.js';
import { createContractValidator } from '../response-contract.js';
const validator = await createContractValidator();
afterAll(() => validator.close());
const document = buildOpenApiDocument();
describe('generated OpenAPI', () => {
  it('keeps the checked-in document current and limits it to implemented first-party routes', () => {
    expect(JSON.parse(readFileSync(new URL('../../docs/openapi.json', import.meta.url), 'utf8'))).toEqual(document);
    expect(document.openapi).toBe('3.0.3');
    expect(Object.keys(document.paths).sort()).toEqual(['/api/v1/portfolios/{id}/imports/csv-preview', '/api/v1/market', '/api/v1/market/search', '/api/v1/instruments/{id}/market-binding', '/api/v1/instruments/{id}/market-refresh', '/api/v1/portfolios/{id}/history', '/api/v1/portfolios/{id}/snapshots', '/api/v1/valuation-snapshots/{id}', '/api/v1/portfolios/{id}/journal', '/api/v1/journal/{id}', '/health', '/ready', '/api/v1/portfolios', '/api/v1/portfolios/{id}', '/api/v1/portfolios/{id}/cash', '/api/v1/portfolios/{id}/cash-operations', '/api/v1/instruments', '/api/v1/instruments/{id}/quotes', '/api/v1/fx-rates', '/api/v1/portfolios/{id}/operations', '/api/v1/portfolios/{id}/valuation', '/api/v1/portfolios/{id}/simulations', '/api/v1/portfolios/{id}/risk', '/api/v1/portfolios/{id}/risk-settings', '/api/v1/portfolios/{id}/stress-tests'].sort());
    const ids = Object.values(document.paths).flatMap(methods => Object.values(methods).map(operation => operation.operationId));
    expect(new Set(ids).size).toBe(34);
  });
  it('distinguishes input defaults from required output fields and documents session/origin', () => {
    const post = document.paths['/api/v1/portfolios']?.['post'];
    expect(post?.requestBody?.content['application/json'].schema.required).toEqual(['name']);
    expect(post?.requestBody?.content['application/json'].schema.additionalProperties).toBe(false);
    expect(post?.responses['201']?.content['application/json'].schema.required).toEqual(['id', 'name', 'baseCurrency', 'createdAt']);
    expect(post?.security).toEqual([{ session: [] }, { localSession: [] }]);
    expect(post?.parameters).toContainEqual(expect.objectContaining({ name: 'Origin', in: 'header', required: true }));
    expect(document.paths['/health']?.['get']?.security).toEqual([]);
    expect(document.paths['/api/v1/portfolios/{id}']?.['get']?.parameters).toContainEqual(expect.objectContaining({ name: 'id', in: 'path', required: true }));
  });
  it('detects response drift including missing fields, private fields, currency and dates', async () => {
    const portfolio = { id: 'f6f92d67-ecaa-4ec6-a9ef-e80f1df4f763', name: 'Mój portfel', baseCurrency: 'PLN', createdAt: '2026-11-15T12:00:00Z' };
    expect(await validator.accepts('/api/v1/portfolios', 'post', 201, portfolio)).toBe(true);
    for (const invalid of [
      { ...portfolio, id: 'invalid' }, { ...portfolio, createdAt: 'yesterday' },
      { ...portfolio, baseCurrency: 'USD' }, { ...portfolio, ownerId: 'private' },
      { id: portfolio.id, name: portfolio.name, baseCurrency: 'PLN' },
    ]) expect(await validator.accepts('/api/v1/portfolios', 'post', 201, invalid)).toBe(false);
    expect(await validator.accepts('/api/v1/portfolios', 'get', 401, { error: { code: 'UNAUTHENTICATED', message: 'Zaloguj się.' } })).toBe(false);
  });
});

it('keeps a nullable proposed operation constrained to a real operation or null', async () => {
  const result = previewCsv(csvPreviewInputSchema.parse({ fileName: 'sample.csv', contentBase64: Buffer.from('kind;occurredAt;currency;amount\nDEPOSIT;2026-01-01T12:00:00Z;PLN;1').toString('base64'), encoding: 'utf-8', delimiter: ';', decimalSeparator: '.', mapping: {} }), [], '2026-11-19T12:00:00Z');
  const path = '/api/v1/portfolios/{id}/imports/csv-preview';
  expect(await validator.accepts(path, 'post', 200, result)).toBe(true);
  expect(await validator.accepts(path, 'post', 200, { ...result, rows: result.rows.map(row => ({ ...row, operation: {} })) })).toBe(false);
});
