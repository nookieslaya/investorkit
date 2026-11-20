import { describe, expect, it } from 'vitest';
import { xtbPreviewInputSchema } from '@investorkit/shared';
import { previewXtb } from '../../apps/api/src/imports/xtb-parser.js';
import { readXlsxArchive, readXmlParts } from '../../apps/api/src/imports/xlsx-reader.js';
import { cellValue, editXlsx, xtbBytes, zipEntries } from '../xlsx-fixture.js';

const asOf = '2026-11-20T12:00:00.000Z';
const input = (bytes: Buffer = xtbBytes) => xtbPreviewInputSchema.parse({ fileName: 'synthetic.xlsx', contentBase64: bytes.toString('base64'), accountCurrency: 'PLN', confirmCashTimesUtc: true });
const preview = (bytes: Buffer = xtbBytes) => previewXtb(input(bytes), asOf);
function rejects(bytes: Buffer, code: string) { expect(() => preview(bytes)).toThrow(expect.objectContaining({code})); }

describe('one documented XTB XLSX layout, transient source preview', () => {
  it('reads all three sheets without counting groups, totals or repeated position IDs as new transactions', () => {
    const result = preview();
    expect(result.counts).toEqual({cashOperations:8,openLots:3,closedLots:2,rowsWithIssues:0});
    expect(result.canCommit).toBe(false); expect(result.compatibility).toBe('DOCUMENTED_LAYOUT_ONLY');
    expect(result.sheets[0]?.rows.at(-1)?.role).toBe('summary');
    expect(result.sheets[2]?.rows.filter(row => row.role === 'group')).toHaveLength(2);
    expect(result.sheets[1]?.rows[0]?.dates['4']).toBe('2026-01-10T10:00:00.000Z');
    expect(result.sheets[2]?.rows[2]?.cells[5]).toBe('2.5');
    expect(result).not.toHaveProperty('totalValueBase'); expect(result).not.toHaveProperty('balance');
  });
  it('preserves exact financial text and literal formula-like text without executing or rounding it', () => {
    const edited = editXlsx('xl/worksheets/sheet2.xml', xml => cellValue(cellValue(xml,'F7','-1000.1234567890'),'H7','=HYPERLINK(&quot;https://example.invalid&quot;,&quot;&lt;script&gt;&quot;)','str'));
    const row = preview(edited).sheets[1]!.rows[1]!;
    expect(row.cells[5]).toBe('-1000.1234567890'); expect(row.cells[7]).toContain('<script>'); expect(row.issues).toEqual([]);
  });
  it('requires explicit currency/UTC and rejects forged import fields', () => {
    expect(xtbPreviewInputSchema.safeParse({...input(),confirmCashTimesUtc:false}).success).toBe(false);
    expect(xtbPreviewInputSchema.safeParse({...input(),accountCurrency:undefined}).success).toBe(false);
    expect(xtbPreviewInputSchema.safeParse({...input(),ownerId:'forged'}).success).toBe(false);
    expect(previewXtb({...input(),accountCurrency:'USD'},asOf).accountCurrency).toBe('USD');
    expect(previewXtb({...input(),accountCurrency:'USD'},asOf)).not.toHaveProperty('fxToBase');
  });
  it('supports shared rich text, inline literal text and offset ISO dates without losing their contents', () => {
    const parts = readXlsxArchive(xtbBytes);
    parts.set('xl/sharedStrings.xml',Buffer.from('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>Stock </t></r><r><t>purchase</t></r></si></sst>'));
    const sheet = parts.get('xl/worksheets/sheet2.xml')!.toString();
    const edited = cellValue(cellValue(cellValue(sheet,'A7','0','s'),'H7','inline-note','inlineStr'),'E6','2026-01-10T11:00:00+01:00','d').replace('<v>inline-note</v>','<is><t>note &amp; literal\ntext</t></is>');
    parts.set('xl/worksheets/sheet2.xml',Buffer.from(edited));
    const result = preview(zipEntries([...parts]));
    expect(result.sheets[1]!.rows[1]!.cells[0]).toBe('Stock purchase');
    expect(result.sheets[1]!.rows[1]!.cells[7]).toBe('note & literal\ntext');
    expect(result.sheets[1]!.rows[0]!.dates['4']).toBe('2026-01-10T10:00:00.000Z');
    expect(result.counts.rowsWithIssues).toBe(0);
  });
  it('retains unsupported cash events and both duplicate source IDs with visible diagnostics', () => {
    const edited = editXlsx('xl/worksheets/sheet2.xml', xml => cellValue(cellValue(xml,'A6','Dividend','str'),'G7','1000000101'));
    const result = preview(edited);
    expect(result.sheets[1]!.rows).toHaveLength(8);
    expect(result.sheets[1]!.rows[0]!.issues.join(' ')).toContain('rodzaj operacji');
    expect(result.sheets[1]!.rows[1]!.issues.join(' ')).toContain('powtarza');
  });
  it('diagnoses missing/negative quantity, precision/exponent, date and direction without producing zeros', () => {
    const edited = editXlsx('xl/worksheets/sheet3.xml', xml => cellValue(cellValue(cellValue(xml,'F7','-1'),'I8','1e2'),'J10','0'));
    const result = preview(edited);
    expect(result.counts.rowsWithIssues).toBe(3);
    expect(result.sheets[2]!.rows[1]!.cells[5]).toBe('-1');
    expect(result.sheets[2]!.rows[2]!.issues.join(' ')).toContain('liczba');
    expect(result.sheets[2]!.rows[4]!.issues.join(' ')).toContain('data');
  });
  it('does not invent older/localized headers or inconsistent account/range metadata', () => {
    rejects(editXlsx('xl/workbook.xml', xml => xml.replace('Closed Positions','CLOSED POSITION HISTORY')), 'XTB_LAYOUT_UNSUPPORTED');
    rejects(editXlsx('xl/worksheets/sheet2.xml', xml => cellValue(xml,'B1','99999999')), 'XTB_METADATA');
    rejects(editXlsx('xl/worksheets/sheet2.xml', xml => cellValue(xml,'B4','80000')), 'XTB_METADATA');
    rejects(editXlsx('xl/workbook.xml', xml => xml.replace(/(<[^>]*sheets>)/, '<workbookPr xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" date1904="1"/>$1')), 'XLSX_DATE_SYSTEM');
  });
  it('flags dates outside the cash interval but permits an open lot bought before the report start', () => {
    const early = preview(editXlsx('xl/worksheets/sheet3.xml', xml => cellValue(xml,'J7','45000')));
    expect(early.sheets[2]!.rows[1]!.issues).toEqual([]);
    const cash = preview(editXlsx('xl/worksheets/sheet2.xml', xml => cellValue(xml,'E6','45000')));
    expect(cash.sheets[1]!.rows[0]!.issues.join(' ')).toContain('poza okresem');
  });
  it('refuses formulas, Excel errors, DTD/entities and malformed XML instead of cached values', () => {
    rejects(editXlsx('xl/worksheets/sheet2.xml', xml => xml.replace('</x:worksheet>','<x:extLst><x:f>1+1</x:f></x:extLst></x:worksheet>')), 'XLSX_FORMULA');
    rejects(editXlsx('xl/worksheets/sheet2.xml', xml => cellValue(xml,'F7','#DIV/0!','e')), 'XLSX_CELL');
    rejects(editXlsx('xl/workbook.xml', xml => xml.replace(/(<[^?][^>]*workbook\b)/, '<!DOCTYPE workbook [<!ENTITY x SYSTEM "file:///etc/passwd">]>$1')), 'XLSX_CONTENT');
    rejects(editXlsx('xl/workbook.xml', xml => xml.slice(0,-5)), 'XLSX_XML');
  });
  it('rejects external/ambiguous relationships, invalid shared string references and duplicate cells', () => {
    rejects(editXlsx('xl/_rels/workbook.xml.rels', xml => xml.replace('Target=', 'TargetMode="External" Target=')), 'XLSX_CONTENT');
    rejects(editXlsx('xl/worksheets/sheet2.xml', xml => cellValue(xml,'A6','99999','s')), 'XLSX_CELL');
    rejects(editXlsx('xl/worksheets/sheet2.xml', xml => xml.replace('r="F7"','r="E7"')), 'XLSX_LIMIT');
  });
  it('checks signatures, checksum, truncation, encrypted flags and duplicate/traversal entries', () => {
    rejects(Buffer.from('not an archive'), 'XLSX_ARCHIVE'); rejects(xtbBytes.subarray(0,-5), 'XLSX_ARCHIVE');
    const crc = Buffer.from(xtbBytes); crc[14] = crc[14]! ^ 1; rejects(crc, 'XLSX_ARCHIVE');
    const encrypted = Buffer.from(xtbBytes); encrypted.writeUInt16LE(1,6); rejects(encrypted,'XLSX_ARCHIVE');
    rejects(zipEntries([['../escape.xml',Buffer.from('<a/>')]]),'XLSX_ARCHIVE');
    rejects(zipEntries([['same.xml',Buffer.from('<a/>')],['same.xml',Buffer.from('<a/>')]]),'XLSX_ARCHIVE');
    rejects(zipEntries([['vba.bin',Buffer.from('macro')]]),'XLSX_CONTENT');
  });
  it('bounds expanded data even when ZIP size declarations lie', () => {
    const bomb = zipEntries([['large.xml',Buffer.alloc(8*1024*1024+1,32)]]);
    expect(()=>readXlsxArchive(bomb)).toThrow(expect.objectContaining({code:'XLSX_LIMIT'}));
    const lie = zipEntries([['large.xml',Buffer.alloc(1024*1024,32)]]);
    const central = lie.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])); lie.writeUInt32LE(1,22); lie.writeUInt32LE(1,central+24);
    expect(()=>readXlsxArchive(lie)).toThrow(expect.objectContaining({code:'XLSX_ARCHIVE'}));
    const many = zipEntries(Array.from({length:65},(_,i):[string,Buffer]=>[`${i}.xml`,Buffer.from('<a/>')]));
    expect(()=>readXlsxArchive(many)).toThrow(expect.objectContaining({code:'XLSX_ARCHIVE'}));
  });
  it('bounds XML depth and text and refuses ambiguous rich-text encodings', () => {
    expect(()=>readXmlParts(new Map([['a.xml',Buffer.from('<a>'.repeat(33)+'</a>'.repeat(33))]]))).toThrow(expect.objectContaining({code:'XLSX_LIMIT'}));
    expect(()=>readXmlParts(new Map([['a.xml',Buffer.from('<a>'+'x'.repeat(16385)+'</a>')]]))).toThrow(expect.objectContaining({code:'XLSX_LIMIT'}));
    rejects(editXlsx('xl/sharedStrings.xml',()=>'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>one</t><r><t>two</t></r></si></sst>'),'XLSX_CELL');
  });
});
