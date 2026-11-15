import { z } from 'zod';
import {
  apiErrorSchema, createPortfolioSchema, portfolioSchema, portfoliosSchema,
  portfolioIdParamsSchema, healthSchema, unavailableSchema, cashSummarySchema, cashHistorySchema, cashOperationInputSchema, cashOperationSchema,
} from '@investorkit/shared';

type ResponseContract = { description: string; schema: z.ZodType };
interface OperationContract {
  operationId: string;
  summary: string;
  authenticated?: boolean;
  idempotency?: boolean;
  body?: z.ZodType;
  params?: typeof portfolioIdParamsSchema;
  responses: Record<number, ResponseContract>;
}
const error = (description: string): ResponseContract => ({ description, schema: apiErrorSchema });
const commonErrors = { 429: error('Limit żądań.'), 500: error('Błąd serwera bez szczegółów wewnętrznych.') };
const protectedErrors = { ...commonErrors, 401: error('Brak ważnej sesji.') };

// Only implemented first-party operations. Better Auth owns /api/auth/* contracts.
export const apiContracts: Record<string, Partial<Record<'get' | 'post', OperationContract>>> = {
  '/api/v1/portfolios/{id}/cash': { get: {
    operationId: 'cashSummary', summary: 'Salda gotówki i wpłaty netto PLN według historycznych kursów.', authenticated: true, params: portfolioIdParamsSchema,
    responses: { 200: { description: 'Saldo każdego subkonta i historyczne wpłaty netto.', schema: cashSummarySchema }, ...protectedErrors, 400: error('Nieprawidłowy UUID.'), 404: error('Brak portfela.'), 422: error('Niedozwolony stan ledgeru.') },
  } },
  '/api/v1/portfolios/{id}/cash-operations': {
    get: { operationId: 'cashHistory', summary: 'Historia gotówki od najnowszej operacji; limit 1000 operacji na portfel.', authenticated: true, params: portfolioIdParamsSchema,
      responses: { 200: { description: 'Historia (wyłącznie właściciel).', schema: cashHistorySchema }, ...protectedErrors, 400: error('Nieprawidłowy UUID.'), 404: error('Brak portfela.') } },
    post: { operationId: 'createCashOperation', summary: 'Wpłata/wypłata z historycznym FX, blokadą portfela i idempotencją.', authenticated: true,
      params: portfolioIdParamsSchema, body: cashOperationInputSchema, idempotency: true,
      responses: { 201: { description: 'Zapisana operacja lub identyczne ponowienie.', schema: cashOperationSchema }, ...protectedErrors,
        400: error('Błędne dane lub brak UUID Idempotency-Key.'), 403: error('Niedozwolony Origin.'), 404: error('Brak portfela.'),
        409: error('Klucz użyty z innymi danymi.'), 413: error('Zbyt duże body.'), 415: error('Nieobsługiwany Content-Type.'), 422: error('Brak środków, błędny FX, przyszła data, przepełnienie lub limit operacji.') } },
  },
  '/health': { get: {
    operationId: 'health', summary: 'Liveness bez dostępu do bazy.',
    responses: { 200: { description: 'Serwer działa.', schema: healthSchema }, ...commonErrors },
  } },
  '/ready': { get: {
    operationId: 'ready', summary: 'Gotowość połączenia z bazą.',
    responses: { 200: { description: 'Baza dostępna.', schema: healthSchema }, 503: { description: 'Baza niedostępna.', schema: unavailableSchema }, ...commonErrors },
  } },
  '/api/v1/portfolios': {
    get: {
      operationId: 'listPortfolios', summary: 'Lista portfeli właściciela sesji (maksymalnie jeden).', authenticated: true,
      responses: { 200: { description: 'Lista bez paginacji w obecnym etapie.', schema: portfoliosSchema }, ...protectedErrors },
    },
    post: {
      operationId: 'createPortfolio', summary: 'Utwórz jeden portfel PLN dla właściciela sesji.', authenticated: true,
      body: createPortfolioSchema,
      responses: {
        201: { description: 'Utworzony portfel.', schema: portfolioSchema }, ...protectedErrors,
        400: error('Nieprawidłowe dane lub JSON.'), 403: error('Brak zgodnego nagłówka Origin.'),
        409: error('Właściciel ma już portfel.'), 413: error('Body przekracza 64 KiB.'), 415: error('Nieobsługiwany Content-Type.'),
      },
    },
  },
  '/api/v1/portfolios/{id}': { get: {
    operationId: 'getPortfolio', summary: 'Portfel właściciela; cudzy lub brakujący zasób zwraca 404.', authenticated: true,
    params: portfolioIdParamsSchema,
    responses: { 200: { description: 'Portfel.', schema: portfolioSchema }, ...protectedErrors, 400: error('Nieprawidłowy UUID.'), 404: error('Nie znaleziono portfela.') },
  } },
};

const jsonSchema = (schema: z.ZodType, io: 'input' | 'output') => z.toJSONSchema(schema, { target: 'openapi-3.0', io });
export function buildOpenApiDocument() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'InvestorKit API', version: '0.1.0',
      description: 'Wdrożone endpointy własne. /api/auth/* deleguje do Better Auth i nie jest częścią tego dokumentu. /api/v1/openapi.json udostępnia ten dokument. Planowane funkcje opisuje docs/05-api.md.',
    },
    servers: [{ url: '/', description: 'Ten sam origin co frontend; /health i /ready bezpośrednio na API.' }],
    components: { securitySchemes: {
      session: { type: 'apiKey', in: 'cookie', name: '__Secure-better-auth.session_token', description: 'HttpOnly session cookie w produkcji HTTPS.' },
      localSession: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token', description: 'Wariant dla lokalnego HTTP.' },
    } },
    paths: Object.fromEntries(Object.entries(apiContracts).map(([path, methods]) => [path,
      Object.fromEntries(Object.entries(methods).map(([method, contract]) => [method, {
        operationId: contract.operationId, summary: contract.summary,
        security: contract.authenticated ? [{ session: [] }, { localSession: [] }] : [],
        parameters: [
          ...(contract.params ? [{ name: 'id', in: 'path', required: true, schema: jsonSchema(contract.params.shape.id, 'input') }] : []),
          ...(contract.body ? [{ name: 'Origin', in: 'header', required: true, description: 'Musi być równy WEB_ORIGIN.', schema: { type: 'string', format: 'uri' } }] : []),
          ...(contract.idempotency ? [{ name: 'Idempotency-Key', in: 'header', required: true, description: 'UUID; ten sam klucz i body zwracają tę samą operację.', schema: { type: 'string', format: 'uuid' } }] : []),
        ],
        ...(contract.body ? {
          requestBody: { required: true, content: { 'application/json': { schema: jsonSchema(contract.body, 'input') } } },
        } : {}),
        responses: Object.fromEntries(Object.entries(contract.responses).map(([status, response]) => [status, {
          description: response.description, content: { 'application/json': { schema: jsonSchema(response.schema, 'output') } },
        }])),
      }])),
    ])),
  };
}
