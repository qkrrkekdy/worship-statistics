import { metric, DEPARTMENTS, WEEK_SLOT, RULES_VERSION } from './catalog.mjs';
import { date, day, shift, sunday, period, calendar, previousYear, koreaToday } from './dates.mjs';

const num = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const sumFields = (row, fields) => {
  const values = fields.map(key => num(row[key]));
  return values.some(v => v === null) ? null : values.reduce((a, b) => a + b, 0);
};
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const median = values => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
const delta = (now, before) => ({ difference: now === null || before === null ? null : now - before,
  percent: now === null || before === null || before === 0 ? null : (now - before) / before * 100,
  reason: now === null || before === null ? 'missing-data' : before === 0 ? 'zero-baseline' : null });
const unique = values => [...new Set(values)];
function normalizeRows(rows, name) {
  if (!Array.isArray(rows)) throw new Error(`${name} rows required`);
  const seen = new Set();
  return rows.map(row => {
    date(row.worship_date);
    if (seen.has(row.worship_date)) throw new Error(`Duplicate ${name} date`);
    seen.add(row.worship_date);
    return Object.freeze({ ...row });
  }).sort((a, b) => a.worship_date.localeCompare(b.worship_date));
}

export function createEngine(dataset, { asOf = koreaToday() } = {}) {
  date(asOf);
  const coverage = Object.freeze(period(dataset.coverage));
  const sundayRows = normalizeRows(dataset.sundayRows, 'Sunday');
  const dawnRows = normalizeRows(dataset.dawnRows, 'dawn');
  const sundayByDate = new Map(sundayRows.map(row => [row.worship_date, row]));
  // Exclude future observations even when loaded for boundary lookup.
  const observedDawn = dawnRows.filter(row => row.worship_date <= asOf);
  const dailyYears = new Set(observedDawn.map(row => row.worship_date.slice(0, 4)));
  const warnings = [];
  for (const row of sundayRows) {
    if (day(row.worship_date) !== 0) warnings.push(`non-sunday-source:${row.worship_date}`);
    const computed = sumFields(row, ['onsite', 'online', 'school', 'afternoon', 'afternoon_online']);
    if (computed !== null && num(row.total) !== null && computed !== row.total) warnings.push(`stored-total-mismatch:${row.worship_date}`);
    for (const [aggregate, fields] of [['onsite', ['onsite1', 'onsite2']], ['online', ['online1', 'online2']]]) {
      const value = sumFields(row, fields);
      if (value !== null && num(row[aggregate]) !== null && value !== row[aggregate]) warnings.push(`${aggregate}-detail-mismatch:${row.worship_date}`);
    }
  }
  for (const row of dawnRows) {
    const computed = sumFields(row, ['onsite', 'online']);
    if (computed !== null && num(row.total) !== null && computed !== row.total) warnings.push(`dawn-total-mismatch:${row.worship_date}`);
  }
  function checked(input) {
    const requested = period(input);
    if (requested.start < coverage.start || requested.end > coverage.end) throw new Error('Requested period outside loaded coverage');
    return { ...requested, effectiveEnd: requested.end < asOf ? requested.end : asOf };
  }
  function observation(row, value, status = 'observed', extra = {}) {
    return { date: row.worship_date, value, status: value === null ? 'missing' : status,
      sourceDate: row.worship_date, sourceId: row.id ?? null, ...extra };
  }
  function series(id, input, { dawnMode = 'daily-compatible' } = {}) {
    const m = metric(id), p = checked(input);
    if (!['daily-compatible', 'daily-observed', 'weekly'].includes(dawnMode)) throw new Error('Invalid dawn mode');
    let points = [];
    if (m.service === 'dawn' && dawnMode === 'weekly') {
      // Only completed Monday–Saturday windows; never add daily + stored for the same week.
      const channelFields = (id === 'dawn.total' ? ['onsite', 'online'] : m.fields).map(key => `dawn_weekly_${key}`);
      for (const d of calendar(p.start, p.effectiveEnd, 0)) {
        const row = sundayByDate.get(d), historical = Number(d.slice(0, 4)) <= 2023 || d === '2025-01-05';
        const days = observedDawn.filter(r => r.worship_date >= shift(d, -6) && r.worship_date < d);
        const values = days.map(r => sumFields(r, m.fields));
        const stored = row ? sumFields(row, channelFields) : null;
        const storedAll = row ? sumFields(row, ['dawn_weekly_onsite', 'dawn_weekly_online']) : null;
        const value = historical ? (storedAll === 0 ? null : stored) :
          (!values.length || values.includes(null) ? null : values.reduce((a, b) => a + b, 0));
        points.push({ date: d, value, status: value === null ? 'missing' : historical ? 'stored-weekly' : 'observed-weekly',
          sourceDate: historical ? row?.worship_date ?? null : null,
          windowStart: shift(d, -6), windowEnd: shift(d, -1), observedDays: historical ? null : days.length,
          partial: !historical && days.length < 6,
          reason: historical && storedAll === 0 ? 'zero-or-not-entered' : null });
      }
    } else if (m.service === 'dawn') {
      points = observedDawn.map(row => observation(row, sumFields(row, m.fields)));
      if (dawnMode === 'daily-compatible') for (const row of sundayRows) {
        if (day(row.worship_date) !== 0 || row.note === WEEK_SLOT || dailyYears.has(row.worship_date.slice(0, 4))) continue;
        const all = sumFields(row, ['dawn_weekly_onsite', 'dawn_weekly_online']);
        if (all === null || all <= 0) continue;
        const value = sumFields(row, (id === 'dawn.total' ? ['onsite', 'online'] : m.fields).map(key => `dawn_weekly_${key}`));
        points.push(observation(row, value === null ? null : value / 6, 'estimated-daily-average',
          { divisor: 6, windowStart: shift(row.worship_date, -6), windowEnd: shift(row.worship_date, -1) }));
      }
    } else for (const row of sundayRows) {
      if (day(row.worship_date) !== 0) continue;
      if (m.service === 'wednesday') {
        const actual = shift(row.worship_date, -4);
        const all = sumFields(row, ['wednesday_onsite', 'wednesday_online']);
        const ambiguous = all === 0 && row.note !== WEEK_SLOT;
        const value = ambiguous ? null : sumFields(row, m.fields);
        points.push({ ...observation(row, value), date: actual, reason: ambiguous ? 'zero-or-not-entered' : null });
      } else {
        if (row.note === WEEK_SLOT && m.service === 'sunday') continue;
        const breakdown = sumFields(row, Object.keys(DEPARTMENTS));
        const legacyOnly = (num(row.school_legacy) ?? 0) > 0 && (breakdown === null || breakdown === 0);
        const value = m.department && legacyOnly ? null : sumFields(row, m.fields);
        points.push(observation(row, value, 'observed', { reason: m.department && legacyOnly ? 'legacy-no-breakdown' : null }));
      }
    }
    return points.filter(x => x.date >= p.start && x.date <= p.effectiveEnd).sort((a, b) => a.date.localeCompare(b.date));
  }
  function summarize(id, input, options = {}) {
    const m = metric(id), p = checked(input), points = series(id, input, options);
    const valid = points.filter(x => x.value !== null), values = valid.map(x => x.value);
    const estimated = valid.filter(x => x.status === 'estimated-daily-average');
    let expected;
    if (m.service === 'dawn' && options.dawnMode !== 'weekly') {
      expected = calendar(p.start, p.effectiveEnd).filter(d => {
        const fallback = options.dawnMode !== 'daily-observed' && !dailyYears.has(d.slice(0, 4));
        return fallback ? day(d) === 0 : day(d) !== 0;
      });
    } else expected = calendar(p.start, p.effectiveEnd, m.service === 'wednesday' ? 3 : 0);
    const known = new Set(valid.map(x => x.date));
    const missingDates = expected.filter(d => !known.has(d));
    const sum = values.length ? values.reduce((a, b) => a + b, 0) : null;
    const observed = valid.filter(x => x.status !== 'estimated-daily-average');
    const localWarnings = ['출석 누계는 고유 인원수가 아닙니다.', '기본값 0과 미입력은 원본만으로 완전히 구분할 수 없습니다.'];
    if (missingDates.length) localWarnings.push('예상 일정 중 자료가 없는 날짜가 있습니다. 결석 0명으로 계산하지 않았습니다.');
    if (estimated.length) localWarnings.push('과거 주간 합계/6 추정값 포함: 평균은 기존 화면 기준이며 합계는 출석 누계로 제공하지 않습니다.');
    if (valid.some(x => x.partial)) localWarnings.push('6일 미만 관측된 새벽 주간 합계가 포함되어 있습니다.');
    if (m.storedRollup) localWarnings.push('기존 저장 합계 기준입니다. 일별 새벽 자료를 다시 더하지 않았습니다.');
    if (points.some(x => x.reason === 'legacy-no-breakdown')) localWarnings.push('과거 교회학교 합계만 있는 주차의 부서별 수치는 알 수 없습니다.');
    return { metric: id, label: m.label, requested: { start: p.start, end: p.end },
      effective: { start: p.start, end: p.effectiveEnd }, asOf, rulesVersion: RULES_VERSION,
      count: values.length, observedCount: observed.length, estimatedCount: estimated.length,
      missingCount: missingDates.length, missingDates, unknownRows: points.filter(x => x.value === null),
      zeroCount: values.filter(x => x === 0).length, total: estimated.length ? null : sum,
      mean: mean(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
      firstDate: valid[0]?.date ?? null, lastDate: valid.at(-1)?.date ?? null,
      partialPeriod: p.effectiveEnd < p.end, incompleteCoverage: missingDates.length > 0 || valid.some(x => x.partial),
      warnings: unique([...localWarnings, ...warnings]), points };
  }
  function aggregate(id, input, grain = 'month', options = {}) {
    if (!['month', 'year'].includes(grain)) throw new Error('Invalid aggregation grain');
    const p = checked(input), groups = new Map();
    for (const d of calendar(p.start, p.effectiveEnd)) {
      const key = d.slice(0, grain === 'month' ? 7 : 4);
      if (!groups.has(key)) groups.set(key, { start: d, end: d });
      groups.get(key).end = d;
    }
    return [...groups].map(([key, range]) => {
      const start = `${key}${grain === 'month' ? '-01' : '-01-01'}`;
      const next = grain === 'year' ? `${Number(key) + 1}-01-01` :
        (Number(key.slice(5)) === 12 ? `${Number(key.slice(0, 4)) + 1}-01-01` : `${key.slice(0, 4)}-${String(Number(key.slice(5)) + 1).padStart(2, '0')}-01`);
      return { key, ...summarize(id, range, options), partialBucket: range.start !== start || range.end !== shift(next, -1) };
    });
  }
  function compare(id, current, previous, options = {}) {
    const a = summarize(id, current, options), b = summarize(id, previous, options);
    return { metric: id, current: a, previous: b, meanChange: delta(a.mean, b.mean), totalChange: delta(a.total, b.total),
      sameObservationCount: a.count === b.count,
      warning: '기간의 일수·요일 배치와 관측 횟수를 함께 확인하세요.' };
  }
  function yearOverYear(id, current, options = {}) {
    const p = checked(current);
    if (p.start > p.effectiveEnd) throw new Error('No elapsed comparison period');
    return { ...compare(id, { start: p.start, end: p.effectiveEnd },
      { start: previousYear(p.start), end: previousYear(p.effectiveEnd) }, options),
      requested: current, cutoff: p.effectiveEnd, alignment: 'same-calendar-month-day; Feb 29 clamps to Feb 28' };
  }
  function trend(id, input, options = {}) {
    const buckets = aggregate(id, input, 'month', options);
    // Exclude partial months and months with missing scheduled observations from fitted trend.
    const fit = buckets.filter(b => !b.partialBucket && !b.incompleteCoverage && b.mean !== null && !b.estimatedCount);
    const xs = fit.map(b => Number(b.key.slice(0, 4)) * 12 + Number(b.key.slice(5)) - 1), ys = fit.map(b => b.mean);
    const mx = mean(xs), my = mean(ys);
    const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const slope = xs.length < 2 || !den ? null : xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / den;
    return { metric: id, buckets, fittedMonths: fit.map(b => b.key), slopePerMonth: slope,
      direction: slope === null ? 'insufficient-data' : slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'flat',
      method: 'OLS of complete monthly observation means; partial/incomplete/estimated months excluded' };
  }
  function school(input) {
    return { students: summarize('school.students', input), teachers: summarize('school.teachers', input),
      departments: Object.entries(DEPARTMENTS).map(([key, label]) => ({ key, label,
        students: summarize(`school.${key}`, input), teachers: summarize(`school.teacher_${key}`, input),
        monthly: aggregate(`school.${key}`, input) })) };
  }
  function anomalies(id, input, { thresholdPercent = 20, window = 8, minBaseline = 4, ...options } = {}) {
    const m = metric(id);
    if (m.service === 'dawn' && options.dawnMode !== 'weekly') throw new Error('Weekly anomaly detection requires dawnMode weekly');
    if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || !Number.isInteger(window) || window < 2 || window > 52 ||
        !Number.isInteger(minBaseline) || minBaseline < 2 || minBaseline > window) throw new Error('Invalid anomaly options');
    const points = series(id, input, options), results = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (point.value === null || point.partial || point.status === 'estimated-daily-average') continue;
      const baseline = points.slice(0, i).filter(x => x.date >= shift(point.date, -7 * window) && x.value !== null && !x.partial);
      if (baseline.length < minBaseline) continue;
      const center = median(baseline.map(x => x.value)), change = delta(point.value, center);
      if (change.percent === null || Math.abs(change.percent) < thresholdPercent) continue;
      const mad = median(baseline.map(x => Math.abs(x.value - center)));
      results.push({ date: point.date, value: point.value, baselineMedian: center, baselineCount: baseline.length,
        baselineDates: baseline.map(x => x.date), ...change, direction: change.difference > 0 ? 'spike' : 'drop',
        robustZ: mad ? 0.6745 * (point.value - center) / mad : null });
    }
    return { metric: id, thresholdPercent, window, minBaseline, candidates: results,
      interpretation: '기준 중앙값 대비 변화 후보입니다. 행사·누락·입력 상태를 확인해야 하며 원인을 단정하지 않습니다.' };
  }
  function correlation(left, right, input, { minPairs = 8 } = {}) {
    if (!Number.isInteger(minPairs) || minPairs < 3) throw new Error('Invalid minimum pairs');
    function weekly(id) {
      const m = metric(id), groups = new Map();
      const points = series(id, input, m.service === 'dawn' ? { dawnMode: 'weekly' } : {});
      for (const p of points) {
        if (p.value === null || p.partial) continue;
        const key = sunday(p.date);
        groups.set(key, p.value);
      }
      return groups;
    }
    const a = weekly(left), b = weekly(right);
    const pairs = [...a].filter(([key]) => b.has(key)).map(([week, x]) => ({ week, x, y: b.get(week) }));
    const mx = mean(pairs.map(p => p.x)), my = mean(pairs.map(p => p.y));
    const vx = pairs.reduce((s, p) => s + (p.x - mx) ** 2, 0), vy = pairs.reduce((s, p) => s + (p.y - my) ** 2, 0);
    const reason = pairs.length < minPairs ? 'insufficient-pairs' : !vx || !vy ? 'constant-series' : null;
    const r = reason ? null : Math.max(-1, Math.min(1, pairs.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / Math.sqrt(vx * vy)));
    return { left, right, method: 'Pearson; Sunday-aligned paired weeks', pairs, pairCount: pairs.length, r, reason,
      warning: '상관관계는 인과관계가 아닙니다. 계절성·추세·지표 간 구성요소 중복의 영향을 받을 수 있습니다.' };
  }
  return Object.freeze({ series, summarize, aggregate, compare, yearOverYear, trend, school, anomalies, correlation,
    metadata: Object.freeze({ asOf, coverage, rulesVersion: RULES_VERSION, fetchedAt: dataset.fetchedAt ?? null,
      warnings: Object.freeze(warnings), consistency: dataset.consistency ?? 'Caller-provided snapshot' }) });
}
