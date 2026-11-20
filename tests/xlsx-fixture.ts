import { readFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';
import { readXlsxArchive } from '../apps/api/src/imports/xlsx-reader.js';

export const xtbBytes = readFileSync(new URL('../apps/web/public/examples/xtb-demo.xlsx', import.meta.url));
// Small test-only ZIP writer: permits malformed declarations and duplicate names
// so security tests are independent of the production archive validation.
export function zipEntries(entries: readonly [string, Buffer][]): Buffer {
  const local: Buffer[] = [], directory: Buffer[] = []; let offset = 0;
  for (const [path, data] of entries) {
    const name = Buffer.from(path), body = deflateRawSync(data), header = Buffer.alloc(30), central = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc32(data), 14); header.writeUInt32LE(body.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    local.push(header, name, body); directory.push(central, name); offset += header.length + name.length + body.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, central, end]);
}
export function editXlsx(path: string, transform: (xml: string) => string): Buffer {
  const parts = readXlsxArchive(xtbBytes); const original = parts.get(path); if (!original) throw new Error('Fixture part missing');
  const edited = transform(original.toString('utf8')); if (edited === original.toString('utf8')) throw new Error('Fixture mutation had no effect');
  parts.set(path, Buffer.from(edited)); return zipEntries([...parts]);
}
export function cellValue(xml: string, ref: string, value: string, type = 'n'): string {
  const pattern = new RegExp(`<([A-Za-z0-9_]+:)?c\\b[^>]*\\br="${ref}"[^>]*>[\\s\\S]*?<\\/([A-Za-z0-9_]+:)?c>`);
  return xml.replace(pattern, `<c xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" r="${ref}" t="${type}"><v>${value}</v></c>`);
}
