const nf = new Intl.NumberFormat('ko-KR');
const currentYear = new Date().getFullYear();
const colors = ['#0072B2','#E69F00','#009E73','#D55E00','#7B2CBF','#00A6D6','#CC79A7','#8C564B','#6B8E23','#2F2F2F'];
let imported = { sundayRecords: [], dawnRecords: [], importedAt: null };
let supabaseClient = null;
let currentSession = null, isAdmin = false, authReady = false, entryMutationPending = false;
let entryType = 'sunday', yearlyType = 'sunday', compareType = 'sunday';
const clearedSupplementalSundayRecords = [
  {date:'2026-07-05',onsite1:317,online1:56,onsite2:604,online2:77,afternoon:164,afternoonOnline:23,seed:24,sprout:43,spring:108,vision1:99,vision2:39,youth:72,schoolAfternoon:45,teacherSeed:11,teacherSprout:17,teacherSpring:22,teacherVision1:19,teacherVision2:11,teacherYouth:0,teacherSchoolAfternoon:2,cellGroup:287,wednesdayOnsite:76,wednesdayOnline:19,dawnWeeklyOnsite:698,dawnWeeklyOnline:509,weekdayTotal:1589,weeklyGrandTotal:3260},
  {date:'2026-07-12',onsite1:320,online1:47,onsite2:644,online2:52,afternoon:165,afternoonOnline:19,seed:31,sprout:50,spring:96,vision1:91,vision2:50,youth:82,schoolAfternoon:32,teacherSeed:12,teacherSprout:18,teacherSpring:21,teacherVision1:18,teacherVision2:11,teacherYouth:0,teacherSchoolAfternoon:2,cellGroup:302,wednesdayOnsite:84,wednesdayOnline:28,dawnWeeklyOnsite:570,dawnWeeklyOnline:524,weekdayTotal:1508,weeklyGrandTotal:3187},
  {date:'2026-07-19',onsite1:324,online1:52,onsite2:662,online2:63,afternoon:179,afternoonOnline:16,seed:29,sprout:57,spring:102,vision1:92,vision2:48,youth:74,schoolAfternoon:42,teacherSeed:11,teacherSprout:18,teacherSpring:21,teacherVision1:18,teacherVision2:11,teacherYouth:0,teacherSchoolAfternoon:3,cellGroup:279,wednesdayOnsite:75,wednesdayOnline:21,dawnWeeklyOnsite:570,dawnWeeklyOnline:514,weekdayTotal:1459,weeklyGrandTotal:3199},
  {date:'2026-07-26',onsite1:319,online1:57,onsite2:640,online2:60,afternoon:166,afternoonOnline:20,seed:32,sprout:51,spring:96,vision1:96,vision2:44,youth:68,schoolAfternoon:27,teacherSeed:10,teacherSprout:18,teacherSpring:20,teacherVision1:18,teacherVision2:11,teacherYouth:0,teacherSchoolAfternoon:2,cellGroup:301,wednesdayOnsite:74,wednesdayOnline:23,dawnWeeklyOnsite:546,dawnWeeklyOnline:490,weekdayTotal:1434,weeklyGrandTotal:3110}
].map((item)=>{
  const onsite=item.onsite1+item.onsite2,online=item.online1+item.online2,school=item.seed+item.sprout+item.spring+item.vision1+item.vision2+item.youth+item.schoolAfternoon;
  const schoolTeachers=item.teacherSeed+item.teacherSprout+item.teacherSpring+item.teacherVision1+item.teacherVision2+item.teacherYouth+item.teacherSchoolAfternoon;
  return {id:`supplement-${item.date}`,type:'sunday',year:2026,month:7,source:'supplement',note:'2026년 7월 전교인 출석현황',...item,onsite,online,school,schoolTeachers,schoolLegacy:0,total:onsite+online+school+item.afternoon+item.afternoonOnline};
});
const supplementalSundayRecords = [];

const $ = (id) => document.getElementById(id);
const keyOf = (type, date) => `${type}|${date}`;
const countText = (value) => value == null ? '—' : `${nf.format(Math.round(value))}명`;
const average = (records) => records.length ? records.reduce((sum, item) => sum + item.total, 0) / records.length : null;
const formatDate = (date) => new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'short',day:'numeric',weekday:'short'}).format(new Date(`${date}T00:00:00`));
const weekOfMonth = (date) => Math.ceil(new Date(`${date}T00:00:00`).getDate() / 7);

function baseRecords(type) {
  const source = type === 'sunday' ? imported.sundayRecords : imported.dawnRecords;
  const normalized=source.map((item) => type === 'sunday'
    ? ({ id:item.id, type, date:item.date, year:item.year, month:item.month, onsite:item.onsite||0, onsite1:item.onsite1??item.onsite??0, onsite2:item.onsite2??0, online:item.online||0, online1:item.online1??item.online??0, online2:item.online2??0, school:item.school||0, schoolTeachers:item.schoolTeachers||0, schoolLegacy:item.schoolLegacy||0, seed:item.seed||0, sprout:item.sprout||0, spring:item.spring||0, vision1:item.vision1||0, vision2:item.vision2||0, youth:item.youth||0, schoolAfternoon:item.schoolAfternoon||0, teacherSeed:item.teacherSeed||0,teacherSprout:item.teacherSprout||0,teacherSpring:item.teacherSpring||0,teacherVision1:item.teacherVision1||0,teacherVision2:item.teacherVision2||0,teacherYouth:item.teacherYouth||0,teacherSchoolAfternoon:item.teacherSchoolAfternoon||0, afternoon:item.afternoon||0, afternoonOnline:item.afternoonOnline||0, cellGroup:item.cellGroup||0, wednesdayOnsite:item.wednesdayOnsite||0, wednesdayOnline:item.wednesdayOnline||0, dawnWeeklyOnsite:item.dawnWeeklyOnsite||0, dawnWeeklyOnline:item.dawnWeeklyOnline||0, weekdayTotal:item.weekdayTotal||0, weeklyGrandTotal:item.weeklyGrandTotal||0, total:item.total, note:item.note||'', source:item.source||'excel' })
    : ({ id:item.id, type, date:item.date, year:item.year, month:item.month, onsite:item.first||0, online:item.second||0, school:0, afternoon:0, afternoonOnline:0, total:item.total, note:item.note||'', source:item.source||'migration' }));
  if(type==='sunday'){
    const map=new Map(normalized.map(item=>[item.date,item]));
    supplementalSundayRecords.forEach(item=>map.set(item.date,item));
    return [...map.values()];
  }
  return normalized;
}
function records(type) {
  return baseRecords(type).sort((a,b) => a.date.localeCompare(b.date));
}

function mapSupabaseSunday(row) {
  return {
    id:`supabase-sunday-${row.id}`, date:row.worship_date, year:row.year, month:row.month, week:row.week,
    onsite1:row.onsite1||0, online1:row.online1||0, onsite2:row.onsite2||0, online2:row.online2||0,
    onsite:row.onsite||0, online:row.online||0, afternoon:row.afternoon||0, afternoonOnline:row.afternoon_online||0,
    seed:row.seed||0, sprout:row.sprout||0, spring:row.spring||0, vision1:row.vision1||0,
    vision2:row.vision2||0, youth:row.youth||0, schoolAfternoon:row.school_afternoon||0,
    teacherSeed:row.teacher_seed||0, teacherSprout:row.teacher_sprout||0, teacherSpring:row.teacher_spring||0,
    teacherVision1:row.teacher_vision1||0, teacherVision2:row.teacher_vision2||0, teacherYouth:row.teacher_youth||0,
    teacherSchoolAfternoon:row.teacher_school_afternoon||0, school:row.school||0,
    schoolTeachers:row.school_teachers||0, schoolLegacy:row.school_legacy||0,
    cellGroup:row.cell_group||0, wednesdayOnsite:row.wednesday_onsite||0, wednesdayOnline:row.wednesday_online||0,
    dawnWeeklyOnsite:row.dawn_weekly_onsite||0, dawnWeeklyOnline:row.dawn_weekly_online||0,
    weekdayTotal:row.weekday_total||0, total:row.total||0, weeklyGrandTotal:row.weekly_grand_total||0,
    note:row.note||'', source:row.source||'migration'
  };
}

function mapSupabaseDawn(row) {
  return {
    id:`supabase-dawn-${row.id}`, date:row.worship_date, year:row.year, month:row.month, week:row.week,
    first:row.onsite||0, second:row.online||0, total:row.total||0,
    note:row.note||'', source:row.source||'migration'
  };
}

async function fetchAllSupabaseRows(table) {
  const pageSize=1000, rows=[];
  for(let from=0;;from+=pageSize){
    const {data,error}=await supabaseClient.from(table).select('*').order('worship_date',{ascending:true}).range(from,from+pageSize-1);
    if(error) throw new Error(`${table} 조회 실패: ${error.message}`);
    rows.push(...data);
    if(data.length<pageSize) return rows;
  }
}

async function loadAttendanceFromSupabase() {
  const config=window.WORSHIP_SUPABASE_CONFIG;
  if(!config?.url||!config?.publishableKey) throw new Error('Supabase 공개 연결 설정이 없습니다.');
  if(!window.supabase?.createClient) throw new Error('Supabase JavaScript 라이브러리를 불러오지 못했습니다.');
  if(!supabaseClient) supabaseClient=window.supabase.createClient(config.url,config.publishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  const [sundayRows,dawnRows]=await Promise.all([
    fetchAllSupabaseRows('sunday_attendance'),
    fetchAllSupabaseRows('dawn_attendance')
  ]);
  imported={
    sundayRecords:sundayRows.map(mapSupabaseSunday),
    dawnRecords:dawnRows.map(mapSupabaseDawn),
    importedAt:new Date().toISOString()
  };
}

async function refreshAttendanceFromSupabase() {
  await loadAttendanceFromSupabase();
  populateFilters();
  renderAllVisible();
}

function setAuthMessage(message='',error=false) {
  $('admin-auth-message').textContent=message;
  $('admin-auth-message').className=`form-message ${error?'down':'up'}`;
}

function setEntryPending(pending) {
  entryMutationPending=pending;
  [...$('attendance-form').elements].forEach((control)=>control.disabled=pending||(control.name==='teacherYouth'));
  $('cancel-edit').disabled=pending;
}

async function checkAdminAccess(session) {
  if(!session?.user) return false;
  const {data,error}=await supabaseClient.from('app_admins').select('user_id').eq('user_id',session.user.id).maybeSingle();
  if(error) throw new Error(`관리자 권한 확인 실패: ${error.message}`);
  return Boolean(data);
}

function updateAdminUI() {
  const loggedIn=Boolean(currentSession?.user);
  $('admin-login-view').hidden=loggedIn;
  $('admin-session-view').hidden=!loggedIn;
  $('admin-entry-area').hidden=!isAdmin;
  $('admin-session-email').textContent=loggedIn?currentSession.user.email||'':'';
  $('admin-status-badge').textContent=isAdmin?'관리자':'권한 없음';
  $('admin-status-badge').classList.toggle('denied',loggedIn&&!isAdmin);
  $('admin-session-message').textContent=isAdmin?'출석자료를 입력·수정·삭제할 수 있습니다.':loggedIn?'app_admins에 등록된 관리자 계정이 아닙니다.':'';
  if(isAdmin) renderEntry();
  else resetForm(false);
}

async function syncAuthState(session) {
  currentSession=session;
  isAdmin=false;
  setAuthMessage('');
  try {
    if(session) isAdmin=await checkAdminAccess(session);
  } catch(error) {
    console.error(error);
    setAuthMessage(error.message,true);
  }
  authReady=true;
  updateAdminUI();
}

async function initializeAdminAuth() {
  localStorage.removeItem('attendance-custom');
  localStorage.removeItem('attendance-deleted');
  const {data,error}=await supabaseClient.auth.getSession();
  if(error) throw new Error(`로그인 상태 확인 실패: ${error.message}`);
  await syncAuthState(data.session);
  supabaseClient.auth.onAuthStateChange((_event,session)=>{
    window.setTimeout(()=>syncAuthState(session),0);
  });
}
function yearsAvailable() {
  const years = new Set([currentYear]);
  [...records('sunday'),...records('dawn')].forEach((item) => years.add(item.year));
  return [...years].filter((year) => year >= 2022).sort((a,b) => a-b);
}
function setOptions(select, values, selected) {
  select.innerHTML = values.map((value) => `<option value="${value}" ${String(value)===String(selected)?'selected':''}>${value}년</option>`).join('');
}
function changeInfo(now, before) {
  if (now == null || before == null) return { diff:null,pct:null,html:'비교 자료 없음',className:'neutral' };
  const diff = now-before, pct = before ? diff/before*100 : 0, up = diff>0, down = diff<0;
  return { diff,pct,className:up?'up':down?'down':'neutral',html:`${up?'▲ +':down?'▼ -':''}${nf.format(Math.abs(Math.round(diff)))}명 · ${up?'+':''}${pct.toFixed(1)}%` };
}
function monthlyAverage(data, year, month) { return average(data.filter((item) => item.year===year && item.month===month)); }
function fieldAverage(data, field) { return data.length ? data.reduce((sum,item)=>sum+(item[field]||0),0)/data.length : null; }
function dawnAnalysisRecords() {
  const daily=records('dawn'), dailyYears=new Set(daily.map(item=>item.year));
  const weeklyFallback=records('sunday')
    .filter(item=>!dailyYears.has(item.year)&&((item.dawnWeeklyOnsite||0)+(item.dawnWeeklyOnline||0)>0))
    .map(item=>({
      id:`weekly-dawn-average-${item.date}`,type:'dawn',date:item.date,year:item.year,month:item.month,
      onsite:(item.dawnWeeklyOnsite||0)/6,online:(item.dawnWeeklyOnline||0)/6,
      total:((item.dawnWeeklyOnsite||0)+(item.dawnWeeklyOnline||0))/6,source:'weekly-average'
    }));
  return [...daily,...weeklyFallback].sort((a,b)=>a.date.localeCompare(b.date));
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active',page.id===pageId));
  document.querySelectorAll('[data-page]').forEach((button) => button.classList.toggle('active',button.dataset.page===pageId));
  history.replaceState(null,'',`#${pageId}`);
  renderPage(pageId); window.scrollTo(0,0);
}
const mobileMenuToggle=$('mobile-menu-toggle'),mobileMenuOverlay=$('mobile-menu-overlay');
function setMobileMenu(open){
  const mobile=window.matchMedia('(max-width: 768px)').matches;
  const shouldOpen=mobile&&open;
  document.body.classList.toggle('mobile-menu-open',shouldOpen);
  mobileMenuToggle.setAttribute('aria-expanded',String(shouldOpen));
  mobileMenuToggle.setAttribute('aria-label',shouldOpen?'메뉴 닫기':'메뉴 열기');
  mobileMenuOverlay.hidden=!shouldOpen;
}
mobileMenuToggle.addEventListener('click',()=>setMobileMenu(!document.body.classList.contains('mobile-menu-open')));
mobileMenuOverlay.addEventListener('click',()=>setMobileMenu(false));
document.addEventListener('keydown',(event)=>{if(event.key==='Escape')setMobileMenu(false)});
document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click',()=>{showPage(button.dataset.page);setMobileMenu(false)}));

function renderDashboard() {
  const years = yearsAvailable(), dashboardYears = years;
  $('dashboard-period').textContent = `${years[0]||2022}–${years.at(-1)||currentYear}`;
  const sunday=records('sunday'), dawn=dawnAnalysisRecords();
  const latestSunday=sunday.at(-1), dailyDawn=records('dawn'), latestDawn=dailyDawn.at(-1);
  $('dashboard-latest-sunday-onsite').textContent=latestSunday?countText(latestSunday.onsite||0):'—';
  $('dashboard-latest-sunday-online').textContent=latestSunday?countText(latestSunday.online||0):'—';
  $('dashboard-latest-sunday').textContent=latestSunday?countText((latestSunday.onsite||0)+(latestSunday.online||0)):'—';
  $('dashboard-latest-sunday-school').textContent=latestSunday?countText(latestSunday.school||0):'—';
  $('dashboard-latest-sunday-date').textContent=latestSunday?`${formatDate(latestSunday.date)} 기준`:'입력 자료 없음';
  $('dashboard-year-sunday-onsite1').textContent=latestSunday?countText(latestSunday.onsite1||0):'—';
  $('dashboard-year-sunday-online1').textContent=latestSunday?countText(latestSunday.online1||0):'—';
  $('dashboard-year-sunday-total1').textContent=latestSunday?countText((latestSunday.onsite1||0)+(latestSunday.online1||0)):'—';
  $('dashboard-year-sunday-onsite2').textContent=latestSunday?countText(latestSunday.onsite2||0):'—';
  $('dashboard-year-sunday-online2').textContent=latestSunday?countText(latestSunday.online2||0):'—';
  $('dashboard-year-sunday-total2').textContent=latestSunday?countText((latestSunday.onsite2||0)+(latestSunday.online2||0)):'—';
  $('dashboard-year-sunday-period').textContent=latestSunday?`${formatDate(latestSunday.date)} 기준`:'입력 자료 없음';
  if(latestDawn){
    const recentDawn=dailyDawn.slice(-6), dayLabels=['일','월','화','수','목','금','토'];
    $('dashboard-latest-dawn-week').innerHTML=recentDawn.map(item=>{const day=dayLabels[new Date(`${item.date}T00:00:00`).getDay()];return `<div><small>${day}</small><strong>${nf.format(item.onsite||0)} / ${nf.format(item.online||0)}</strong></div>`}).join('');
    $('dashboard-year-dawn-period').textContent=`${recentDawn[0].date.slice(5).replace('-','/')}–${recentDawn.at(-1).date.slice(5).replace('-','/')} 기준`;
  }else{
    $('dashboard-latest-dawn-week').innerHTML=Array.from({length:6},()=>'<div><small>—</small><strong>— / —</strong></div>').join('');
    $('dashboard-year-dawn-period').textContent='입력 자료 없음';
  }
  $('dash-sunday-years').innerHTML=dashboardYears.map((year,index)=>{const avg=average(sunday.filter(x=>x.year===year)),previous=index?average(sunday.filter(x=>x.year===dashboardYears[index-1])):null,change=changeInfo(avg,previous);return `<tr><td>${year}년</td><td>${countText(avg)}</td><td class="${change.className}">${change.diff==null?'—':`${change.diff>0?'▲ +':change.diff<0?'▼ -':''}${nf.format(Math.abs(Math.round(change.diff)))}명`}</td><td class="${change.className}">${change.pct==null?'—':`${change.pct>0?'+':''}${change.pct.toFixed(1)}%`}</td></tr>`}).join('');
  $('dash-dawn-years').innerHTML=dashboardYears.map((year,index)=>{const items=dawn.filter(x=>x.year===year),avg=average(items),previous=index?average(dawn.filter(x=>x.year===dashboardYears[index-1])):null,change=changeInfo(avg,previous);return `<tr><td>${year}년</td><td>${countText(fieldAverage(items,'onsite'))}</td><td>${countText(fieldAverage(items,'online'))}</td><td>${countText(avg)}</td><td class="${change.className}">${change.diff==null?'—':`${change.diff>0?'▲ +':change.diff<0?'▼ -':''}${nf.format(Math.abs(Math.round(change.diff)))}명`}</td><td class="${change.className}">${change.pct==null?'—':`${change.pct>0?'+':''}${change.pct.toFixed(1)}%`}</td></tr>`}).join('');
  drawReadableLines('dashboard-sunday-chart',sunday,dashboardYears,(item)=>(item.onsite||0)+(item.online||0));
  drawReadableLines('dashboard-afternoon-chart',sunday,dashboardYears,(item)=>(item.afternoon||0)+(item.afternoonOnline||0));
  drawReadableLines('dashboard-dawn-chart',dawn,dashboardYears,(item)=>item.total,50);
  drawReadableLines('dashboard-wednesday-chart',sunday,dashboardYears,(item)=>(item.wednesdayOnsite||0)+(item.wednesdayOnline||0),null,true);
}

function renderEntry() {
  if(!isAdmin) return;
  const selectedYear=Number($('entry-year').value),selectedMonth=$('entry-month').value;
  const data=records(entryType).filter(item=>item.year===selectedYear&&(selectedMonth==='all'||item.month===Number(selectedMonth))).slice().reverse(); $('entry-list-title').textContent=`${entryType==='sunday'?'주일':'새벽'}예배 입력 내역`; $('entry-count').textContent=`${nf.format(data.length)}건`;
  document.querySelectorAll('[data-entry-for]').forEach((group)=>group.hidden=group.dataset.entryFor!==entryType);
  $('entry-record-head').innerHTML=entryType==='sunday'?'<tr><th>날짜</th><th>1부 현장</th><th>1부 온라인</th><th>2부 현장</th><th>2부 온라인</th><th>오후 현장</th><th>오후 온라인</th><th>교회학교</th><th>속회</th><th>수요 현장</th><th>수요 온라인</th><th>합계</th><th>관리</th></tr>':'<tr><th>날짜</th><th>현장</th><th>온라인</th><th>합계</th><th>비고</th><th>관리</th></tr>';
  $('entry-records').innerHTML=data.map((item)=>entryType==='sunday'?`<tr><td>${formatDate(item.date)}</td><td>${countText(item.onsite1)}</td><td>${countText(item.online1)}</td><td>${countText(item.onsite2)}</td><td>${countText(item.online2)}</td><td>${countText(item.afternoon)}</td><td>${countText(item.afternoonOnline)}</td><td>${countText(item.school)}</td><td>${countText(item.cellGroup)}</td><td>${countText(item.wednesdayOnsite)}</td><td>${countText(item.wednesdayOnline)}</td><td>${countText(item.total)}</td><td><div class="row-actions"><button data-edit="${keyOf(entryType,item.date)}">수정</button><button class="delete" data-delete="${keyOf(entryType,item.date)}">삭제</button></div></td></tr>`:`<tr><td>${formatDate(item.date)}</td><td>${countText(item.onsite)}</td><td>${countText(item.online)}</td><td>${countText(item.total)}</td><td>${item.note||'-'}</td><td><div class="row-actions"><button data-edit="${keyOf(entryType,item.date)}">수정</button><button class="delete" data-delete="${keyOf(entryType,item.date)}">삭제</button></div></td></tr>`).join('')||`<tr><td class="empty" colspan="${entryType==='sunday'?13:6}">입력된 자료가 없습니다.</td></tr>`;
}
document.querySelectorAll('[data-entry-type]').forEach((button)=>button.addEventListener('click',()=>{entryType=button.dataset.entryType;document.querySelectorAll('[data-entry-type]').forEach((item)=>item.classList.toggle('active',item===button));resetForm();renderEntry()}));
function numberValue(form,name){return Number(form.elements[name]?.value)||0}
function sundayPayload(form,existing) {
  const departmentTotal=['seed','sprout','spring','vision1','vision2','youth','schoolAfternoon'].reduce((sum,name)=>sum+numberValue(form,name),0);
  return {
    worship_date:form.date.value,
    onsite1:numberValue(form,'onsite1'),online1:numberValue(form,'online1'),onsite2:numberValue(form,'onsite2'),online2:numberValue(form,'online2'),
    afternoon:numberValue(form,'afternoon'),afternoon_online:numberValue(form,'afternoonOnline'),
    seed:numberValue(form,'seed'),sprout:numberValue(form,'sprout'),spring:numberValue(form,'spring'),vision1:numberValue(form,'vision1'),vision2:numberValue(form,'vision2'),youth:numberValue(form,'youth'),school_afternoon:numberValue(form,'schoolAfternoon'),
    teacher_seed:numberValue(form,'teacherSeed'),teacher_sprout:numberValue(form,'teacherSprout'),teacher_spring:numberValue(form,'teacherSpring'),teacher_vision1:numberValue(form,'teacherVision1'),teacher_vision2:numberValue(form,'teacherVision2'),teacher_youth:0,teacher_school_afternoon:numberValue(form,'teacherSchoolAfternoon'),
    school_legacy:departmentTotal?0:numberValue(form,'schoolLegacy'),
    cell_group:numberValue(form,'cellGroup'),wednesday_onsite:numberValue(form,'wednesdayOnsite'),wednesday_online:numberValue(form,'wednesdayOnline'),
    dawn_weekly_onsite:Number(existing?.dawnWeeklyOnsite)||0,dawn_weekly_online:Number(existing?.dawnWeeklyOnline)||0,
    note:form.note.value.trim(),source:'manual'
  };
}
function dawnPayload(form) {
  return {worship_date:form.date.value,onsite:numberValue(form,'onsite'),online:numberValue(form,'online'),note:form.note.value.trim(),source:'manual'};
}
$('attendance-form').addEventListener('submit',async(event)=>{
  event.preventDefault();
  if(!authReady||!isAdmin||!currentSession){showEntryMessage('관리자 로그인이 필요합니다.',true);return}
  if(entryMutationPending)return;
  const form=event.currentTarget,date=form.date.value,original=form.originalKey.value;
  const originalDate=original?original.split('|')[1]:null;
  const duplicate=records(entryType).some(item=>item.date===date&&item.date!==originalDate);
  if(duplicate){showEntryMessage('같은 날짜의 같은 예배 출석자료가 이미 있습니다.',true);return}
  const existing=originalDate?records(entryType).find(item=>item.date===originalDate):null;
  const table=entryType==='sunday'?'sunday_attendance':'dawn_attendance';
  const payload=entryType==='sunday'?sundayPayload(form,existing):dawnPayload(form);
  setEntryPending(true);
  try {
    const query=originalDate
      ? supabaseClient.from(table).update(payload).eq('worship_date',originalDate)
      : supabaseClient.from(table).upsert(payload,{onConflict:'worship_date'});
    const {error}=await query.select('worship_date').single();
    if(error) throw new Error(`${originalDate?'수정':'저장'} 실패: ${error.message}`);
    await refreshAttendanceFromSupabase();
    resetForm(false);
    showEntryMessage(originalDate?'수정했습니다.':'저장했습니다.');
  } catch(error) {
    console.error(error);showEntryMessage(error.message,true);
  } finally {setEntryPending(false)}
});
function showEntryMessage(message,error=false){$('entry-message').textContent=message;$('entry-message').className=`form-message ${error?'down':'up'}`}
function resetForm(clearMessage=true){$('attendance-form').reset();$('attendance-form').originalKey.value='';$('cancel-edit').hidden=true;if(clearMessage)$('entry-message').textContent=''}
$('cancel-edit').addEventListener('click',()=>resetForm());
const attendanceDateInput=$('attendance-form').elements.date;
attendanceDateInput.addEventListener('click',()=>{
  if(typeof attendanceDateInput.showPicker==='function'){
    try{attendanceDateInput.showPicker()}catch(error){/* 브라우저 기본 날짜 선택기를 사용합니다. */}
  }
});
$('entry-records').addEventListener('click',async(event)=>{
  if(!isAdmin||entryMutationPending)return;
  const edit=event.target.dataset.edit,del=event.target.dataset.delete;
  if(edit){
    const [type,date]=edit.split('|'),item=records(type).find(row=>row.date===date);if(!item)return;
    entryType=type;const form=$('attendance-form');form.originalKey.value=edit;form.date.value=item.date;
    const fields=type==='sunday'?['onsite1','online1','onsite2','online2','afternoon','afternoonOnline','seed','sprout','spring','vision1','vision2','youth','schoolAfternoon','teacherSeed','teacherSprout','teacherSpring','teacherVision1','teacherVision2','teacherYouth','teacherSchoolAfternoon','cellGroup','wednesdayOnsite','wednesdayOnline']:['onsite','online'];
    fields.forEach(field=>form.elements[field].value=item[field]||'');form.schoolLegacy.value=item.schoolLegacy||item.school||0;form.note.value=item.note||'';
    $('cancel-edit').hidden=false;document.querySelectorAll('[data-entry-type]').forEach(button=>button.classList.toggle('active',button.dataset.entryType===type));renderEntry();window.scrollTo({top:0,behavior:'smooth'});return;
  }
  if(del&&confirm('이 출석자료를 삭제할까요?')){
    const [type,date]=del.split('|'),table=type==='sunday'?'sunday_attendance':'dawn_attendance';setEntryPending(true);
    try {const {error}=await supabaseClient.from(table).delete().eq('worship_date',date).select('worship_date').single();if(error)throw new Error(`삭제 실패: ${error.message}`);await refreshAttendanceFromSupabase();resetForm(false);showEntryMessage('삭제했습니다.')}catch(error){console.error(error);showEntryMessage(error.message,true)}finally{setEntryPending(false)}
  }
});

function populateFilters() {
  const years=yearsAvailable(), latest=years.at(-1); ['yearly-year','monthly-year','report-year'].forEach((id)=>{const old=$(id).value;setOptions($(id),years,old||latest)});
  const oldEntryYear=$('entry-year').value;$('entry-year').innerHTML=years.map(year=>`<option value="${year}" ${String(year)===String(oldEntryYear||latest)?'selected':''}>${year}년</option>`).join('');
  const oldEntryMonth=$('entry-month').value;$('entry-month').innerHTML='<option value="all">전체 월</option>'+Array.from({length:12},(_,index)=>`<option value="${index+1}" ${String(index+1)===String(oldEntryMonth||new Date().getMonth()+1)?'selected':''}>${index+1}월</option>`).join('');
  $('monthly-month').innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===new Date().getMonth()+1?'selected':''}>${i+1}월</option>`).join('');
  $('compare-years').innerHTML=years.map((year)=>`<label><input type="checkbox" value="${year}" checked>${year}</label>`).join('');
}
function renderYearly() {
  const year=Number($('yearly-year').value), data=records('sunday').filter((item)=>item.year===year);
  const fields=[
    {key:'onsite',label:'현장',averageId:'year-onsite-average',chartId:'yearly-onsite-chart',color:colors[0]},
    {key:'online',label:'온라인',averageId:'year-online-average',chartId:'yearly-online-chart',color:colors[1]},
    {key:'afternoon',label:'오후예배',averageId:'year-afternoon-average',chartId:'yearly-afternoon-chart',color:colors[2]},
    {key:'afternoonOnline',label:'오후 온라인',averageId:'year-afternoon-online-average',chartId:'yearly-afternoon-online-chart',color:colors[3]},
    {key:'school',label:'교회학교',averageId:'year-school-average',chartId:'yearly-school-chart',color:colors[4]}
  ];
  fields.forEach((field)=>{
    $(field.averageId).textContent=countText(fieldAverage(data,field.key));
    const values=Array.from({length:12},(_,index)=>{const items=data.filter(item=>item.month===index+1);return items.length?fieldAverage(items,field.key):null});
    drawBars(field.chartId,Array.from({length:12},(_,index)=>`${index+1}월`),values,field.color);
  });
  const highestOnsite=data.length?Math.max(...data.map((item)=>Number(item.onsite)||0)):null;
  const highestOnline=data.length?Math.max(...data.map((item)=>Number(item.online)||0)):null;
  const highestAfternoon=data.length?Math.max(...data.map((item)=>Number(item.afternoon)||0)):null;
  const highestAfternoonOnline=data.length?Math.max(...data.map((item)=>Number(item.afternoonOnline)||0)):null;
  const highestSchool=data.length?Math.max(...data.map((item)=>Number(item.school)||0)):null;
  $('yearly-highest-attendance').textContent=data.length?[
    `최고출석: 현장 ${countText(highestOnsite)}`,
    `온라인 ${countText(highestOnline)}`,
    `오후예배 ${countText(highestAfternoon)}`,
    `오후 온라인 ${countText(highestAfternoonOnline)}`,
    `교회학교 ${countText(highestSchool)}`
  ].join(' · '):'—';
  $('yearly-record-head').innerHTML='<tr><th>날짜</th><th>현장</th><th>온라인</th><th>오후예배</th><th>오후 온라인</th><th>교회학교</th><th>전체 합계</th></tr>';
  $('yearly-records').innerHTML=data.map(item=>`<tr><td><strong>${item.date.slice(5).replace('-','.')} · ${item.month}월 ${weekOfMonth(item.date)}주</strong></td><td>${countText(item.onsite||0)}</td><td>${countText(item.online||0)}</td><td>${countText(item.afternoon||0)}</td><td>${countText(item.afternoonOnline||0)}</td><td>${countText(item.school||0)}</td><td><strong>${countText(item.total)}</strong></td></tr>`).join('')||'<tr><td class="empty" colspan="7">자료가 없습니다.</td></tr>';
}
$('yearly-year').addEventListener('change',renderYearly);document.querySelectorAll('[data-year-type]').forEach((button)=>button.addEventListener('click',()=>{yearlyType=button.dataset.yearType;document.querySelectorAll('[data-year-type]').forEach((item)=>item.classList.toggle('active',item===button));renderYearly()}));

function selectedCompareYears(){return [...$('compare-years').querySelectorAll('input:checked')].map((x)=>Number(x.value)).sort((a,b)=>a-b)}
function renderCompare(){
  const years=selectedCompareYears(),same=$('same-period').checked,maxYear=years.at(-1),allSunday=records('sunday'),allDawn=dawnAnalysisRecords();
  if(!years.length){$('comparison-table').innerHTML='<tr><td class="empty" colspan="11">비교할 연도를 선택하세요.</td></tr>';$('comparison-delta').innerHTML='';return}
  const latest=[...allSunday,...allDawn].filter(item=>item.year===maxYear).sort((a,b)=>a.date.localeCompare(b.date)).at(-1),cutoff=same&&latest?latest.date.slice(5):'12-31';
  const sets=years.map(year=>({year,sunday:allSunday.filter(item=>item.year===year&&item.date.slice(5)<=cutoff),dawn:allDawn.filter(item=>item.year===year&&item.date.slice(5)<=cutoff)}));
  const metrics=[
    {id:'sunday-onsite',label:'주일 현장',type:'sunday',field:'onsite'}, {id:'sunday-online',label:'주일 온라인',type:'sunday',field:'online'},
    {id:'sunday-afternoon',label:'주일 오후',type:'sunday',field:'afternoon'}, {id:'sunday-afternoonOnline',label:'주일 오후 온라인',type:'sunday',field:'afternoonOnline'},
    {id:'sunday-school',label:'교회학교',type:'sunday',field:'school'}, {id:'sunday-total',label:'주일 합계',type:'sunday',field:'total'},
    {id:'dawn-onsite',label:'새벽 현장',type:'dawn',field:'onsite'}, {id:'dawn-online',label:'새벽 온라인',type:'dawn',field:'online'}, {id:'dawn-total',label:'새벽 합계',type:'dawn',field:'total'}
  ];
  const metricAverage=(set,metric)=>fieldAverage(set[metric.type],metric.field);
  $('comparison-table').innerHTML=sets.map(set=>`<tr><td>${set.year}년</td><td>1월 1일–${cutoff.replace('-','월 ')}일</td>${metrics.map(metric=>`<td>${countText(metricAverage(set,metric))}</td>`).join('')}</tr>`).join('');
  const last=sets.at(-1),previous=sets.at(-2);
  $('comparison-delta').innerHTML=last&&previous?metrics.map(metric=>{const now=metricAverage(last,metric),before=metricAverage(previous,metric),change=changeInfo(now,before);return `<article><span>${metric.label} · ${previous.year}→${last.year}</span><strong class="${change.className}">${change.html}</strong><small>${countText(before)} → ${countText(now)}</small></article>`}).join(''):'';
  const selectedMetric=metrics.find(metric=>metric.id===$('comparison-metric').value)||metrics[0];
  const chartSets=sets.map(set=>({year:set.year,items:set[selectedMetric.type].map(item=>({...item,total:item[selectedMetric.field]||0}))}));
  const comparisonMonths=Array.from({length:Number(cutoff.slice(0,2))},(_,index)=>index+1);
  $('comparison-chart-description').textContent=`${selectedMetric.label} · 월별 평균 · 단위: 명`;
  $('comparison-monthly-head').innerHTML=`<tr><th>월</th>${chartSets.map(set=>`<th>${set.year}년</th>`).join('')}</tr>`;
  $('comparison-monthly-body').innerHTML=comparisonMonths.map(month=>{
    const values=chartSets.map(set=>monthlyAverage(set.items,set.year,month));
    return `<tr><th>${month}월</th>${values.map(value=>`<td>${value==null?'—':nf.format(Math.round(value))}</td>`).join('')}</tr>`;
  }).join('');
  drawGrouped('comparison-chart',chartSets,cutoff);
}
$('compare-years').addEventListener('change',renderCompare);$('same-period').addEventListener('change',renderCompare);$('comparison-metric').addEventListener('change',renderCompare);

function renderMonthly(){
  const year=Number($('monthly-year').value),month=Number($('monthly-month').value),sunday=records('sunday').filter(item=>item.year===year&&item.month===month),dawnDaily=records('dawn').filter(item=>item.year===year&&item.month===month),dawn=dawnAnalysisRecords().filter(item=>item.year===year&&item.month===month);
  $('monthly-report-title').textContent=`${year}년도 출석현황 (${month}월)`;
  $('monthly-dawn-average').textContent=`현장 평균 ${countText(fieldAverage(dawn,'onsite'))} · 온라인 평균 ${countText(fieldAverage(dawn,'online'))} · 전체 월평균 ${countText(average(dawn))}`;
  if(sunday.length){
    $('monthly-sunday-columns').innerHTML='<col class="label-column">'+Array.from({length:sunday.length*3},()=>'<col class="data-column">').join('');
    $('monthly-sunday-columns').parentElement.style.minWidth=`${140+sunday.length*3*58}px`;
    $('monthly-sunday-head').innerHTML=`<tr><th rowspan="2">예배 구분</th>${sunday.map(item=>`<th colspan="3">${item.date.slice(5).replace('-','/')} · ${weekOfMonth(item.date)}주</th>`).join('')}</tr><tr>${sunday.map(()=>'<th>현장</th><th>온라인</th><th>합계</th>').join('')}</tr>`;
    const triple=(fieldA,fieldB)=>sunday.map(item=>{const onsite=item[fieldA]||0,online=item[fieldB]||0;return `<td>${nf.format(onsite)}</td><td>${nf.format(online)}</td><td><strong>${nf.format(onsite+online)}</strong></td>`}).join('');
    const schoolTriple=(valueFor)=>sunday.map(item=>`<td class="empty-department">—</td><td class="empty-department">—</td><td>${nf.format(Math.round(valueFor(item)))}</td>`).join('');
    $('monthly-sunday-records').innerHTML=`
      <tr class="worship-subtotal"><td>주일낮예배</td>${triple('onsite','online')}</tr>
      <tr class="section-row"><td>1부</td>${triple('onsite1','online1')}</tr>
      <tr><td>2부</td>${triple('onsite2','online2')}</tr>
      <tr class="afternoon-row"><td>오후예배</td>${triple('afternoon','afternoonOnline')}</tr>
      <tr class="total-row"><td>교회학교</td>${schoolTriple(item=>item.school||0)}</tr>
      <tr class="total-row"><td>주일예배 합계</td>${sunday.map(item=>{const onsite=(item.onsite||0)+(item.afternoon||0)+(item.school||0),online=(item.online||0)+(item.afternoonOnline||0);return `<td>${nf.format(onsite)}</td><td>${nf.format(online)}</td><td>${nf.format(item.total)}</td>`}).join('')}</tr>
      <tr class="worship-subtotal"><td>주중예배 합계</td>${schoolTriple(item=>item.weekdayTotal||0)}</tr>
      <tr><td>새벽</td>${triple('dawnWeeklyOnsite','dawnWeeklyOnline')}</tr>
      <tr><td>수요</td>${triple('wednesdayOnsite','wednesdayOnline')}</tr>
      <tr><td>속회</td>${schoolTriple(item=>item.cellGroup||0)}</tr>
      <tr class="total-row"><td>주간 총합</td>${schoolTriple(item=>item.weeklyGrandTotal||0)}</tr>`;
  }else{$('monthly-sunday-columns').innerHTML='<col class="label-column">';$('monthly-sunday-columns').parentElement.style.minWidth='100%';$('monthly-sunday-head').innerHTML='<tr><th>예배 구분</th></tr>';$('monthly-sunday-records').innerHTML='<tr><td class="empty">자료가 없습니다.</td></tr>'}
  $('monthly-school-average').textContent=sunday.length?`교사 평균 ${countText(fieldAverage(sunday,'schoolTeachers'))} · 학생 평균 ${countText(fieldAverage(sunday,'school'))}`:'—';
  if(sunday.length){
    $('monthly-school-columns').innerHTML='<col class="label-column">'+Array.from({length:sunday.length*2},()=>'<col class="data-column">').join('');
    $('monthly-school-head').innerHTML=`<tr><th rowspan="2">교회학교</th>${sunday.map(item=>`<th colspan="2">${item.date.slice(5).replace('-','/')} · ${weekOfMonth(item.date)}주</th>`).join('')}</tr><tr>${sunday.map(()=>'<th>교사</th><th>학생</th>').join('')}</tr>`;
    const schoolDepartments=[
      {label:'씨앗',teacher:'teacherSeed',student:'seed'}, {label:'새싹',teacher:'teacherSprout',student:'sprout'},
      {label:'새봄',teacher:'teacherSpring',student:'spring'}, {label:'비전1',teacher:'teacherVision1',student:'vision1'},
      {label:'비전2',teacher:'teacherVision2',student:'vision2'}, {label:'젊은이',teacher:'teacherYouth',student:'youth'},
      {label:'어린이오후예배',teacher:'teacherSchoolAfternoon',student:'schoolAfternoon'}
    ];
    $('monthly-school-records').innerHTML=schoolDepartments.map(department=>`<tr><td>${department.label}</td>${sunday.map(item=>`<td>${nf.format(item[department.teacher]||0)}</td><td>${nf.format(item[department.student]||0)}</td>`).join('')}</tr>`).join('')+`<tr class="total-row"><td>교회학교 합계</td>${sunday.map(item=>`<td>${nf.format(item.schoolTeachers||0)}</td><td>${nf.format(item.school||0)}</td>`).join('')}</tr>`;
  }else{$('monthly-school-columns').innerHTML='<col class="label-column">';$('monthly-school-head').innerHTML='<tr><th>교회학교</th></tr>';$('monthly-school-records').innerHTML='<tr><td class="empty">자료가 없습니다.</td></tr>'}
  const renderDawnTable=(items)=>{
    const columns=$('monthly-dawn-columns'),head=$('monthly-dawn-head'),body=$('monthly-dawn-records');
    if(items.length){
      columns.innerHTML='<col class="dawn-date-column"><col class="dawn-value-column"><col class="dawn-value-column"><col class="dawn-value-column">';
      columns.parentElement.style.minWidth='100%';
      head.innerHTML='<tr><th>날짜</th><th>현장</th><th>온라인</th><th>합계</th></tr>';
      body.innerHTML=[...items].reverse().map(item=>`<tr><td>${item.date.slice(5).replace('-','/')} <small>${['일','월','화','수','목','금','토'][new Date(`${item.date}T00:00:00`).getDay()]}</small></td><td>${nf.format(item.onsite||0)}</td><td>${nf.format(item.online||0)}</td><td><strong>${nf.format(item.total)}</strong></td></tr>`).join('');
    }else{columns.innerHTML='<col class="dawn-date-column"><col class="dawn-value-column"><col class="dawn-value-column"><col class="dawn-value-column">';columns.parentElement.style.minWidth='100%';head.innerHTML='<tr><th>날짜</th><th>현장</th><th>온라인</th><th>합계</th></tr>';body.innerHTML='<tr><td class="empty" colspan="4">자료가 없습니다.</td></tr>'}
  };
  renderDawnTable(dawnDaily);
}
$('monthly-year').addEventListener('change',renderMonthly);$('monthly-month').addEventListener('change',renderMonthly);
$('entry-year').addEventListener('change',renderEntry);$('entry-month').addEventListener('change',renderEntry);

function renderReport(){const type=$('report-type').value,year=Number($('report-year').value),data=records(type).filter(x=>x.year===year);$('report-average').textContent=`평균 ${countText(average(data))}`;$('report-records').innerHTML=data.map(x=>`<tr><td>${formatDate(x.date)}</td><td>${countText(x.total)}</td><td>${x.note||'-'}</td></tr>`).join('')||'<tr><td class="empty" colspan="3">자료가 없습니다.</td></tr>'}
$('report-type').addEventListener('change',renderReport);$('report-year').addEventListener('change',renderReport);$('print-report').addEventListener('click',()=>window.print());$('download-csv').addEventListener('click',()=>{const type=$('report-type').value,year=Number($('report-year').value),data=records(type).filter(x=>x.year===year),csv='\ufeff날짜,출석인원,비고\r\n'+data.map(x=>`${x.date},${x.total},"${(x.note||'').replaceAll('"','""')}"`).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download=`${year}_${type==='sunday'?'주일예배':'새벽예배'}_출석.csv`;a.click();URL.revokeObjectURL(url)});
function renderImport(){ $('import-sunday-count').textContent=`${nf.format(imported.sundayRecords.length)}건`;$('import-dawn-count').textContent=`${nf.format(imported.dawnRecords.length)}건`;$('import-date').textContent=imported.importedAt?new Date(imported.importedAt).toLocaleDateString('ko-KR'):'—' }
const settings=JSON.parse(localStorage.getItem('worship-settings')||'{}');if(settings.churchName){document.querySelector('.brand strong').textContent=settings.churchName;$('settings-form').churchName.value=settings.churchName}$('settings-form').addEventListener('submit',(event)=>{event.preventDefault();const value={churchName:event.currentTarget.churchName.value.trim()||'인천중앙교회',defaultPage:event.currentTarget.defaultPage.value};localStorage.setItem('worship-settings',JSON.stringify(value));document.querySelector('.brand strong').textContent=value.churchName;$('settings-message').textContent='설정을 저장했습니다.'});

function renderPage(id){if(id==='dashboard')renderDashboard();if(id==='entry')renderEntry();if(id==='yearly')renderYearly();if(id==='compare')renderCompare();if(id==='monthly')renderMonthly();if(id==='report')renderReport();if(id==='import')renderImport()}
function renderAllVisible(){populateFilters();renderPage(document.querySelector('.page.active')?.id||'dashboard')}

function canvas(id){const c=$(id),w=c.clientWidth||900,h=c.clientHeight||330,r=devicePixelRatio||1;c.width=w*r;c.height=h*r;const ctx=c.getContext('2d');ctx.scale(r,r);return{ctx,w,h}}
function frame(ctx,w,h,max,right=18,tickStep=null,min=0){const p={l:52,r:right,t:34,b:38},pw=w-p.l-p.r,ph=h-p.t-p.b,steps=tickStep?Math.max(1,Math.ceil(max/tickStep)):4,axisMax=tickStep?steps*tickStep:max,axisMin=min;ctx.font='10px Noto Sans KR';ctx.strokeStyle='#e1e5e3';ctx.fillStyle='#68756f';ctx.textAlign='right';for(let i=0;i<=steps;i++){const y=p.t+ph*i/steps,value=axisMin+(axisMax-axisMin)*(steps-i)/steps;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(w-p.r,y);ctx.stroke();ctx.fillText(nf.format(Math.round(value)),p.l-7,y+3)}return{p,pw,ph,axisMax,axisMin}}
function drawBars(id,labels,values,color){const{ctx,w,h}=canvas(id),nums=values.filter(x=>x!=null),max=Math.max(...nums,1)*1.12,{p,pw,ph}=frame(ctx,w,h,max),gap=pw/labels.length,bw=Math.min(34,gap*.58);labels.forEach((label,i)=>{const v=values[i];if(v!=null){const bh=v/max*ph,x=p.l+i*gap+(gap-bw)/2,y=p.t+ph-bh;ctx.fillStyle=color;ctx.fillRect(x,y,bw,bh);ctx.fillStyle='#24312d';ctx.textAlign='center';ctx.fillText(nf.format(Math.round(v)),x+bw/2,y-5)}ctx.fillStyle='#68756f';ctx.textAlign='center';ctx.fillText(label,p.l+i*gap+gap/2,h-12)})}
function drawReadableLines(id,data,years,valueFor=(item)=>item.total,tickStep=null,focusRange=false){
  const {ctx,w,h}=canvas(id),series=years.map(year=>({year,values:Array.from({length:12},(_,index)=>{const items=data.filter(item=>item.year===year&&item.month===index+1);if(!items.length)return null;const value=items.reduce((sum,item)=>sum+valueFor(item),0)/items.length;return focusRange&&value===0?null:value})}));
  const nums=series.flatMap(item=>item.values).filter(value=>value!=null),dataMin=nums.length?Math.min(...nums):0,dataMax=Math.max(...nums,1),spread=Math.max(dataMax-dataMin,dataMax*.06,1),axisFloor=focusRange?Math.max(0,dataMin-spread*.16):0,rawMax=focusRange?dataMax+spread*.16:dataMax*1.08,{p,pw,ph,axisMax,axisMin}=frame(ctx,w,h,rawMax,128,tickStep,axisFloor),valueY=value=>p.t+ph-(value-axisMin)/(axisMax-axisMin)*ph,x=index=>p.l+pw*index/11,seriesGap=12,seriesX=(month,index)=>x(month)+(index-(series.length-1)/2)*seriesGap,dashes=years.map(()=>[]);
  ctx.font='700 12px Noto Sans KR';ctx.textAlign='left';series.forEach((item,index)=>{const legendX=p.l+index*Math.min(105,(pw+70)/Math.max(series.length,1));ctx.strokeStyle=colors[index%colors.length];ctx.lineWidth=3;ctx.setLineDash(dashes[index%dashes.length]);ctx.beginPath();ctx.moveTo(legendX,16);ctx.lineTo(legendX+25,16);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=colors[index%colors.length];ctx.fillText(`${item.year}년`,legendX+31,20)});
  series.forEach((item,index)=>{ctx.strokeStyle=colors[index%colors.length];ctx.lineWidth=3;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash(dashes[index%dashes.length]);ctx.beginPath();let started=false;item.values.forEach((value,month)=>{if(value==null){started=false;return}const y=valueY(value);if(started)ctx.lineTo(seriesX(month,index),y);else ctx.moveTo(seriesX(month,index),y);started=true});ctx.stroke();ctx.setLineDash([]);item.values.forEach((value,month)=>{if(value==null)return;const y=valueY(value);ctx.fillStyle='#fff';ctx.strokeStyle=colors[index%colors.length];ctx.lineWidth=2;ctx.beginPath();ctx.arc(seriesX(month,index),y,4,0,Math.PI*2);ctx.fill();ctx.stroke()})});
  const lastMonths=series.map(item=>item.values.reduce((last,value,current)=>value!=null?current:last,-1)),labelPositions=new Map();
  for(let month=0;month<12;month++){
    const labels=series.map((item,index)=>item.values[month]==null?null:{index,y:valueY(item.values[month])-10}).filter(Boolean).sort((a,b)=>a.y-b.y);
    for(let index=1;index<labels.length;index++)labels[index].y=Math.max(labels[index].y,labels[index-1].y+16);
    if(labels.length&&labels.at(-1).y>p.t+ph-4){const shift=labels.at(-1).y-(p.t+ph-4);labels.forEach(label=>label.y-=shift)}
    if(labels.length&&labels[0].y<p.t+12){const shift=p.t+12-labels[0].y;labels.forEach(label=>label.y+=shift)}
    labels.forEach(label=>labelPositions.set(`${label.index}-${month}`,label.y));
  }
  series.forEach((item,index)=>item.values.forEach((value,month)=>{if(value==null||month===lastMonths[index])return;const y=labelPositions.get(`${index}-${month}`),label=nf.format(Math.round(value));ctx.font='700 10px Noto Sans KR';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.96)';ctx.strokeText(label,seriesX(month,index),y);ctx.fillStyle=colors[index%colors.length];ctx.fillText(label,seriesX(month,index),y)}));
  const endpoints=series.map((item,index)=>{const month=item.values.reduce((last,value,current)=>value!=null?current:last,-1);return month<0?null:{index,year:item.year,month,value:item.values[month],y:valueY(item.values[month])}}).filter(Boolean).sort((a,b)=>a.y-b.y);for(let index=1;index<endpoints.length;index++)endpoints[index].y=Math.max(endpoints[index].y,endpoints[index-1].y+20);if(endpoints.length&&endpoints.at(-1).y>p.t+ph-5){const shift=endpoints.at(-1).y-(p.t+ph-5);endpoints.forEach(item=>item.y-=shift)}
  endpoints.forEach(item=>{const pointY=valueY(item.value),startX=seriesX(item.month,item.index)+6,labelX=w-112;ctx.strokeStyle=colors[item.index%colors.length];ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(startX,pointY);ctx.lineTo(labelX-6,item.y);ctx.stroke();ctx.font='700 11px Noto Sans KR';ctx.textAlign='left';ctx.fillStyle=colors[item.index%colors.length];ctx.fillText(`${item.year}년 · ${nf.format(Math.round(item.value))}명`,labelX,item.y+4)});
  ctx.font='12px Noto Sans KR';ctx.textAlign='center';ctx.fillStyle='#52615b';for(let month=0;month<12;month++)ctx.fillText(`${month+1}월`,x(month),h-12)
}
function drawDashboardHeatmap(id,data,years,valueFor=(item)=>item.total,zeroIsNull=false){
  const {ctx,w,h}=canvas(id),months=Array.from({length:12},(_,index)=>index+1);
  const matrix=years.map(year=>months.map(month=>{const items=data.filter(item=>item.year===year&&item.month===month);if(!items.length)return null;const value=items.reduce((sum,item)=>sum+valueFor(item),0)/items.length;return zeroIsNull&&value===0?null:value}));
  const values=matrix.flat().filter(value=>value!=null),min=values.length?Math.min(...values):0,max=Math.max(...values,1),range=Math.max(max-min,1);
  const left=70,right=24,top=62,gap=4,cellWidth=(w-left-right-gap*11)/12,cellHeight=48;
  ctx.font='12px Noto Sans KR';ctx.textAlign='center';ctx.fillStyle='#52615b';
  months.forEach((month,index)=>ctx.fillText(`${month}월`,left+index*(cellWidth+gap)+cellWidth/2,top-15));
  matrix.forEach((row,rowIndex)=>{
    const y=top+rowIndex*(cellHeight+gap);ctx.textAlign='right';ctx.font='700 13px Noto Sans KR';ctx.fillStyle='#34433d';ctx.fillText(`${years[rowIndex]}년`,left-12,y+cellHeight/2+5);
    row.forEach((value,columnIndex)=>{const x=left+columnIndex*(cellWidth+gap);if(value==null){ctx.fillStyle='#f0f2f1'}else{const intensity=(value-min)/range,alpha=.16+intensity*.78;ctx.fillStyle=`rgba(49,95,82,${alpha})`}ctx.fillRect(x,y,cellWidth,cellHeight);if(value!=null&&cellWidth>=34){ctx.font='700 11px Noto Sans KR';ctx.textAlign='center';ctx.fillStyle=(value-min)/range>.5?'#fff':'#24312d';ctx.fillText(nf.format(Math.round(value)),x+cellWidth/2,y+cellHeight/2+4)}})
  });
  const legendWidth=150,legendX=w-right-legendWidth,gradient=ctx.createLinearGradient(legendX,0,legendX+legendWidth,0);gradient.addColorStop(0,'rgba(49,95,82,.16)');gradient.addColorStop(1,'rgba(49,95,82,.94)');ctx.fillStyle=gradient;ctx.fillRect(legendX,20,legendWidth,8);ctx.font='10px Noto Sans KR';ctx.fillStyle='#68756f';ctx.textAlign='left';ctx.fillText('낮음',legendX,17);ctx.textAlign='right';ctx.fillText('높음',legendX+legendWidth,17);
  const averages=matrix.map(row=>{const nums=row.filter(value=>value!=null);return nums.length?nums.reduce((sum,value)=>sum+value,0)/nums.length:null}),barMax=Math.max(...averages.filter(value=>value!=null),1),barTop=top+years.length*(cellHeight+gap)+38,barLeft=left+58,barRight=w-right-58,barWidth=barRight-barLeft;
  ctx.font='700 13px Noto Sans KR';ctx.textAlign='left';ctx.fillStyle='#34433d';ctx.fillText('연도별 월평균',left,barTop-18);
  averages.forEach((value,index)=>{const y=barTop+index*27;ctx.font='11px Noto Sans KR';ctx.textAlign='right';ctx.fillStyle='#52615b';ctx.fillText(`${years[index]}년`,barLeft-10,y+11);ctx.fillStyle='#e8eeeb';ctx.fillRect(barLeft,y,barWidth,15);if(value!=null){const width=value/barMax*barWidth;ctx.fillStyle=colors[index%colors.length];ctx.fillRect(barLeft,y,width,15);ctx.font='700 11px Noto Sans KR';ctx.textAlign='left';ctx.fillStyle='#24312d';ctx.fillText(nf.format(Math.round(value)),Math.min(barLeft+width+7,w-right-35),y+12)}})
}
function drawMultiYear(id,data,years,valueFor=(item)=>item.total,tickStep=500){
  const {ctx,w,h}=canvas(id);
  const series=years.map(year=>({year,v:Array.from({length:12},(_,month)=>{
    const items=data.filter(item=>item.year===year&&item.month===month+1);
    return items.length?items.reduce((sum,item)=>sum+valueFor(item),0)/items.length:null;
  })}));
  const nums=series.flatMap(item=>item.v).filter(value=>value!=null);
  const rawMax=Math.max(...nums,1)*1.05;
  const {p,pw,ph,axisMax}=frame(ctx,w,h,rawMax,88,tickStep);
  const x=month=>p.l+pw*month/11;
  const labelPositions=new Map();

  for(let month=0;month<12;month+=1){
    const labels=series.map((item,seriesIndex)=>item.v[month]==null?null:{seriesIndex,y:p.t+ph-item.v[month]/axisMax*ph-11}).filter(Boolean).sort((a,b)=>a.y-b.y);
    for(let index=1;index<labels.length;index+=1) labels[index].y=Math.max(labels[index].y,labels[index-1].y+18);
    if(labels.length&&labels.at(-1).y>p.t+ph-5){const shift=labels.at(-1).y-(p.t+ph-5);labels.forEach(label=>label.y-=shift)}
    if(labels.length&&labels[0].y<p.t+12){const shift=p.t+12-labels[0].y;labels.forEach(label=>label.y+=shift)}
    labels.forEach(label=>labelPositions.set(`${label.seriesIndex}-${month}`,label.y));
  }

  series.forEach((item,seriesIndex)=>{
    ctx.strokeStyle=colors[seriesIndex];ctx.lineWidth=3.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();let started=false;
    item.v.forEach((value,month)=>{if(value==null){started=false;return}const y=p.t+ph-value/axisMax*ph;started?ctx.lineTo(x(month),y):ctx.moveTo(x(month),y);started=true});ctx.stroke();
    item.v.forEach((value,month)=>{if(value==null)return;const y=p.t+ph-value/axisMax*ph;ctx.fillStyle=colors[seriesIndex];ctx.beginPath();ctx.arc(x(month),y,5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();const labelY=labelPositions.get(`${seriesIndex}-${month}`);ctx.font='700 12px Noto Sans KR';ctx.textAlign='center';ctx.lineWidth=3.5;ctx.strokeStyle='rgba(255,255,255,.95)';ctx.strokeText(nf.format(Math.round(value)),x(month),labelY);ctx.fillStyle=colors[seriesIndex];ctx.fillText(nf.format(Math.round(value)),x(month),labelY)});
    const lastIndex=item.v.reduce((found,value,index)=>value!=null?index:found,-1);
    if(lastIndex>=0){const y=p.t+ph-item.v[lastIndex]/axisMax*ph,labelX=w-70;ctx.strokeStyle=colors[seriesIndex];ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x(lastIndex)+6,y);ctx.lineTo(labelX-5,y);ctx.stroke();ctx.fillStyle=colors[seriesIndex];ctx.font='700 12px Noto Sans KR';ctx.textAlign='left';ctx.fillText(`${item.year}년`,labelX,y+4)}
  });
  series.forEach((item,seriesIndex)=>item.v.forEach((value,month)=>{
    if(value==null)return;
    const labelY=labelPositions.get(`${seriesIndex}-${month}`),label=nf.format(Math.round(value));
    ctx.font='700 12px Noto Sans KR';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.strokeText(label,x(month),labelY);ctx.fillStyle=colors[seriesIndex];ctx.fillText(label,x(month),labelY);
  }));
  ctx.font='12px Noto Sans KR';ctx.textAlign='center';ctx.fillStyle='#52615b';for(let month=0;month<12;month+=1)ctx.fillText(`${month+1}월`,x(month),h-12);
}
function drawGrouped(id,sets,cutoff,overlayLines=false){
  const comparisonColors=['#47796b','#d2ad72','#91a9a1','#b9948e','#7e98ad'];
  const {ctx,w,h}=canvas(id),months=Array.from({length:12},(_,i)=>i+1).filter(m=>m<=Number(cutoff.slice(0,2))),vals=sets.map(s=>months.map(m=>monthlyAverage(s.items,s.year,m))),nums=vals.flat().filter(x=>x!=null),max=Math.max(...nums,1)*1.16,{p,pw,ph}=frame(ctx,w,h,max),gw=pw/months.length,bw=Math.max(5,Math.min(24,gw*.72/Math.max(sets.length,1)));
  months.forEach((m,mi)=>{
    if(mi%2===0){ctx.fillStyle='rgba(49,95,82,.035)';ctx.fillRect(p.l+mi*gw,p.t,gw,ph)}
    sets.forEach((s,si)=>{
      const v=vals[si][mi];if(v==null)return;
      const bh=v/max*ph,x=p.l+mi*gw+(gw-bw*sets.length)/2+si*bw,y=p.t+ph-bh;
      ctx.fillStyle=comparisonColors[si%comparisonColors.length];ctx.fillRect(x,y,Math.max(2,bw-2),bh);
      ctx.font='700 10px Noto Sans KR';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.96)';ctx.strokeText(nf.format(Math.round(v)),x+(bw-2)/2,y-6);ctx.fillStyle=comparisonColors[si%comparisonColors.length];ctx.fillText(nf.format(Math.round(v)),x+(bw-2)/2,y-6);
    });
    ctx.font='11px Noto Sans KR';ctx.fillStyle='#52615b';ctx.textAlign='center';ctx.fillText(`${m}월`,p.l+mi*gw+gw/2,h-12);
  });
  if(overlayLines){
    sets.forEach((set,si)=>{
      ctx.strokeStyle=comparisonColors[si%comparisonColors.length];ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();let started=false;
      vals[si].forEach((value,mi)=>{if(value==null){started=false;return}const x=p.l+mi*gw+(gw-bw*sets.length)/2+si*bw+(bw-2)/2,y=p.t+ph-value/max*ph;if(started)ctx.lineTo(x,y);else ctx.moveTo(x,y);started=true});ctx.stroke();
      vals[si].forEach((value,mi)=>{if(value==null)return;const x=p.l+mi*gw+(gw-bw*sets.length)/2+si*bw+(bw-2)/2,y=p.t+ph-value/max*ph;ctx.fillStyle='#fff';ctx.strokeStyle=comparisonColors[si%comparisonColors.length];ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();ctx.stroke()});
    });
  }
  ctx.textAlign='left';ctx.font='700 11px Noto Sans KR';sets.forEach((s,i)=>{const legendX=p.l+i*86;ctx.fillStyle=comparisonColors[i%comparisonColors.length];ctx.fillRect(legendX,10,18,5);ctx.fillStyle='#52615b';ctx.fillText(`${s.year}년`,legendX+24,17)});
}

window.addEventListener('resize',()=>{if(window.innerWidth>768)setMobileMenu(false);clearTimeout(window.resizeTimer);window.resizeTimer=setTimeout(()=>renderPage(document.querySelector('.page.active')?.id),150)});
$('admin-login-form').addEventListener('submit',async(event)=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;setAuthMessage('로그인 중입니다.');
  try {const {error}=await supabaseClient.auth.signInWithPassword({email:form.email.value.trim(),password:form.password.value});if(error)throw new Error(`로그인 실패: ${error.message}`);form.password.value='';setAuthMessage('로그인했습니다.')}catch(error){console.error(error);setAuthMessage(error.message,true)}finally{button.disabled=false}
});
$('admin-logout').addEventListener('click',async()=>{
  $('admin-logout').disabled=true;
  try {const {error}=await supabaseClient.auth.signOut();if(error)throw new Error(`로그아웃 실패: ${error.message}`);setAuthMessage('로그아웃했습니다.')}catch(error){console.error(error);setAuthMessage(error.message,true)}finally{$('admin-logout').disabled=false}
});
loadAttendanceFromSupabase().then(async()=>{await initializeAdminAuth();populateFilters();const initial=location.hash.slice(1)||settings.defaultPage||'dashboard';showPage($(initial)?initial:'dashboard')}).catch(error=>{console.error(error);setAuthMessage(error.message,true);populateFilters();showPage('dashboard')});
