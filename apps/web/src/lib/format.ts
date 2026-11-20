// Presentation only: decimal strings never pass through binary floating point.
export function formatAmount(value: string): string {
  const [integer = '0', rawFraction = ''] = value.split('.');
  const fraction = rawFraction.replace(/0+$/, '');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')},${fraction.padEnd(2, '0')}`;
}
function roundDecimal(value: string, scale: number): string {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  let scaled = BigInt(`${whole}${fraction.slice(0, scale).padEnd(scale, '0')}`);
  const rest = fraction.slice(scale);
  if (rest && (rest.charAt(0) > '5' || (rest.charAt(0) === '5' && (/[1-9]/.test(rest.slice(1)) || scaled % 2n !== 0n)))) scaled += 1n;
  const digits = scaled.toString().padStart(scale + 1, '0');
  const sign = negative && scaled !== 0n ? '-' : '';
  return scale ? `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}` : `${sign}${digits}`;
}
export function formatRounded(value: string, scale: number): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 10) throw new Error('INVALID_DISPLAY_SCALE');
  return formatAmount(roundDecimal(value, scale));
}
/** Canonical display comparison/input hint only; never used for financial calculations. */
export function trimDecimal(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}
export function formatMoney(value: string): string {
  const [integer = '0', fraction = '00'] = roundDecimal(value, 2).split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')},${fraction}`;
}
export function formatQuantity(value: string): string {
  const rounded = trimDecimal(roundDecimal(value, 6));
  const approximate = /[1-9]/.test((value.split('.')[1] ?? '').slice(6));
  const [integer = '0', fraction] = rounded.split('.');
  return `${approximate ? '≈' : ''}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}${fraction ? `,${fraction}` : ''}`;
}
export function formatCash(value: string, currency: string): string {
  const [whole, fraction = ''] = value.split('.');
  const subCent = whole === '0' && fraction.padEnd(2, '0').slice(0, 2) === '00' && /[1-9]/.test(fraction);
  return `${subCent ? '<0,01' : formatMoney(value)} ${currency}`;
}
/** Use the same adaptive scale on both sides, revealing differences hidden at two decimals. */
export function formatAverageCosts(before: string | null, after: string | null) {
  let scale = 2;
  const values = [before, after].filter((value): value is string => value !== null);
  const maxScale = Math.max(2, ...values.map(value => value.split('.')[1]?.length ?? 0));
  while (scale < maxScale && (
    values.some(value => trimDecimal(value) !== '0' && trimDecimal(roundDecimal(value, scale)) === '0') ||
    (before !== null && after !== null && trimDecimal(before) !== trimDecimal(after) && roundDecimal(before, scale) === roundDecimal(after, scale))
  )) scale += 1;
  const display = (value: string | null) => value === null ? '—' : scale === 2 ? formatMoney(value) : formatAmount(roundDecimal(value, scale));
  return { before: display(before), after: display(after) };
}
export function formatPercent(value: string): string { return `${formatRounded(value, 2)}%`; }
/** Presentation of the API's nonnegative loss magnitude as a portfolio change. */
export function formatDecrease(value: string | null, kind: 'money' | 'percent'): string {
  if (value === null) return '—';
  const display = kind === 'money' ? formatMoney(value) : formatPercent(value);
  return display === '0,00' || display === '0,00%' ? display : `−${display}`;
}
export function localNow() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(value));
}

export const quoteSourceLabel = (source: 'manual' | 'scenario' | 'marketstack') => source === 'marketstack' ? 'Marketstack · cena zamknięcia' : source === 'scenario' ? 'założenie scenariusza' : 'wpis ręczny';
