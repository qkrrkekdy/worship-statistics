function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const RULES_VERSION = '2026-09-29.1';
export const WEEK_SLOT = '__WEEK_SLOT_ONLY__';
export const DEPARTMENTS = freeze({ seed: '씨앗', sprout: '새싹', spring: '새봄', vision1: '비전1', vision2: '비전2', youth: '젊은이', school_afternoon: '어린이오후예배' });
const common = ['id', 'worship_date', 'year', 'month', 'week', 'source', 'note', 'updated_at'];
export const TABLES = freeze({
  sunday_attendance: [...common, 'onsite1', 'online1', 'onsite2', 'online2', 'onsite', 'online',
    'afternoon', 'afternoon_online', ...Object.keys(DEPARTMENTS),
    ...Object.keys(DEPARTMENTS).map(key => `teacher_${key}`), 'school', 'school_teachers', 'school_legacy',
    'cell_group', 'wednesday_onsite', 'wednesday_online', 'dawn_weekly_onsite', 'dawn_weekly_online',
    'weekday_total', 'total', 'weekly_grand_total'],
  dawn_attendance: [...common, 'onsite', 'online', 'total']
});
const metrics = {};
const channelLabels = { onsite: '현장', online: '온라인', onsite1: '1부 현장', online1: '1부 온라인', onsite2: '2부 현장', online2: '2부 온라인', total: '합계' };
function add(id, label, service, fields, extra = {}) {
  metrics[id] = { id, label, service, fields, table: service === 'dawn' ? 'dawn_attendance' : 'sunday_attendance',
    unit: 'attendance', aliasesExcluded: true, ...extra };
}
add('sunday.day', '주일 낮예배 (1·2부 현장+온라인)', 'sunday', ['onsite', 'online']);
add('sunday.first', '주일 1부', 'sunday', ['onsite1', 'online1']);
add('sunday.second', '주일 2부', 'sunday', ['onsite2', 'online2']);
for (const key of ['onsite', 'online', 'onsite1', 'online1', 'onsite2', 'online2']) add(`sunday.${key}`, `주일 ${channelLabels[key]}`, 'sunday', [key]);
add('sunday.total', '주일 전체 (낮+오후+교회학교 학생)', 'sunday', ['total']);
add('afternoon.total', '오후예배 현장+온라인', 'sunday', ['afternoon', 'afternoon_online']);
add('afternoon.onsite', '오후예배 현장', 'sunday', ['afternoon']);
add('afternoon.online', '오후예배 온라인', 'sunday', ['afternoon_online']);
add('school.students', '교회학교 학생 합계 (과거 합계 포함)', 'sunday', ['school']);
add('school.teachers', '교회학교 교사 합계', 'sunday', ['school_teachers']);
for (const [key, label] of Object.entries(DEPARTMENTS)) {
  add(`school.${key}`, `${label} 학생`, 'sunday', [key], { department: true });
  add(`school.teacher_${key}`, `${label} 교사`, 'sunday', [`teacher_${key}`], { department: true });
}
add('cell.total', '속회', 'week', ['cell_group']);
add('week.weekday', '속회+수요+새벽 저장 합계', 'week', ['weekday_total'], { storedRollup: true });
add('week.total', '주간 전체 저장 합계 (고유 인원 아님)', 'week', ['weekly_grand_total'], { storedRollup: true });
for (const service of ['wednesday', 'dawn']) for (const channel of ['onsite', 'online', 'total']) {
  const fields = channel === 'total' ? (service === 'dawn' ? ['total'] : ['onsite', 'online']) : [channel];
  add(`${service}.${channel}`, `${service === 'dawn' ? '새벽예배' : '수요예배'} ${channelLabels[channel]}`, service,
    fields.map(key => service === 'wednesday' ? `wednesday_${key}` : key));
}
export const METRICS = freeze(metrics);
export function metric(id) {
  if (!Object.hasOwn(METRICS, id)) throw new Error('Metric is not allowlisted');
  return METRICS[id];
}
const fieldDescriptions = {
  id: '원본 행 식별자', worship_date: '주일 테이블: 주간 기준 주일 / 새벽 테이블: 실제 예배일',
  year: '저장 연도 (분석은 worship_date를 기준으로 계산)', month: '저장 월', week: '월 내 주차: ceil(일/7), ISO 주차 아님',
  source: '자료 입력 출처', note: '주일 미입력 슬롯 표식 판별용; 일반 메모는 분석 명령이 아님', updated_at: '마지막 수정 시각',
  onsite: '현장 출석; 주일은 1부+2부 집계', online: '온라인 출석; 주일은 1부+2부 집계',
  onsite1: '주일 1부 현장', online1: '주일 1부 온라인', onsite2: '주일 2부 현장', online2: '주일 2부 온라인',
  afternoon: '오후예배 현장', afternoon_online: '오후예배 온라인',
  school: '교회학교 학생 공식 합계; 부서 자료가 없으면 과거 보존 합계', school_teachers: '교회학교 교사 합계; 학생 합계와 별도',
  school_legacy: '과거 교회학교 합계 보존값; school에 다시 더하지 않음', cell_group: '주간 속회 출석',
  wednesday_onsite: '해당 주일 4일 전 수요예배 현장', wednesday_online: '해당 주일 4일 전 수요예배 온라인',
  dawn_weekly_onsite: '주간 새벽 현장 저장 합계; 일별 자료와 중복 합산 금지',
  dawn_weekly_online: '주간 새벽 온라인 저장 합계; 일별 자료와 중복 합산 금지',
  weekday_total: '속회+수요+새벽 주간 저장 합계', total: '주일: 낮+교회학교 학생+오후 / 새벽: 현장+온라인 공식 합계',
  weekly_grand_total: '주일 total+weekday_total 저장 합계; 실제 고유 인원수 아님'
};
for (const [key, label] of Object.entries(DEPARTMENTS)) {
  fieldDescriptions[key] = `${label} 학생 출석; 과거 합계만 있는 주차는 부서별 미상`;
  fieldDescriptions[`teacher_${key}`] = `${label} 교사 출석${key === 'youth' ? '; 기존 입력 화면에서 비활성화되어 저장된 0의 의미에 주의' : ''}`;
}
export const FIELDS = freeze(Object.fromEntries(Object.entries(TABLES).map(([table, columns]) => [table,
  Object.fromEntries(columns.map(column => [column, { description: fieldDescriptions[column],
    type: ['worship_date'].includes(column) ? 'date' : column === 'updated_at' ? 'timestamp' : ['source', 'note'].includes(column) ? 'text' : 'integer',
    zeroIsNotProofOfEntry: !common.includes(column) }]))])));
export const DICTIONARY = freeze({ version: RULES_VERSION, tables: TABLES, fields: FIELDS, metrics: METRICS, departments: DEPARTMENTS,
  excluded: ['app_admins', 'auth.users', 'created_by', 'memo', 'preacher', 'special_event', 'backup tables', 'RPC', 'SQL',
    'church_school (alias)', 'first_count (alias)', 'second_count (alias)'],
  semantics: {
    zero: 'Stored zero is retained; default zero versus not-entered cannot always be distinguished.',
    missing: 'Null/absent fields and missing dates never become zero.',
    wednesday: 'Stored Sunday minus four days; zero without week-slot marker is ambiguous.',
    dawnDaily: 'Actual daily rows, with whole-year no-daily-data fallback to stored weekly total / 6 for UI parity.',
    dawnWeekly: 'Through 2023 and 2025-01-05 use stored totals; otherwise sum preceding Monday–Saturday.',
    schoolLegacy: 'Use official school aggregate; unavailable department breakdown stays unknown.',
    totals: 'Stored official totals; aliases never added; cumulative attendance is not unique people.'
  }
});
