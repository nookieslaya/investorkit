// Calendar coverage describes days with a real record, never interpolated portfolio values.
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' });
export function historyDay(value: string): string {
  const parts = calendar.formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function missingHistoryDays(from: string, to: string, captured: readonly string[]) {
  const present = new Set(captured.map(historyDay));
  const last = Date.parse(`${historyDay(to)}T00:00:00Z`);
  const result: string[] = [];
  for (let day = Date.parse(`${historyDay(from)}T00:00:00Z`); day <= last; day += 86400000) {
    const key = new Date(day).toISOString().slice(0, 10);
    if (!present.has(key)) result.push(key);
  }
  return result;
}
