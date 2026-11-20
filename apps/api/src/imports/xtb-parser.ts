import { createHash } from 'node:crypto';
import { z } from 'zod';
import { XTB_SHEETS, XLSX_LIMITS, xtbPreviewSchema } from '@investorkit/shared';
import type { XtbPreviewInput, XtbPreview } from '@investorkit/shared';
import { FinancialDecimal } from '@investorkit/portfolio-engine';
import { MAIN, RELS, DOC_RELS, child, children, readXlsxArchive, readXmlParts, readSheet, richText, xlsxFail } from './xlsx-reader.js';
import type { XlsxCell, XlsxRows, XmlNode } from './xlsx-reader.js';
import { XTB_HEADERS } from './xtb-layout.js';

const layout = () => xlsxFail('XTB_LAYOUT_UNSUPPORTED', 'Nie rozpoznano obsługiwanego angielskiego układu XTB. Wymagane: Closed Positions, Cash Operations i Open Positions, z nagłówkami w wierszu 5.');
const iso = z.iso.datetime({ offset: true });
function date(cell: XlsxCell | undefined): string | null {
  if (!cell?.value) return null;
  if (cell.type === 'd') return iso.safeParse(cell.value).success ? new Date(cell.value).toISOString() : null;
  if (cell.type !== 'n' || !/^\d{1,6}(?:\.\d{1,15})?$/.test(cell.value)) return null;
  const [days, fraction = ''] = cell.value.split('.');
  if (BigInt(days!) < 61n) return null; // The fictitious Excel 1900-02-29 is not a real date.
  const scale = 10n ** BigInt(fraction.length);
  const milliseconds = BigInt(days!) * 86400000n + (BigInt(fraction || '0') * 86400000n + scale / 2n) / scale;
  return new Date(Date.UTC(1899, 11, 30) + Number(milliseconds)).toISOString();
}
function part(parts: Map<string, XmlNode>, name: string): XmlNode { const value = parts.get(name); if (!value) return layout(); return value; }
const value = (rows: XlsxRows, row: number, col: number) => rows.get(row)?.get(col)?.value ?? '';
const parseDecimal = (value: string) => { try { return FinancialDecimal.parse(value); } catch { return null; } };
function parseRows(name: typeof XTB_SHEETS[number], source: XlsxRows, asOf: string, from: string, to: string): XtbPreview['sheets'][number] {
  const columns: string[] = [...XTB_HEADERS[name]];
  const headers = source.get(5);
  if (!headers || headers.size !== columns.length || columns.some((label, i) => headers.get(i)?.value !== label)) return layout();
  const idCounts = new Map<string, number>();
  if (name === 'Cash Operations') {
    for (const [row] of source) if (row > 5) { const id = value(source, row, columns.indexOf('ID')); if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1); }
  }
  const rows: XtbPreview['sheets'][number]['rows'] = [];
  for (const [rowNumber, cells] of [...source].sort((a, b) => a[0] - b[0])) {
    if (rowNumber <= 5 || ![...cells.values()].some(cell => cell.value !== '')) continue;
    if ([...cells.keys()].some(col => col >= columns.length)) return layout();
    const values = columns.map((_, col) => cells.get(col)?.value ?? '');
    const get = (label: string) => values[columns.indexOf(label)] ?? '';
    let role: 'record' | 'summary' | 'group' = 'record';
    if (name === 'Closed Positions' && get('Instrument') === 'Profit/loss' && !get('Ticker') && !get('Type') && !get('Volume') && !get('Position ID')) role = 'summary';
    if (name === 'Open Positions' && !get('Type') && get('Ticker') && get('Instrument/Position') && !/^\d+$/.test(get('Instrument/Position'))) role = 'group';
    const issues: string[] = [], dates: Record<string, string> = {};
    if (role === 'record') {
      const required = name === 'Cash Operations' ? ['ID', 'Type', 'Time', 'Amount'] : name === 'Closed Positions'
        ? ['Position ID', 'Ticker', 'Type', 'Volume', 'Open Price', 'Open Time (UTC)', 'Close Price', 'Close Time (UTC)', 'Commission']
        : ['Instrument/Position', 'Ticker', 'Type', 'Volume', 'Open price', 'Open time (UTC)', 'Open Commission'];
      if (required.some(label => !get(label))) issues.push('Brakuje wymaganych danych operacji lub partii.');
      const id = get(name === 'Cash Operations' ? 'ID' : name === 'Closed Positions' ? 'Position ID' : 'Instrument/Position');
      if (id && !/^\d{1,32}$/.test(id)) issues.push('Identyfikator musi być zapisany bez notacji wykładniczej.');
      if (name === 'Cash Operations') {
        if (!['Deposit', 'Withdrawal', 'Stock purchase', 'Stock sell'].includes(get('Type'))) issues.push('Ten rodzaj operacji nie jest jeszcze obsługiwany. Wiersz pozostaje w podglądzie.');
        if ((idCounts.get(id) ?? 0) > 1) issues.push('Identyfikator powtarza się w pliku. Wiersze nie zostały scalone ani zapisane.');
        const amount = parseDecimal(get('Amount'));
        if (amount && ['Deposit', 'Stock sell', 'Withdrawal', 'Stock purchase'].includes(get('Type'))) {
          const positive = ['Deposit', 'Stock sell'].includes(get('Type'));
          if (amount.compare(FinancialDecimal.parse('0')) === 0 || (amount.compare(FinancialDecimal.parse('0')) > 0) !== positive) issues.push('Znak kwoty nie odpowiada rodzajowi operacji.');
        }
      } else if (get('Type') !== 'BUY') issues.push('Ten podgląd nie potwierdza obsługi pozycji krótkich ani innego kierunku niż BUY.');
      for (const label of name === 'Cash Operations' ? [] : ['Volume', name === 'Closed Positions' ? 'Open Price' : 'Open price']) {
        const numeric = parseDecimal(get(label));
        if (numeric && numeric.compare(FinancialDecimal.parse('0')) <= 0) issues.push(`Wartość ${label} musi być większa od zera.`);
      }
    }
    if (get('Category') && !['Stocks', 'ETF'].includes(get('Category'))) issues.push('Nieobsługiwana kategoria instrumentu. Brak importu CFD i instrumentów z dźwignią.');
    columns.forEach((label, i) => {
      if (!values[i]) return;
      if (/time/i.test(label)) {
        const parsed = date(cells.get(i));
        if (!parsed) issues.push(`Niepoprawna data w kolumnie ${label}.`);
        else { dates[String(i)] = parsed; if (parsed > asOf || parsed > to || ((label === 'Time' || label === 'Close Time (UTC)') && parsed < from)) issues.push(`Data ${label} poza okresem raportu lub z przyszłości.`); }
      } else if (/^(Amount|Volume|Value|.*[Pp]rice|.*[Pp]rofit.*|Profit\/Loss|Purchase Value|Sale Value|Commission|Open Commission|Swap|Rollover|.*Conversion Rate|Margin|Stop Loss|Take Profit)$/.test(label)) {
        const valid = label === 'Net Profit %' ? /^-?(0|[1-9]\d{0,17})(\.\d{1,40})?$/.test(values[i]!) : parseDecimal(values[i]!);
        if (cells.get(i)?.type !== 'n' || !valid) issues.push(`Niepoprawna liczba lub precyzja w kolumnie ${label}.`);
      }
    });
    rows.push({ rowNumber, role, cells: values, dates, issues: [...new Set(issues)].slice(0, 20) });
  }
  return { name, columns, rows };
}

export function previewXtb(input: XtbPreviewInput, asOf: string): XtbPreview {
  if (!/\.xlsx$/i.test(input.fileName)) xlsxFail('XLSX_FILE', 'Wybierz plik .xlsx. XLS, PDF i CSV nie są plikami XLSX.');
  const bytes = Buffer.from(input.contentBase64, 'base64');
  if (!bytes.length || bytes.length > XLSX_LIMITS.bytes || bytes.toString('base64') !== input.contentBase64) xlsxFail('XLSX_FILE', 'Niepoprawne bajty pliku lub przekroczony limit 5 MiB.');
  const parts = readXmlParts(readXlsxArchive(bytes));
  const types = part(parts, '[Content_Types].xml');
  const typeUri = 'http://schemas.openxmlformats.org/package/2006/content-types';
  const workbookTypes = children(types, 'Override', typeUri).filter(node => node.attrs.PartName === '/xl/workbook.xml');
  const defaults = children(types, 'Default', typeUri).filter(node => node.attrs.Extension === 'xml');
  if (types.uri !== typeUri || types.name !== 'Types' || workbookTypes.length > 1 || defaults.length > 1 || (workbookTypes[0] ?? defaults[0])?.attrs.ContentType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml') return layout();
  const roots = children(part(parts, '_rels/.rels'), 'Relationship', RELS);
  if (roots.filter(rel => rel.attrs.Type === `${DOC_RELS}/officeDocument` && rel.attrs.Target?.replace(/^\//, '') === 'xl/workbook.xml').length !== 1) return layout();
  const workbook = part(parts, 'xl/workbook.xml');
  if (workbook.uri !== MAIN || workbook.name !== 'workbook' || children(workbook, 'workbookPr').some(node => node.attrs.date1904 !== undefined && !['0', 'false'].includes(node.attrs.date1904))) xlsxFail('XLSX_DATE_SYSTEM', 'Nieobsługiwany skoroszyt lub system dat 1904.');
  const references = children(child(workbook, 'sheets'), 'sheet');
  if (references.length !== 3 || references.some((sheet, i) => sheet.attrs.name !== XTB_SHEETS[i] || (sheet.attrs.state && sheet.attrs.state !== 'visible'))) return layout();
  const relations = children(part(parts, 'xl/_rels/workbook.xml.rels'), 'Relationship', RELS);
  const shared = parts.get('xl/sharedStrings.xml');
  if (shared && (shared.name !== 'sst' || shared.uri !== MAIN)) return layout();
  const strings = shared ? children(shared, 'si').map(richText) : [];
  if (strings.length > XLSX_LIMITS.cells) xlsxFail('XLSX_LIMIT', 'Za dużo wspólnych tekstów w XLSX.');
  const budget = { rows: 0, cells: 0 }; const used = new Set<string>();
  let accountId = '', from = '', to = '';
  const sheets = references.map((ref, index) => {
    const id = ref.attrs[`{${DOC_RELS}}id`];
    const relation = relations.find(rel => rel.attrs.Id === id && rel.attrs.Type === `${DOC_RELS}/worksheet`);
    if (!relation?.attrs.Target) return layout();
    const target = relation.attrs.Target.startsWith('/') ? relation.attrs.Target.slice(1) : `xl/${relation.attrs.Target}`;
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(target) || used.has(target)) return layout(); used.add(target);
    const rows = readSheet(part(parts, target), strings, budget);
    if (value(rows, 1, 0) !== 'Account number' || value(rows, 2, 0) !== XTB_SHEETS[index] || value(rows, 3, 0) !== 'Date from (UTC)' || value(rows, 4, 0) !== 'Date to (UTC)') return layout();
    const account = value(rows, 1, 1), start = date(rows.get(3)?.get(1)), end = date(rows.get(4)?.get(1));
    if (!/^\d{1,32}$/.test(account) || !start || !end || start > end || end > asOf) xlsxFail('XTB_METADATA', 'Niepoprawne konto lub daty raportu. Przyszłe daty nie są obsługiwane.');
    if (index === 0) { accountId = account; from = start; to = end; }
    else if (accountId !== account || from !== start || to !== end) xlsxFail('XTB_METADATA', 'Arkusze dotyczą różnych kont lub zakresów dat.');
    return parseRows(XTB_SHEETS[index]!, rows, asOf, from, to);
  });
  const count = (name: typeof XTB_SHEETS[number]) => sheets.find(sheet => sheet.name === name)!.rows.filter(row => row.role === 'record').length;
  return xtbPreviewSchema.parse({ adapterId: 'xtb-xlsx-layout-v1', adapterVersion: '1', canCommit: false, blockedReason: 'PREVIEW_ONLY', compatibility: 'DOCUMENTED_LAYOUT_ONLY',
    fileName: input.fileName, fileSha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length, checkedAt: asOf,
    accountId, accountCurrency: input.accountCurrency, cashTimeZone: 'UTC', from, to,
    warnings: ['Rozpoznano jeden udokumentowany układ XLSX. Zgodność z eksportem Twojego konta nie została jeszcze potwierdzona.',
      'To podgląd danych źródłowych. Nie sprawdza sald, kompletności historii, duplikatów między plikami ani mapowania instrumentów. Nie zapisuje transakcji.',
      'Walutę rachunku i UTC dla operacji gotówkowych potwierdzasz samodzielnie. Waluty notowań i historyczny FX nie są odgadywane; wynik portfela nie jest obliczany.'],
    counts: { cashOperations: count('Cash Operations'), openLots: count('Open Positions'), closedLots: count('Closed Positions'), rowsWithIssues: sheets.flatMap(sheet => sheet.rows).filter(row => row.issues.length).length }, sheets });
}
