import { z } from 'zod';
import {
  xtbPreviewInputSchema, xtbPreviewSchema, csvPreviewInputSchema, csvPreviewSchema, marketSearchInputSchema, marketSearchSchema, marketStatesSchema, marketStateSchema, marketBindingInputSchema, marketModeInputSchema, snapshotInputSchema, snapshotSchema, portfolioHistorySchema, portfolioHistoryQuerySchema, journalInputSchema, journalEntrySchema, journalListSchema, journalDeletedSchema, apiErrorSchema, createPortfolioSchema, portfolioSchema, portfoliosSchema,
  portfolioIdParamsSchema, healthSchema, unavailableSchema, cashSummarySchema, cashHistorySchema, cashOperationInputSchema, cashOperationSchema, instrumentsSchema, createInstrumentSchema, instrumentSchema, quoteInputSchema, quoteSchema, quotesSchema, fxInputSchema, fxSchema, ledgerOperationSchema, operationSchema, operationHistorySchema, valuationSchema, valuationTimeSchema, simulationInputSchema, simulationSchema, riskSettingsInputSchema, riskSettingsSchema, riskSchema, stressInputSchema, stressSchema,
} from '@investorkit/shared';

type ResponseContract = { description: string; schema: z.ZodType };
interface OperationContract {
  operationId: string;
  summary: string;
  authenticated?: boolean;
  idempotency?: boolean;
  valuationQuery?: boolean;
  historyQuery?: boolean;
  ifMatch?: boolean | 'entry';
  body?: z.ZodType;
  params?: typeof portfolioIdParamsSchema;
  responses: Record<number, ResponseContract>;
}
const error = (description: string): ResponseContract => ({ description, schema: apiErrorSchema });
const commonErrors = { 429: error('Limit żądań.'), 500: error('Błąd serwera bez szczegółów wewnętrznych.') };
const protectedErrors = { ...commonErrors, 401: error('Brak ważnej sesji.') };

// Only implemented first-party operations. Better Auth owns /api/auth/* contracts.
export const apiContracts: Record<string, Partial<Record<'get' | 'post' | 'patch' | 'delete', OperationContract>>> = {
  '/api/v1/portfolios/{id}/imports/xtb-preview': { post: { operationId: 'xtbPreview', summary: 'Podgląd jednego udokumentowanego angielskiego układu XLSX XTB; bez zapisu i obliczeń portfela.', authenticated: true, params: portfolioIdParamsSchema, body: xtbPreviewInputSchema,
    responses: { 200: { description: 'Arkusze, rekordy, grupy/podsumowania i diagnostyka; canCommit zawsze false.', schema: xtbPreviewSchema }, ...protectedErrors, 400: error('UUID/body/base64/potwierdzenie UTC/waluta.'), 403: error('Origin.'), 404: error('Brak portfela.'), 413: error('Limit body8MiB lub pliku5MiB.'), 415: error('Content-Type.'), 422: error('Nieobsługiwany układ, ZIP/XML, formuły, relacje lub limity rozpakowania.') } } },
  '/api/v1/portfolios/{id}/imports/csv-preview': { post: { operationId: 'csvPreview', summary: 'Odczytaj i zmapuj ogólny CSV do5MiB/10000 wierszy, bez zapisu pliku lub operacji. XTB wymaga próbki.', authenticated: true, params: portfolioIdParamsSchema, body: csvPreviewInputSchema,
    responses: { 200: { description: 'Surowe wiersze, diagnostyka i propozycje operacji; canCommit zawsze false.', schema: csvPreviewSchema }, ...protectedErrors, 400: error('UUID/body/base64/mapowanie.'), 403: error('Origin.'), 404: error('Brak portfela.'), 413: error('Limit body8MiB (base64 pliku do5MiB).'), 415: error('Content-Type.'), 422: error('Format, kodowanie, quoting, nagłówki lub limit CSV; XTB SAMPLE_REQUIRED.') } } },
  '/api/v1/market': { get: { operationId: 'marketStates', summary: 'Źródła EOD, daty prób i lokalny budżet dostawcy.', authenticated: true, responses: { 200: { description: 'Własne mapowania i stan.', schema: marketStatesSchema }, ...protectedErrors, 503: error('Integracja wyłączona.') } } },
  '/api/v1/market/search': { post: { operationId: 'marketSearch', summary: 'Szukaj nazw/tickerów na wybranym MIC; do3 wyników z walutą potwierdzoną EOD, prywatny cache15min.', authenticated: true, body: marketSearchInputSchema, responses: { 200: { description: 'Potwierdzone wyniki lub częściowe wyniki.', schema: marketSearchSchema }, ...protectedErrors, 400: error('Body.'), 403: error('Origin.'), 503: error('Brak danych lub budżetu dostawcy.') } } },
  '/api/v1/instruments/{id}/market-binding': {
    post: { operationId: 'bindMarket', summary: 'Jawnie połącz własny instrument z wybranym wynikiem i wybierz EOD; bez automatycznego łączenia tickerów.', authenticated: true, params: portfolioIdParamsSchema, body: marketBindingInputSchema, responses: { 200: { description: 'Źródło EOD.', schema: marketStateSchema }, ...protectedErrors, 400: error('Body.'), 403: error('Origin.'), 404: error('Brak instrumentu.'), 409: error('Inne mapowanie już istnieje.'), 422: error('Wybór wygasł lub giełda/waluta nie pasuje.'), 503: error('Integracja wyłączona.') } },
    patch: { operationId: 'chooseMarketSource', summary: 'Jawnie wybierz ręczne ceny lub zapisane EOD.', authenticated: true, params: portfolioIdParamsSchema, body: marketModeInputSchema, responses: { 200: { description: 'Wybrane źródło.', schema: marketStateSchema }, ...protectedErrors, 400: error('Body.'), 403: error('Origin.'), 404: error('Brak mapowania.'), 503: error('Integracja wyłączona.') } },
  },
  '/api/v1/instruments/{id}/market-refresh': { post: { operationId: 'refreshMarket', summary: 'Aktualizuj EOD maksymalnie raz na dzień UTC, zachowując ostatnią poprawną cenę przy błędzie.', authenticated: true, params: portfolioIdParamsSchema, body: snapshotInputSchema, responses: { 200: { description: 'Ostatnia cena i oddzielny status próby.', schema: marketStateSchema }, ...protectedErrors, 400: error('Body.'), 403: error('Origin.'), 404: error('Brak mapowania.'), 422: error('Źródło ręczne.'), 503: error('Integracja wyłączona.') } } },
  '/api/v1/portfolios/{id}/history': { get: { operationId: 'portfolioHistory', summary: 'Zapisane wyceny i oznaczone przykłady DEMO; luki obejmują brak rzeczywistych zapisów, bez interpolacji.', authenticated: true, params: portfolioIdParamsSchema, historyQuery: true,
    responses: { 200: { description: 'Zapisy i jawne dni bez snapshotu (czas polski).', schema: portfolioHistorySchema }, ...protectedErrors, 400: error('UUID/query.'), 404: error('Brak portfela.'), 422: error('Zakres dłuższy niż366 dni, odwrócony lub przyszły.') } } },
  '/api/v1/portfolios/{id}/snapshots': { post: { operationId: 'captureValuation', summary: 'Zapisz obecną wycenę serwera (także niepełną), bez zmiany finansów i bez datowania wstecz.', authenticated: true, params: portfolioIdParamsSchema, body: snapshotInputSchema,
    responses: { 201: { description: 'Utrwalona wycena z datami, źródłami i diagnostyką.', schema: snapshotSchema }, ...protectedErrors, 400: error('UUID/body.'), 403: error('Origin.'), 404: error('Brak portfela.'), 409: error('Dane zmieniły się podczas zapisu.'), 422: error('Limit366 lub błąd stanu/zakresu kwot.'), 413: error('Limit body.'), 415: error('Content-Type.') } } },
  '/api/v1/valuation-snapshots/{id}': { get: { operationId: 'valuationSnapshot', summary: 'Prywatne szczegóły zapisanej wyceny, nie przeliczane aktualnymi danymi.', authenticated: true, params: portfolioIdParamsSchema,
    responses: { 200: { description: 'Wycena i założenia z chwili zapisu.', schema: snapshotSchema }, ...protectedErrors, 400: error('UUID.'), 404: error('Brak zapisu.') } } },
  '/api/v1/portfolios/{id}/journal': {
    get: { operationId: 'listJournal', summary: 'Prywatny dziennik, do100 wpisów od najnowszej decyzji.', authenticated: true, params: portfolioIdParamsSchema,
      responses: { 200: { description: 'Własne wpisy i limit100.', schema: journalListSchema }, ...protectedErrors, 400: error('UUID.'), 404: error('Brak portfela.') } },
    post: { operationId: 'createJournal', summary: 'Zapisz prywatny powód decyzji; bez operacji finansowej.', authenticated: true, params: portfolioIdParamsSchema, body: journalInputSchema,
      responses: { 201: { description: 'Wpis z revision1.', schema: journalEntrySchema }, ...protectedErrors, 400: error('UUID/body.'), 403: error('Origin.'), 404: error('Brak własnego portfela lub instrumentu.'), 422: error('Limit100 lub przyszła data.'), 413: error('Limit body64KiB.'), 415: error('Content-Type.') } },
  },
  '/api/v1/journal/{id}': {
    patch: { operationId: 'updateJournal', summary: 'Zmień pełną treść wpisu z aktualną revision w If-Match.', authenticated: true, params: portfolioIdParamsSchema, body: journalInputSchema, ifMatch: 'entry',
      responses: { 200: { description: 'Wpis z nową revision.', schema: journalEntrySchema }, ...protectedErrors, 400: error('UUID/body/If-Match.'), 403: error('Origin.'), 404: error('Brak własnego wpisu/instrumentu.'), 409: error('Konflikt wersji.'), 422: error('Data lub limit wersji.'), 428: error('Brak If-Match.'), 413: error('Limit body64KiB.'), 415: error('Content-Type.') } },
    delete: { operationId: 'deleteJournal', summary: 'Usuń własny wpis z kontrolą If-Match, bez zmiany portfela.', authenticated: true, params: portfolioIdParamsSchema, ifMatch: 'entry',
      responses: { 200: { description: 'Potwierdzenie usunięcia.', schema: journalDeletedSchema }, ...protectedErrors, 400: error('UUID/If-Match.'), 403: error('Origin.'), 404: error('Brak wpisu.'), 409: error('Konflikt wersji.'), 428: error('Brak If-Match.') } },
  },
  '/api/v1/portfolios/{id}/risk-settings': {
    get: { operationId: 'getRiskSettings', summary: 'Ustawienia progów i świeżości, domyślne bez zapisu (revision0); ETag zawiera revision.', authenticated: true, params: portfolioIdParamsSchema,
      responses: { 200: { description: 'Progi produktu i wersja ustawień.', schema: riskSettingsSchema }, ...protectedErrors, 400: error('UUID.'), 404: error('Brak portfela.') } },
    patch: { operationId: 'updateRiskSettings', summary: 'Zapisz komplet ustawień z kontrolą If-Match; kolejność pozycja≤Top3≤Top5.', authenticated: true, params: portfolioIdParamsSchema, body: riskSettingsInputSchema, ifMatch: true,
      responses: { 200: { description: 'Zapisane ustawienia i nowa revision/ETag.', schema: riskSettingsSchema }, ...protectedErrors, 400: error('Body, UUID lub If-Match.'), 403: error('Origin.'), 404: error('Brak portfela.'), 409: error('Konflikt wersji.'), 422: error('Nieprawidłowa kolejność progów/limit wersji.'), 428: error('Brak If-Match.'), 413: error('Limit body.'), 415: error('Content-Type.') } },
  },
  '/api/v1/portfolios/{id}/risk': { get: { operationId: 'risk', summary: 'Koncentracja Top3/5 i struktura z gotówką oraz kategorią UNKNOWN; niepełność daje udziały null.', authenticated: true, params: portfolioIdParamsSchema,
    responses: { 200: { description: 'Koncentracja, struktura i bazowa wycena.', schema: riskSchema }, ...protectedErrors, 400: error('UUID.'), 404: error('Brak portfela.'), 422: error('Nieprawidłowy stan lub zakres kwot.') } } },
  '/api/v1/portfolios/{id}/stress-tests': { post: { operationId: 'stress', summary: 'Scenariusz spadku0–100% jednej pozycji lub wszystkich papierów; FX i gotówka stałe, bez zapisów.', authenticated: true, params: portfolioIdParamsSchema, body: stressInputSchema,
    responses: { 200: { description: 'Wycena przed, wartości po, ubytek i założenia.', schema: stressSchema }, ...protectedErrors, 400: error('Body/UUID.'), 403: error('Origin.'), 404: error('Brak własnego portfela lub instrumentu.'), 422: error('Brak otwartej pozycji lub błąd domenowy.'), 413: error('Limit body.'), 415: error('Content-Type.') } } },
  '/api/v1/portfolios/{id}/simulations': { post: { operationId: 'simulatePurchase', summary: 'Symuluj zakup bez zapisu; budżet z prowizją, bieżący FX i jawna cena referencyjna.', authenticated: true, params: portfolioIdParamsSchema, body: simulationInputSchema,
    responses: { 200: { description: 'Założenia i porównanie przed/po.', schema: simulationSchema }, ...protectedErrors, 400: error('Błędne dane.'), 403: error('Origin.'), 404: error('Brak własnego portfela lub instrumentu.'), 422: error('Za mały budżet, brak gotówki, aktualnego FX lub przekroczony zakres.'), 413: error('Limit body.'), 415: error('Content-Type.') } } },
  '/api/v1/instruments': {
    get: { operationId: 'listInstruments', summary: 'Instrumenty właściciela (do 100).', authenticated: true, responses: { 200: { description: 'Własne instrumenty.', schema: instrumentsSchema }, ...protectedErrors } },
    post: { operationId: 'createInstrument', summary: 'Dodaj własny instrument STOCK/ETF.', authenticated: true, body: createInstrumentSchema,
      responses: { 201: { description: 'Instrument.', schema: instrumentSchema }, ...protectedErrors, 400: error('Błędne dane.'), 403: error('Origin.'), 409: error('Instrument już istnieje.'), 422: error('Limit instrumentów.'), 413: error('Limit body.'), 415: error('Content-Type.') } },
  },
  '/api/v1/instruments/{id}/quotes': { get: { operationId: 'listQuotes', summary: 'Zapisane ręczne ceny własnego instrumentu (do 500), kolejność sequence.', authenticated: true, params: portfolioIdParamsSchema,
    responses: { 200: { description: 'Ceny z datami i źródłem; odczyt obejmuje także instrument nieposiadany.', schema: quotesSchema }, ...protectedErrors, 400: error('Błędny UUID.'), 404: error('Brak/cudzy instrument.') } }, post: { operationId: 'createQuote', summary: 'Ręczna cena w walucie instrumentu; zero jest dozwolone, przyszła data odrzucona.', authenticated: true, params: portfolioIdParamsSchema, body: quoteInputSchema,
    responses: { 201: { description: 'Cena.', schema: quoteSchema }, ...protectedErrors, 400: error('Błędne dane.'), 403: error('Origin.'), 404: error('Brak/cudzy instrument.'), 422: error('Data, waluta lub limit 500 cen.'), 413: error('Limit body.'), 415: error('Content-Type.') } } },
  '/api/v1/fx-rates': { post: { operationId: 'createFx', summary: 'Ręczny kurs wyceny PLN za1 jednostkę; niezależny od historycznych kursów operacji.', authenticated: true, body: fxInputSchema,
    responses: { 201: { description: 'Kurs.', schema: fxSchema }, ...protectedErrors, 400: error('Błędne dane.'), 403: error('Origin.'), 422: error('Data, kurs lub limit 1000 kursów.'), 413: error('Limit body.'), 415: error('Content-Type.') } } },
  '/api/v1/portfolios/{id}/operations': {
    get: { operationId: 'operationHistory', summary: 'Wspólna historia wpłat/wypłat/BUY/SELL; najnowsze pierwsze, limit 1000 wpisów.', authenticated: true, params: portfolioIdParamsSchema,
      responses: { 200: { description: 'Historia.', schema: operationHistorySchema }, ...protectedErrors, 400: error('Błędny UUID.'), 404: error('Brak portfela.') } },
    post: { operationId: 'createOperation', summary: 'Operacja wspólnego ledgeru z blokadą, idempotencją i pełnym replay.', authenticated: true, params: portfolioIdParamsSchema, idempotency: true, body: ledgerOperationSchema,
      responses: { 201: { description: 'Operacja lub identyczna powtórka.', schema: operationSchema }, ...protectedErrors, 400: error('Błędne dane lub klucz.'), 403: error('Origin.'), 404: error('Brak portfela/instrumentu.'), 409: error('Konflikt klucza.'), 422: error('Debet, oversell, waluta, daty, overflow lub limit historii.'), 413: error('Limit body.'), 415: error('Content-Type.') } },
  },
  '/api/v1/portfolios/{id}/valuation': { get: { operationId: 'valuation', summary: 'Wycena z gotówką i nominalny P/L, świeżość według ustawień (domyślnie72h). Niekompletne dane dają totalValue/P&L null i pricedSubtotal.', authenticated: true, params: portfolioIdParamsSchema, valuationQuery: true,
    responses: { 200: { description: 'Wycena z kompletnością, źródłami i diagnostyką.', schema: valuationSchema }, ...protectedErrors, 400: error('Błędna data/UUID.'), 404: error('Brak portfela.'), 422: error('Przyszła wycena lub błąd domeny.') } } },
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

const jsonSchema = (schema: z.ZodType, io: 'input' | 'output') => z.toJSONSchema(schema, {
  target: 'openapi-3.0', io,
  override: ({ jsonSchema: converted }) => {
    // OAS3 requires a type beside nullable. Nullable unions need a distinct null-only branch.
    if (converted.nullable === true && converted.type === undefined) {
      for (const union of ['oneOf', 'anyOf'] as const) if (Array.isArray(converted[union])) {
        converted[union] = [...converted[union], { type: 'object', nullable: true, enum: [null] }];
        delete converted.nullable;
      }
    }
    // In OAS3 nullable widens type, but enum must independently admit null.
    if (converted.nullable === true && Array.isArray(converted.enum) && !converted.enum.includes(null)) converted.enum = [...converted.enum, null];
  },
});
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
          ...(['post', 'patch', 'delete'].includes(method) ? [{ name: 'Origin', in: 'header', required: true, description: 'Musi być równy WEB_ORIGIN.', schema: { type: 'string', format: 'uri' } }] : []),
          ...(contract.historyQuery ? Object.entries(portfolioHistoryQuerySchema.shape).map(([name, schema]) => ({ name, in: 'query', required: false, description: 'UTC, zakres do366 dni; domyślnie ostatnie30 dni.', schema: jsonSchema(schema, 'input') })) : []),
          ...(contract.valuationQuery ? [{ name: 'asOf', in: 'query', required: false, description: 'UTC; domyślnie zegar serwera, przyszła data niedozwolona.', schema: jsonSchema(valuationTimeSchema, 'input') }] : []),
          ...(contract.ifMatch ? [{ name: 'If-Match', in: 'header', required: true, description: contract.ifMatch === 'entry' ? 'Aktualna revision wpisu z listy w cudzysłowie, np. "1".' : 'Aktualna revision w cudzysłowie, np. "0"; GET zwraca ETag i revision.', schema: { type: 'string', pattern: contract.ifMatch === 'entry' ? '^"[1-9][0-9]{0,9}"$' : '^"(0|[1-9][0-9]{0,9})"$' } }] : []),
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
