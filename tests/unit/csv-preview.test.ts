import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSV_FIELDS, CSV_LIMITS, csvPreviewInputSchema } from '@investorkit/shared';
import type { CsvPreviewInput, Instrument } from '@investorkit/shared';
import { detectCsv, parseCsv, previewCsv } from '../../apps/api/src/imports/csv-parser.js';
const now = '2026-11-19T12:00:00.000Z';
const instrument: Instrument = { id: 'e7ef6555-5118-46ed-9553-7669da42aa2a', symbol: 'DEMO', mic: 'XWAR', currency: 'PLN', type: 'STOCK', name: 'Demo', quantityScale: 3, isin: null, issuerCountry: null, createdAt: '2026-01-01T00:00:00Z' };
const header = CSV_FIELDS.join(';');
const cash = 'DEPOSIT;2026-01-15T12:00:00+01:00;PLN;1000;;;;;;;;;wpłata;source-1';
const trade = 'BUY;2026-01-15T12:30:00+01:00;PLN;;DEMO;XWAR;0,125;80;0,5;PLN;;;zakup;source-2';
const mapping = Object.fromEntries(CSV_FIELDS.map((field, index) => [field, index]));
function input(text: string, extra: Partial<CsvPreviewInput> = {}): CsvPreviewInput {
  return csvPreviewInputSchema.parse({ fileName: 'test.csv', contentBase64: Buffer.from(text).toString('base64'), encoding: 'utf-8', delimiter: ';', decimalSeparator: ',', mapping: {}, ...extra });
}
// Only PLN uses identity FX for absent/blank values; foreign FX must be explicit.
const allMapping = { ...mapping }; delete allMapping.fxToBase; delete allMapping.fxAsOf;
const view = (text: string, extra: Partial<CsvPreviewInput> = {}) => previewCsv(input(text, extra), [instrument], now);
describe('bounded CSV reader', () => {
  it('handles escaped quotes, quoted separators, embedded CRLF and physical line provenance', () => {
    const parsed = parseCsv('kind;note\r\nDEPOSIT;"line1; value\r\nline2 ""quoted"""\r\n\r\nSELL;last', ';');
    expect(parsed.records[1]).toEqual({ rowNumber: 2, lineNumber: 2, cells: ['DEPOSIT', 'line1; value\r\nline2 "quoted"'] });
    expect(parsed.records[2]).toMatchObject({ rowNumber: 4, lineNumber: 5 }); expect(parsed.blank).toBe(1);
  });
  it.each(['a;b\n"unclosed', 'a;b\nplain"quote;1', 'a;b\n"closed"junk;1'])('rejects malformed quoting', text => expect(() => parseCsv(text, ';')).toThrow());
  it('accepts comma/tab, final empty cell and blank records without merging nonempty rows', () => {
    expect(parseCsv('a,b\r1,\r1,', ',').records).toHaveLength(3);
    expect(parseCsv('a\tb\n1\t2', '\t').records[1]?.cells).toEqual(['1', '2']);
  });
  it('limits columns, field length and data row count', () => {
    expect(() => parseCsv(Array(65).fill('x').join(';'), ';')).toThrow();
    expect(() => parseCsv('a\n'+ 'x'.repeat(CSV_LIMITS.fieldChars + 1), ';')).toThrow();
    expect(parseCsv('a\n' + '1\n'.repeat(10000), ';').records).toHaveLength(10001);
    expect(() => parseCsv('a\n' + '1\n'.repeat(10001), ';')).toThrow();
  });
  it('detects XLSX/OLE/PDF/UTF16 and keeps XTB disabled even when the filename says CSV', () => {
    for (const bytes of [[0x50,0x4b,3,4],[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1],[0x25,0x50,0x44,0x46,0x2d],[0xff,0xfe]]) expect(detectCsv(new Uint8Array(bytes),'file.csv','generic-csv').status).toBe('unsupported');
    expect(detectCsv(Buffer.from('a;b'), 'file.csv', 'xtb-verified')).toEqual({ status: 'unsupported', reason: 'SAMPLE_REQUIRED' });
    expect(detectCsv(Buffer.from('PKO;amount\nX;1'), 'file.csv', 'generic-csv').status).toBe('needsMapping');
    expect(detectCsv(Buffer.from('%Profit;amount\nX;1'), 'file.csv', 'generic-csv').status).toBe('needsMapping');
    expect(detectCsv(new Uint8Array(), 'empty.csv', 'generic-csv').status).toBe('unsupported');
    expect(detectCsv(new Uint8Array(CSV_LIMITS.bytes+1),'large.csv','generic-csv').status).toBe('unsupported');
  });
  it('rejects invalid UTF8, accepts explicit Windows1250 and removes UTF8 BOM', () => {
    const encoded = input('a\nb'); encoded.contentBase64 = Buffer.from([0x6e,0x6f,0x74,0x65,10,0xb9]).toString('base64');
    expect(() => previewCsv(encoded,[],now)).toThrow();
    expect(previewCsv({ ...encoded, encoding: 'windows-1250' },[],now).rows[0]?.cells[0]).toBe('ą');
    expect(view('\uFEFFa\n1').columns[0]?.name).toBe('a');
  });
  it('requires unique nonempty headers, validates mapping bounds and column counts', () => {
    for (const text of ['a;a\n1;2','a;\n1;2','\n\n']) expect(() => view(text)).toThrow();
    expect(() => view('a\n1',{mapping:{kind:1}})).toThrow();
    const result = view(header+'\n'+cash+';extra',{mapping:allMapping});
    expect(result.rows[0]?.issues.some(x=>x.code==='COLUMN_COUNT')).toBe(true);
  });
});
describe('generic financial preview without commit', () => {
  it('does not claim validation before required columns have been mapped', () => {
    const result = view(header+'\n'+cash);
    expect(result.detection).toBe('needs_mapping'); expect(result.counts.valid).toBeNull(); expect(result.counts.invalid).toBeNull();
    expect(result.canCommit).toBe(false); expect(result.rows[0]?.operation).toBeNull();
  });
  it('normalizes cash, trade, explicit decimal comma and UTC without rounding or an inferred foreign FX', () => {
    const result = view(header+'\n'+cash+'\n'+trade,{mapping:allMapping});
    expect(result.counts).toMatchObject({ total:2, valid:2, invalid:0 });
    expect(result.rows[0]?.operation).toMatchObject({ kind:'DEPOSIT',amount:'1000',occurredAt:'2026-01-15T11:00:00.000Z',fxToBase:'1' });
    expect(result.rows[1]?.operation).toMatchObject({ instrumentId:instrument.id,quantity:'0.125',unitPrice:'80',commission:'0.5' });
    expect(result.fileSha256).toMatch(/^[a-f0-9]{64}$/); expect(result.rows[1]?.sourceId).toBe('source-2');
    expect(result.canCommit).toBe(false);
  });
  it('preserves all decimal digits and identical legal rows as distinct source records', () => {
    const row = cash.replace('1000','99999999999999999,1234567890');
    const result = view(header+'\n'+row+'\n'+row,{mapping:allMapping});
    expect(result.rows).toHaveLength(2); expect(result.counts.valid).toBe(2);
    expect(result.rows[0]?.operation).toHaveProperty('amount','99999999999999999.1234567890');
    expect(result.rows[0]?.rowNumber).not.toBe(result.rows[1]?.rowNumber);
  });
  it('does not invent commission, FX, timezone or an instrument match', () => {
    for (const text of [trade.replace(';0,5;',';;'),trade.replace(';DEMO;',';OTHER;'),trade.replace(';XWAR;',';XNAS;'),trade.replace('+01:00',''),trade.replace(';PLN;;',';EUR;;')]) {
      const result = view(header+'\n'+text,{mapping:allMapping});
      expect(result.counts.invalid).toBe(1); expect(result.rows[0]?.operation).toBeNull();
    }
  });
  it('validates commission currency, quantity scale, future dates, and historical FX order', () => {
    const cases = [trade.replace(';0,5;PLN;',';0,5;USD;'),trade.replace('0,125','0,1251'),trade.replace('2026-01-15','2099-01-15')];
    for (const text of cases) expect(view(header+'\n'+text,{mapping:allMapping}).counts.invalid).toBe(1);
    const fx = cash.replace(';1000;', ';1000;').split(';'); fx[10]='1'; fx[11]='2026-01-16T12:00:00+01:00';
    expect(view(header+'\n'+fx.join(';'),{mapping}).rows[0]?.issues.some(x=>x.code==='FX_AFTER_OPERATION')).toBe(true);
  });
  it('uses an exact MIC/currency identity and leaves formulas/HTML as literal text', () => {
    const formula = '=HYPERLINK("https://example.invalid","<img src=x>")';
    const record = cash.split(';'); record[12]='"'+formula.replaceAll('"','""')+'"';
    const result = view(header+'\n'+record.join(';'),{mapping:allMapping});
    expect(result.rows[0]?.operation).toHaveProperty('note',formula);
    const mismatch = previewCsv(input(header+'\n'+trade,{mapping:allMapping}),[{...instrument,mic:'XNAS'}],now);
    expect(mismatch.rows[0]?.issues.some(x=>x.code==='UNKNOWN_INSTRUMENT')).toBe(true);
  });
  it('keeps the downloadable generic example readable, with an explicitly unknown demo instrument', () => {
    const sample = readFileSync(new URL('../../apps/web/public/examples/import-preview.csv',import.meta.url),'utf8');
    const result = previewCsv(input(sample,{mapping:allMapping}),[],now);
    expect(result.counts).toMatchObject({total:3,valid:2,invalid:1});
    expect(result.rows[1]?.issues.some(x=>x.code==='UNKNOWN_INSTRUMENT')).toBe(true);
  });
});


it('does not interpret the other decimal separator or grouped thousands as a price', () => {
  for (const value of ['100.25','1.000','1 000,25','1.000,25']) {
    expect(view(header+'\n'+cash.replace('1000',value),{mapping:allMapping}).counts.invalid).toBe(1);
  }
});


it('validates base64 near the full upload limit without nested regex backtracking', () => {
  const encoded = Buffer.alloc(CSV_LIMITS.bytes, 65).toString('base64');
  const request = input('a\nb'); request.contentBase64 = encoded;
  expect(csvPreviewInputSchema.safeParse(request).success).toBe(true);
  expect(csvPreviewInputSchema.safeParse({ ...request, contentBase64: encoded.slice(0,-1)+'!' }).success).toBe(false);
});
