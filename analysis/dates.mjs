export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date');
  return value;
}
export const day = value => new Date(date(value) + 'T00:00:00Z').getUTCDay();
export function shift(value, days) {
  const d = new Date(date(value) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const sunday = value => shift(value, (7 - day(value)) % 7);
export const koreaToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
export function period(input) {
  if (!input || typeof input !== 'object') throw new Error('Period required');
  const start = date(input.start), end = date(input.end);
  if (start > end) throw new Error('Reversed period');
  if (Number(end.slice(0, 4)) - Number(start.slice(0, 4)) > 30) throw new Error('Period exceeds 30 years');
  return { start, end };
}
export function previousYear(value) {
  date(value);
  const year = Number(value.slice(0, 4)) - 1;
  const candidate = `${year}${value.slice(4)}`;
  try { return date(candidate); } catch { return `${year}-02-28`; }
}
export function recentMonths(asOf, count = 6) {
  date(asOf);
  if (!Number.isInteger(count) || count < 1 || count > 120) throw new Error('Invalid month count');
  const d = new Date(asOf + 'T00:00:00Z');
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - count + 1);
  return { start: d.toISOString().slice(0, 10), end: asOf };
}
export function calendar(start, end, weekday = null) {
  const values = [];
  for (let d = start; d <= end; d = shift(d, 1)) if (weekday === null || day(d) === weekday) values.push(d);
  return values;
}
