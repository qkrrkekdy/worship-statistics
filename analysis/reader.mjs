import { TABLES } from './catalog.mjs';
import { date, period, shift } from './dates.mjs';

const PROJECT = 'https://pxpfrlcnzdeltarfpisb.supabase.co';
const ownKeys = (obj, allowed) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).some(k => !allowed.includes(k))) throw new Error('Unsupported query option');
};

// No Supabase session/client, Authorization header, arbitrary URL, RPC, or mutation API.
export function createReader({ publishableKey, fetchImpl = globalThis.fetch, maxRows = 20000 } = {}) {
  if (typeof publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) throw new Error('Only a publishable key is accepted');
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 100000) throw new Error('Invalid row limit');
  async function read(query) {
    ownKeys(query, ['table', 'columns', 'start', 'end', 'signal']);
    const { table, signal } = query;
    if (!Object.hasOwn(TABLES, table)) throw new Error('Table is not allowlisted');
    const { start, end } = period(query);
    const columns = query.columns ?? TABLES[table];
    if (!Array.isArray(columns) || !columns.length || columns.some(c => !TABLES[table].includes(c))) throw new Error('Column is not allowlisted');
    const projection = [...new Set(['id', 'worship_date', ...columns])];
    const rows = [], seen = new Set();
    let total;
    for (;;) {
      const url = new URL(`/rest/v1/${table}`, PROJECT);
      url.searchParams.set('select', projection.join(','));
      url.searchParams.append('worship_date', `gte.${start}`);
      url.searchParams.append('worship_date', `lte.${end}`);
      url.searchParams.set('order', 'worship_date.asc,id.asc');
      url.searchParams.set('limit', '1000'); url.searchParams.set('offset', String(rows.length));
      const response = await fetchImpl(url, { method: 'GET', headers: { apikey: publishableKey, Prefer: 'count=exact', Accept: 'application/json' },
        credentials: 'omit', redirect: 'error', cache: 'no-store', signal: signal ?? AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Read failed: ${table} HTTP ${response.status}`);
      const range = response.headers.get('content-range');
      const match = range?.match(/^(?:(\d+)-(\d+)|\*)\/(\d+)$/);
      if (!match) throw new Error('Exact count missing; refusing potentially truncated data');
      const count = Number(match[3]);
      if (total !== undefined && total !== count) throw new Error('Data changed during paging; retry');
      total = count;
      if (total > maxRows) throw new Error('Row limit exceeded; narrow the period');
      const batch = await response.json();
      if (!Array.isArray(batch) || (!batch.length && rows.length < total)) throw new Error('Incomplete page');
      if (batch.length && (Number(match[1]) !== rows.length || Number(match[2]) !== rows.length + batch.length - 1)) throw new Error('Invalid page range');
      for (const row of batch) {
        if (!row || row.worship_date < start || row.worship_date > end || seen.has(row.worship_date)) throw new Error('Invalid/duplicate source date');
        date(row.worship_date);
        if (projection.some(key => !Object.hasOwn(row, key))) throw new Error('Source column missing');
        seen.add(row.worship_date);
        rows.push(Object.fromEntries(projection.map(key => [key, row[key]])));
      }
      if (rows.length > total) throw new Error('Invalid row count');
      if (rows.length === total) return rows;
    }
  }
  async function load(input) {
    ownKeys(input, ['start', 'end', 'signal']);
    const requested = period(input);
    // Full calendar years are needed to decide the existing yearly dawn fallback.
    // Next Sunday's row can carry a Wednesday in the final requested year.
    const sourceStart = `${requested.start.slice(0, 4)}-01-01`;
    const sourceEnd = `${requested.end.slice(0, 4)}-12-31`;
    const [sundayRows, dawnRows] = await Promise.all([
      read({ table: 'sunday_attendance', start: sourceStart, end: shift(sourceEnd, 6), signal: input.signal }),
      read({ table: 'dawn_attendance', start: shift(sourceStart, -6), end: sourceEnd, signal: input.signal })
    ]);
    return { sundayRows, dawnRows, coverage: { start: sourceStart, end: sourceEnd }, fetchedAt: new Date().toISOString(),
      consistency: 'Paged REST reads are not an atomic database snapshot.' };
  }
  return Object.freeze({ read, load });
}
