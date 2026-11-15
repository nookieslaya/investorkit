// Presentation only: decimal strings never pass through binary floating point.
export function formatAmount(value: string): string {
  const [integer = '0', rawFraction = ''] = value.split('.');
  const fraction = rawFraction.replace(/0+$/, '');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')},${fraction.padEnd(2, '0')}`;
}
export function formatRounded(value: string, scale: number): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 10) throw new Error('INVALID_DISPLAY_SCALE');
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  let scaled = BigInt(`${whole}${fraction.slice(0, scale).padEnd(scale, '0')}`);
  const rest = fraction.slice(scale);
  if (rest && (rest.charAt(0) > '5' || (rest.charAt(0) === '5' && (/[1-9]/.test(rest.slice(1)) || scaled % 2n !== 0n)))) scaled += 1n;
  const digits = scaled.toString().padStart(scale + 1, '0');
  const sign = negative && scaled !== 0n ? '-' : '';
  return formatAmount(scale ? `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}` : `${sign}${digits}`);
}
export function formatPercent(value: string): string { return `${formatRounded(value, 2)}%`; }
export function localNow() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(value));
}
