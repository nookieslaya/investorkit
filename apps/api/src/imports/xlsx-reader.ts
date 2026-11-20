import { crc32, inflateRawSync } from 'node:zlib';
import { SaxesParser } from 'saxes';
import { CSV_LIMITS, XLSX_LIMITS } from '@investorkit/shared';
import { CashApiError } from '../domain-error.js';

export function xlsxFail(code: string, message: string): never { throw new CashApiError(422, code, message); }
const invalidZip = () => xlsxFail('XLSX_ARCHIVE', 'Niepoprawny lub nieobsługiwany kontener XLSX. Wybierz oryginalny plik .xlsx.');
const decoder = new TextDecoder('utf-8', { fatal: true });
export function utf8(bytes: Uint8Array): string {
  try { return decoder.decode(bytes); } catch { return xlsxFail('XLSX_ENCODING', 'Dokument XML w XLSX musi być zapisany w UTF-8.'); }
}

// Never extract entries to disk, resolve URLs or trust declared ZIP sizes.
// This deliberately supports only bounded, single-disk ZIP32 with STORE/DEFLATE.
export function readXlsxArchive(bytes: Buffer): Map<string, Buffer> {
  if (bytes.length < 22 || bytes.length > XLSX_LIMITS.bytes || bytes.readUInt32LE(0) !== 0x04034b50) invalidZip();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0) invalidZip();
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12), central = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || count !== bytes.readUInt16LE(end + 8) || !count || count > XLSX_LIMITS.entries || central + centralSize !== end) invalidZip();
  const parts = new Map<string, Buffer>(); const spans: [number, number][] = [];
  let offset = central, expanded = 0;
  for (let entry = 0; entry < count; entry++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) invalidZip();
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), checksum = bytes.readUInt32LE(offset + 16);
    const compressed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24), nameSize = bytes.readUInt16LE(offset + 28);
    const extraSize = bytes.readUInt16LE(offset + 30), commentSize = bytes.readUInt16LE(offset + 32), local = bytes.readUInt32LE(offset + 42);
    if ((flags & ~0x0808) || ![0, 8].includes(method) || bytes.readUInt16LE(offset + 34) || !nameSize || offset + 46 + nameSize + extraSize + commentSize > end) invalidZip();
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameSize), name = utf8(nameBytes);
    if (name.length > 200 || !/^[A-Za-z0-9_\-.[\]/]+$/.test(name) || name.startsWith('/') || name.split('/').some(segment => segment === '..' || segment === '.') || parts.has(name)) invalidZip();
    if (size > XLSX_LIMITS.partBytes || (expanded += size) > XLSX_LIMITS.expandedBytes) xlsxFail('XLSX_LIMIT', 'Rozpakowany XLSX przekracza limit 8 MiB na część lub 16 MiB łącznie.');
    if (local + 30 > central || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) invalidZip();
    const localNameSize = bytes.readUInt16LE(local + 26), start = local + 30 + localNameSize + bytes.readUInt16LE(local + 28), finish = start + compressed;
    if (finish > central || !bytes.subarray(local + 30, local + 30 + localNameSize).equals(nameBytes)) invalidZip();
    if (!(flags & 8) && (bytes.readUInt32LE(local + 14) !== checksum || bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== size)) invalidZip();
    spans.push([local, finish]);
    let data: Buffer;
    try { data = method === 0 ? bytes.subarray(start, finish) : inflateRawSync(bytes.subarray(start, finish), { maxOutputLength: Math.max(1, size) }); }
    catch { return invalidZip(); }
    if (data.length !== size || crc32(data) !== checksum) invalidZip();
    if (!name.endsWith('/') && !/\.(?:xml|rels)$/.test(name)) xlsxFail('XLSX_CONTENT', 'Ten podgląd nie obsługuje makr, osadzonych obiektów ani dodatkowych plików w XLSX.');
    parts.set(name, data); offset += 46 + nameSize + extraSize + commentSize;
  }
  if (offset !== end) invalidZip();
  spans.sort((a, b) => a[0] - b[0]);
  if (spans[0]?.[0] !== 0 || spans.some((span, i) => i > 0 && span[0] < spans[i - 1]![1])) invalidZip();
  return parts;
}

export interface XmlNode { name: string; uri: string; attrs: Record<string, string>; text: string; children: XmlNode[] }
export const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const DOC_RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const children = (node: XmlNode, name: string, uri = MAIN) => node.children.filter(child => child.name === name && child.uri === uri);
export function child(node: XmlNode, name: string, uri = MAIN): XmlNode {
  const matches = children(node, name, uri);
  if (matches.length !== 1) xlsxFail('XLSX_XML', 'Brak lub powtórzony wymagany element XML w XLSX.');
  return matches[0]!;
}
export function readXmlParts(parts: Map<string, Buffer>): Map<string, XmlNode> {
  const result = new Map<string, XmlNode>(); let nodes = 0;
  for (const [name, bytes] of parts) {
    if (name.endsWith('/')) continue;
    const parser = new SaxesParser({ xmlns: true }); const stack: XmlNode[] = []; let root: XmlNode | undefined;
    parser.on('error', () => xlsxFail('XLSX_XML', 'Uszkodzony dokument XML w XLSX.'));
    parser.on('doctype', () => xlsxFail('XLSX_CONTENT', 'Deklaracje DTD i encje zewnętrzne nie są obsługiwane.'));
    parser.on('opentag', tag => {
      if (++nodes > XLSX_LIMITS.nodes || stack.length >= XLSX_LIMITS.depth) xlsxFail('XLSX_LIMIT', 'Dokument XLSX przekracza limit złożoności XML.');
      if (tag.local === 'f' && tag.uri === MAIN) xlsxFail('XLSX_FORMULA', 'Raport zawiera formuły. Podgląd wymaga statycznych wartości eksportu.');
      const attrs: Record<string, string> = Object.create(null) as Record<string, string>;
      for (const attr of Object.values(tag.attributes)) attrs[attr.uri ? `{${attr.uri}}${attr.local}` : attr.name] = attr.value;
      const node: XmlNode = { name: tag.local, uri: tag.uri, attrs, text: '', children: [] };
      if (stack.length) stack[stack.length - 1]!.children.push(node); else root = node;
      stack.push(node);
    });
    const text = (value: string) => {
      const node = stack[stack.length - 1]; if (!node) return;
      if (node.text.length + value.length > CSV_LIMITS.fieldChars) xlsxFail('XLSX_LIMIT', 'Pole XML przekracza limit 16 384 znaków.');
      node.text += value;
    };
    parser.on('text', text); parser.on('cdata', text); parser.on('closetag', () => { stack.pop(); });
    parser.write(utf8(bytes)).close();
    if (!root || (parser.xmlDecl.encoding && !/^utf-?8$/i.test(parser.xmlDecl.encoding))) xlsxFail('XLSX_ENCODING', 'XLSX wymaga poprawnych dokumentów XML w UTF-8.');
    if (name.endsWith('.rels')) {
      if (root.name !== 'Relationships' || root.uri !== RELS) xlsxFail('XLSX_XML', 'Niepoprawny dokument relacji XLSX.');
      const ids = new Set<string>();
      for (const rel of children(root, 'Relationship', RELS)) {
        const target = rel.attrs.Target ?? '', id = rel.attrs.Id ?? '';
        if (!id || ids.has(id) || rel.attrs.TargetMode || !/^[A-Za-z0-9_\-./]+$/.test(target) || target.includes('..')) xlsxFail('XLSX_CONTENT', 'Zewnętrzne lub niejednoznaczne relacje XLSX nie są obsługiwane.');
        ids.add(id);
      }
    }
    result.set(name, root);
  }
  return result;
}

export interface XlsxCell { value: string; type: string }
export type XlsxRows = Map<number, Map<number, XlsxCell>>;
export function readSheet(root: XmlNode, strings: readonly string[], budget: { rows: number; cells: number }): XlsxRows {
  if (root.name !== 'worksheet' || root.uri !== MAIN) xlsxFail('XLSX_XML', 'Niepoprawny arkusz XLSX.');
  const rows: XlsxRows = new Map();
  for (const row of children(child(root, 'sheetData'), 'row')) {
    const index = Number(row.attrs.r);
    if (!/^[1-9]\d{0,4}$/.test(row.attrs.r ?? '') || index > XLSX_LIMITS.rows + 5 || rows.has(index) || ++budget.rows > XLSX_LIMITS.rows + 15) xlsxFail('XLSX_LIMIT', 'Za dużo wierszy, nieprawidłowy lub powtórzony numer wiersza.');
    const cells = new Map<number, XlsxCell>();
    for (const cell of children(row, 'c')) {
      const match = /^([A-Z]{1,2})([1-9]\d*)$/.exec(cell.attrs.r ?? '');
      if (!match || Number(match[2]) !== index || ++budget.cells > XLSX_LIMITS.cells) xlsxFail('XLSX_LIMIT', 'Za dużo komórek lub nieprawidłowy adres komórki.');
      const col = [...match[1]!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      if (col >= CSV_LIMITS.columns || cells.has(col)) xlsxFail('XLSX_LIMIT', 'Więcej niż 64 kolumny lub powtórzona komórka.');
      const type = cell.attrs.t ?? 'n';
      if (!['n', 's', 'inlineStr', 'str', 'd'].includes(type)) xlsxFail('XLSX_CELL', 'Nieobsługiwany typ komórki lub błąd Excela w raporcie.');
      const values = children(cell, 'v');
      if (values.length > 1) xlsxFail('XLSX_CELL', 'Powtórzona wartość komórki XLSX.');
      let value = values[0]?.text ?? '';
      if (type === 's') {
        if (!/^\d{1,5}$/.test(value) || strings[Number(value)] === undefined) xlsxFail('XLSX_CELL', 'Niepoprawne odwołanie do tekstu w XLSX.');
        value = strings[Number(value)]!;
      } else if (type === 'inlineStr') value = richText(child(cell, 'is'));
      if (value.length > CSV_LIMITS.fieldChars) xlsxFail('XLSX_LIMIT', 'Komórka przekracza limit 16 384 znaków.');
      cells.set(col, { value, type });
    }
    rows.set(index, cells);
  }
  return rows;
}
export function richText(node: XmlNode): string {
  // Only text runs, never phonetic annotations or arbitrary descendant content.
  const plain = children(node, 't'), runs = children(node, 'r');
  if (plain.length > 1 || (plain.length && runs.length)) xlsxFail('XLSX_CELL', 'Niejednoznaczny tekst komórki XLSX.');
  const text = plain.map(t => t.text).join('') + runs.map(r => child(r, 't').text).join('');
  if (text.length > CSV_LIMITS.fieldChars) xlsxFail('XLSX_LIMIT', 'Tekst XLSX przekracza limit pola.');
  return text;
}
