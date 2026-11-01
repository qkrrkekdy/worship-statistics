export const labels = ['현장', '온라인', '합계'];
export const todayKorea = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
export function buildYear(rows, year, today = todayKorea()) {
  if (!Number.isInteger(year) || year < 2023 || year > 9999) throw new Error('잘못된 연도입니다.');
  const byDate = new Map();
  for (const row of rows) {
    const d = row.worship_date;
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10) !== d) throw new Error('유효하지 않은 기록 날짜입니다.');
    if (Number(d.slice(0,4)) !== year) continue;
    if (byDate.has(d)) throw new Error(`중복 날짜를 확인해주세요: ${d}`);
    byDate.set(d, row);
  }
  return Array.from({length:12}, (_, m) => {
    const days = [];
    for (let day = 1; day <= new Date(Date.UTC(year,m+1,0)).getUTCDate(); day++) {
      const date = `${year}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(), row = byDate.get(date);
      // This read-only view excludes Sundays even when the source contains a record.
      if (weekday === 0) continue;
      const onsite = number(row?.onsite), online = number(row?.online);
      const computed = onsite !== null && online !== null ? onsite + online : null;
      const total = number(row?.total) ?? computed;
      days.push({date, day, weekday:'일월화수목금토'[weekday], sunday:weekday===0, future:date>today,
        recorded:!!row, values:[onsite,online,total], note:typeof row?.note === 'string' ? row.note : '',
        mismatch:!!row && number(row.total)!==null && computed!==null && row.total!==computed});
    }
    const counts = [0,1,2].map(i => days.filter(d=>d.values[i]!==null).length);
    const averages = counts.map((n,i)=>n ? Math.round(days.reduce((s,d)=>s+(d.values[i]??0),0)/n*10)/10 : null);
    return {month:m+1, days, counts, averages, recordCount:days.filter(d=>d.recorded).length};
  });
}
// One cell matrix feeds both the HTML table and the Excel worksheet.
export function monthMatrix(month, year) {
  return [
    ['날짜', ...month.days.map(d=>`${d.day}일`), '월평균'],
    ['요일', ...month.days.map(d=>d.weekday), null],
    ...labels.map((label,i)=>[label,...month.days.map(d=>d.values[i]),month.averages[i]]),
    // Original notes are preserved, including literal text that could otherwise be mistaken for a marker.
    ['비고',...month.days.map(d=>d.note||null),null]
  ];
}
