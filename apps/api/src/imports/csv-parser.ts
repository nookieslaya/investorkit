import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CSV_FIELD_LABELS, CSV_LIMITS, csvPreviewSchema, currencySchema, decimalSchema, fxRateSchema, ledgerOperationSchema } from '@investorkit/shared';
import type { CsvPreviewInput, CsvPreview, CsvField, Instrument, CsvParserAdapter } from '@investorkit/shared';
import { FinancialDecimal } from '@investorkit/portfolio-engine';
import { CashApiError } from '../domain-error.js';
type RecordRow = { cells: string[]; rowNumber: number; lineNumber: number };
type RowIssue = CsvPreview['rows'][number]['issues'][number];
function fail(code: string, message: string): never { throw new CashApiError(422, code, message); }
export function detectCsv(bytes: Uint8Array, fileName: string, adapterId: string) {
  if (adapterId === 'xtb-verified') return { status: 'unsupported' as const, reason: 'SAMPLE_REQUIRED' as const };
  if (bytes.length > CSV_LIMITS.bytes) return { status: 'unsupported' as const, reason: 'CSV_FILE_LIMIT' as const };
  if (!bytes.length) return { status: 'unsupported' as const, reason: 'CSV_EMPTY' as const };
  const starts = (signature: readonly number[]) => signature.every((value, index) => bytes[index] === value);
  if (/\.(xlsx?|pdf|zip)$/i.test(fileName) ||
      starts([0x50, 0x4b, 3, 4]) || starts([0x50, 0x4b, 5, 6]) || starts([0x50, 0x4b, 7, 8]) ||
      starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) || starts([0x25, 0x50, 0x44, 0x46, 0x2d]) ||
      (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    return { status: 'unsupported' as const, reason: 'CSV_UNSUPPORTED_FILE' as const };
  }
  return { status: 'needsMapping' as const };
}
/** Bounded state machine: RFC-style quotes, doubled quotes and embedded CR/LF. No eval/formulas. */
export function parseCsv(text: string, delimiter: ',' | ';' | '\t'): { records: RecordRow[]; blank: number } {
  const records: RecordRow[] = [];
  let cells: string[] = [], cell = '', state: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  let line = 1, startLine = 1, recordNumber = 1, blank = 0, dirty = false;
  const append = (value: string) => {
    if (cell.length + value.length > CSV_LIMITS.fieldChars) fail('CSV_FIELD_LIMIT', `Pole CSV przekracza limit ${CSV_LIMITS.fieldChars} znaków.`);
    cell += value;
  };
  const pushCell = () => {
    if (cells.length >= CSV_LIMITS.columns) fail('CSV_COLUMN_LIMIT', `Plik ma więcej niż ${CSV_LIMITS.columns} kolumn. Sprawdź separator.`);
    cells.push(cell); cell = ''; state = 'start';
  };
  const pushRow = () => {
    pushCell();
    if (cells.every(value => !value.trim())) blank++;
    else {
      if (records.length >= CSV_LIMITS.rows + 1) fail('CSV_ROW_LIMIT', `Plik przekracza limit ${CSV_LIMITS.rows} wierszy danych.`);
      records.push({ cells, rowNumber: recordNumber, lineNumber: startLine });
    }
    cells = []; dirty = false; recordNumber++;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '\0') fail('CSV_UNSUPPORTED_FILE', 'Plik zawiera dane binarne lub nieobsługiwane kodowanie. Wybierz zwykły plik CSV.');
    const newline = char === '\r' || char === '\n';
    const crlf = char === '\r' && text[i + 1] === '\n';
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') { append('"'); i++; } else state = 'closed';
      } else if (newline) { append(crlf ? '\r\n' : char); if (crlf) i++; line++; }
      else append(char);
      continue;
    }
    if (char === delimiter) { pushCell(); dirty = true; continue; }
    if (newline) { pushRow(); if (crlf) i++; line++; startLine = line; continue; }
    if (state === 'closed' || (char === '"' && state !== 'start')) fail('CSV_QUOTING', `Niepoprawne cudzysłowy w okolicy linii ${line}.`);
    if (char === '"') { state = 'quoted'; dirty = true; }
    else { append(char); state = 'plain'; dirty = true; }
  }
  if (state === 'quoted') fail('CSV_QUOTING', `Niezamknięty cudzysłów od linii ${startLine}.`);
  if (dirty || cells.length || cell.length) pushRow();
  return { records, blank };
}
function normalizeRow(row: RecordRow, input: CsvPreviewInput, instruments: readonly Instrument[], asOf: string, columnCount: number) {
  const issues: RowIssue[] = [];
  const issue = (field: CsvField | null, code: RowIssue['code'], message: string) => { issues.push({ field, code, message }); };
  const get = (field: CsvField, required = false) => {
    const index = input.mapping[field]; const value = index === undefined ? '' : row.cells[index]?.trim() ?? '';
    if (required && !value) issue(field, 'REQUIRED', `Wybierz kolumnę i uzupełnij: ${CSV_FIELD_LABELS[field]}.`);
    return value;
  };
  const amount = (field: CsvField, positive: boolean, fx = false) => {
    const raw = get(field, true);
    if (!raw) return '';
    const canonical = input.decimalSeparator === ',' ? raw.replace(',', '.') : raw;
    if (raw.includes(input.decimalSeparator === ',' ? '.' : ',') || !(fx ? fxRateSchema : decimalSchema).safeParse(canonical).success || (positive && /^0(?:\.0+)?$/.test(canonical))) {
      issue(field, 'INVALID_DECIMAL', `Niepoprawna liczba: ${CSV_FIELD_LABELS[field]}. Bez separatorów tysięcy; wymagane ${positive ? 'więcej niż zero' : 'zero lub więcej'}.`); return '';
    }
    return canonical;
  };
  const date = (field: 'occurredAt' | 'fxAsOf') => {
    const value = get(field, true);
    if (!value) return '';
    if (!z.iso.datetime({ offset: true }).safeParse(value).success) {
      issue(field, 'INVALID_DATE', 'Podaj datę ISO 8601 z godziną i strefą, np. 2026-01-15T12:30:00+01:00.'); return '';
    }
    const result = new Date(value).toISOString();
    if (Date.parse(result) > Date.parse(asOf)) issue(field, 'FUTURE_DATE', 'Data operacji lub kursu nie może pochodzić z przyszłości.');
    return result;
  };
  if (row.cells.length !== columnCount) issue(null, 'COLUMN_COUNT', `Liczba pól w wierszu (${row.cells.length}) różni się od liczby nagłówków (${columnCount}).`);
  const kind = get('kind', true), currency = get('currency', true), occurredAt = date('occurredAt');
  if (kind && !['BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL'].includes(kind)) issue('kind', 'INVALID_KIND', 'Rodzaj operacji musi mieć wartość BUY, SELL, DEPOSIT lub WITHDRAWAL.');
  if (currency && !currencySchema.safeParse(currency).success) issue('currency', 'INVALID_VALUE', 'Obsługiwane waluty: PLN, EUR i USD.');
  const note = get('note'); if (note.length > 300) issue('note', 'INVALID_VALUE', 'Notatka może mieć maksymalnie 300 znaków.');
  const sourceId = get('sourceId'); if (sourceId.length > 128) issue('sourceId', 'INVALID_VALUE', 'Identyfikator źródłowy może mieć maksymalnie 128 znaków.');
  let fxToBase = currency === 'PLN' && !get('fxToBase') ? '1' : amount('fxToBase', true, true);
  const fxAsOf = currency === 'PLN' && !get('fxAsOf') ? occurredAt : date('fxAsOf');
  if (currency === 'PLN' && fxToBase && FinancialDecimal.parseFxRate(fxToBase).compare(FinancialDecimal.parse('1')) !== 0) {
    issue('fxToBase', 'INVALID_VALUE', 'Kurs PLN do PLN musi wynosić 1.'); fxToBase = '';
  }
  if (fxAsOf && occurredAt && Date.parse(fxAsOf) > Date.parse(occurredAt)) issue('fxAsOf', 'FX_AFTER_OPERATION', 'Kurs historyczny nie może pochodzić z chwili późniejszej niż operacja.');
  const common = { kind, currency, occurredAt, fxToBase, fxAsOf, fxSource: 'manual', note };
  let raw: unknown = null;
  if (kind === 'DEPOSIT' || kind === 'WITHDRAWAL') raw = { ...common, amount: amount('amount', true) };
  if (kind === 'BUY' || kind === 'SELL') {
    const symbol = get('symbol', true), mic = get('mic', true);
    const matches = instruments.filter(item => item.symbol === symbol && item.mic === mic && item.currency === currency);
    if (symbol && mic && currencySchema.safeParse(currency).success) {
      if (matches.length === 0) issue('symbol', 'UNKNOWN_INSTRUMENT', 'Brak instrumentu o tym symbolu, MIC i walucie w Twoim portfelu. Dodaj go ręcznie przed dalszą weryfikacją.');
      if (matches.length > 1) issue('symbol', 'AMBIGUOUS_INSTRUMENT', 'Dopasowanie instrumentu nie jest jednoznaczne.');
    }
    const quantity = amount('quantity', true), unitPrice = amount('unitPrice', true), commission = amount('commission', false);
    const commissionCurrency = get('commissionCurrency', true);
    if (commissionCurrency && commissionCurrency !== currency) issue('commissionCurrency', 'CURRENCY_MISMATCH', 'Waluta prowizji musi odpowiadać walucie transakcji.');
    if (matches[0] && quantity && FinancialDecimal.parse(quantity).decimalPlaces() > matches[0].quantityScale) issue('quantity', 'INVALID_VALUE', 'Ilość przekracza precyzję ustawioną dla instrumentu.');
    raw = { ...common, instrumentId: matches[0]?.id, quantity, unitPrice, commission, commissionCurrency };
  }
  const parsed = ledgerOperationSchema.safeParse(raw);
  if (!parsed.success && issues.length === 0) issue(null, 'INVALID_VALUE', 'Wiersz nie odpowiada kontraktowi operacji.');
  return { ...row, sourceId: sourceId && sourceId.length <= 128 ? sourceId : null,
    operation: issues.length === 0 && parsed.success ? parsed.data : null, issues };
}
export function previewCsv(input: CsvPreviewInput, instruments: readonly Instrument[], asOf: string): CsvPreview {
  const bytes = Buffer.from(input.contentBase64, 'base64');
  if (bytes.toString('base64') !== input.contentBase64) fail('CSV_INVALID_BASE64', 'Niepoprawny plik. Wybierz go ponownie.');
  const detection = detectCsv(bytes, input.fileName, input.adapterId);
  if (detection.status === 'unsupported') fail(detection.reason, detection.reason === 'SAMPLE_REQUIRED'
    ? 'Adapter XTB wymaga zweryfikowanej próbki eksportu. Użyj ogólnego podglądu CSV.' : 'Plik jest pusty, zbyt duży albo ma nieobsługiwany format. Wybierz CSV do 5 MiB, bez zmiany rozszerzenia XLSX.');
  let text: string;
  try { text = new TextDecoder(input.encoding, { fatal: true }).decode(bytes); }
  catch { return fail('CSV_ENCODING', 'Nie udało się odczytać pliku w wybranym kodowaniu. Sprawdź UTF-8 lub Windows-1250.'); }
  const { records, blank } = parseCsv(text.replace(/^\uFEFF/, ''), input.delimiter);
  const header = records[0];
  if (!header) fail('CSV_EMPTY', 'Plik nie zawiera nagłówków ani danych.');
  const names = header.cells.map(value => value.trim());
  if (names.some(name => !name || name.length > 120) || new Set(names.map(name => name.toLowerCase())).size !== names.length) {
    fail('CSV_HEADERS', 'Nagłówki muszą być niepuste, unikalne i nie dłuższe niż 120 znaków. Sprawdź separator.');
  }
  if (Object.values(input.mapping).some(index => index !== undefined && index >= names.length)) fail('CSV_MAPPING', 'Mapowanie wskazuje kolumnę, której nie ma w bieżącym pliku.');
  const mapped = input.mapping.kind !== undefined && input.mapping.occurredAt !== undefined && input.mapping.currency !== undefined;
  const rows = records.slice(1).map(row => mapped ? normalizeRow(row, input, instruments, asOf, names.length) : { ...row, sourceId: null, operation: null, issues: [] });
  const invalid = mapped ? rows.filter(row => row.issues.length > 0).length : null;
  return csvPreviewSchema.parse({
    detection: mapped ? 'supported' : 'needs_mapping', canCommit: false, blockedReason: 'PREVIEW_ONLY', adapterId: 'generic-csv', adapterVersion: '1',
    fileName: input.fileName, fileSha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length,
    encoding: input.encoding, delimiter: input.delimiter, decimalSeparator: input.decimalSeparator, checkedAt: asOf,
    mapping: input.mapping, columns: names.map((name, index) => ({ index, name })),
    counts: { total: rows.length, blank, valid: invalid === null ? null : rows.length - invalid, invalid }, rows,
  });
}


export const genericCsvParser: CsvParserAdapter = Object.freeze<CsvParserAdapter>({
  id: 'generic-csv', version: '1', previewOnly: true,
  detect: (bytes, metadata) => detectCsv(bytes, metadata.fileName, metadata.adapterId),
  preview: previewCsv,
});
