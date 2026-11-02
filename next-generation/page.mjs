import {createReader} from '../analysis/reader.mjs';
import {koreaToday} from '../analysis/dates.mjs';
import {createAnalysis,departments,columns} from './model.mjs';
import {chart} from './charts.mjs';

// Application-level screen/request gating only. The existing source data remains publicly readable.
// This does not change Supabase RLS, conceal public data or create a separate authentication system.
const $=id=>document.getElementById(id),section=$('next-generation'),content=$('ng-content'),menu=$('ng-menu');
const nf=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value=v=>v===null?'자료 없음':`${nf.format(v)}명`;
const period=r=>r.empty?'조회 기간이 아직 시작되지 않았습니다':`${r.start} ~ ${r.end}`;
let analysis=null,request=0,controller=null,authTransition=false,loading=false;
const allowed=()=>!authTransition&&window.WORSHIP_ADMIN_ACCESS?.()===true;
const active=()=>section.classList.contains('active');
for(let m=1;m<=12;m++)$('ng-month').add(new Option(`${m}월`,m));
for(const [key,label]of Object.entries(departments))$('ng-department').add(new Option(label,key));
function status(text=''){$('ng-status').textContent=text;$('ng-status').hidden=!text;}
function clear(){
 analysis=null;request++;controller?.abort();controller=null;loading=false;
 for(const id of ['ng-students','ng-teachers','ng-total','ng-yoy'])$(id).textContent='—';
 for(const id of ['ng-period','ng-student-count','ng-teacher-count','ng-ratio','ng-yoy-basis','ng-notices','ng-detail-count','ng-trend','ng-department-chart','ng-year-chart','ng-department-rows','ng-comparison-rows','ng-year-rows','ng-detail-rows'])$(id).replaceChildren();
 status();
}
function revoke(){menu.hidden=true;content.hidden=true;$('ng-access').hidden=false;clear();}
function syncGate(){
 if(!allowed()){revoke();return;}
 menu.hidden=false;$('ng-access').hidden=true;
 content.hidden=!active();if(active()&&!analysis&&!loading)load();
}
document.addEventListener('worship:admin-state',()=>{authTransition=false;syncGate();});
if(typeof supabaseClient!=='undefined'&&supabaseClient)supabaseClient.auth.onAuthStateChange(event=>{
 if(event==='INITIAL_SESSION'){syncGate();return;}
 authTransition=true;revoke();
 if(event==='SIGNED_OUT'&&active())window.showPage('entry');
});
new MutationObserver(()=>{
 if(!active()){content.hidden=true;controller?.abort();return;}
 if(!allowed()){revoke();return;}
 content.hidden=false;$('ng-access').hidden=true;load();
}).observe(section,{attributes:true,attributeFilter:['class']});
window.addEventListener('hashchange',()=>{if(location.hash==='#next-generation'){if(!active())window.showPage('next-generation');else syncGate();}});

async function load(){
 if(!allowed()||!active())return;
 controller?.abort();const localController=new AbortController();controller=localController;const token=++request;
 analysis=null;loading=true;status('출석 자료를 조회하고 있습니다…');
 for(const id of ['ng-year','ng-month','ng-department','ng-refresh'])$(id).disabled=true;
  for(const id of ['ng-students','ng-teachers','ng-total','ng-yoy']){$(id).textContent='—';$(id).removeAttribute('title');}
  for(const id of ['ng-student-count','ng-teacher-count','ng-ratio','ng-yoy-basis','ng-notices','ng-detail-count'])$(id).replaceChildren();
  $('ng-notices').hidden=true;
 for(const id of ['ng-trend','ng-department-chart','ng-year-chart','ng-department-rows','ng-comparison-rows','ng-year-rows','ng-detail-rows'])$(id).replaceChildren();
 const timeout=setTimeout(()=>localController.abort(),30000);
 try{
  const reader=createReader({publishableKey:window.WORSHIP_SUPABASE_CONFIG?.publishableKey,fetchImpl:(url,options)=>{
   if(!allowed()||!active()||token!==request||localController.signal.aborted)throw new Error('관리자 접근이 해제되었습니다.');
   return fetch(url,options);
  }});
  const asOf=koreaToday();
  const rows=await reader.read({table:'sunday_attendance',columns,start:'2022-01-01',end:`${asOf.slice(0,4)}-12-31`,signal:localController.signal});
  if(!allowed()||!active()||token!==request)return;
  analysis=createAnalysis(rows,{asOf});
  const old=Number($('ng-year').value),years=analysis.years.length?analysis.years:[Number(asOf.slice(0,4))];
  $('ng-year').replaceChildren(...[...years].reverse().map(y=>new Option(`${y}년`,y)));
  $('ng-year').value=String(years.includes(old)?old:years.at(-1));
  status();render();
 }catch(error){
  if(token===request&&allowed()&&active()){analysis=null;status(localController.signal.aborted?'조회를 취소했거나 시간이 초과됐습니다. 새로고침으로 다시 조회해주세요.':`조회 실패: ${error.message}`);}
 }finally{
  clearTimeout(timeout);
  if(token===request){loading=false;for(const id of ['ng-year','ng-month','ng-department','ng-refresh'])$(id).disabled=!allowed();}
 }
}
function change(c){
 if(c.reason==='no-data')return '비교 자료 없음';
 const delta=`${c.difference>0?'+':''}${nf.format(c.difference)}명`;
 return `<span class="${c.difference>0?'up':c.difference<0?'down':''}">${delta} (${c.percent===null?'비교 불가':`${c.percent>0?'+':''}${nf.format(c.percent)}%`})</span>`;
}
function comparisonRow(label,current,previous,changes){
 return `<tr><th scope="row">${label}</th><td>${period(current.range)}<span class="ng-comparison-period">비교 ${period(previous.range)} · 학생 ${current.students.count}/${previous.students.count}회 · 교사 ${current.teachers.count}/${previous.teachers.count}회</span></td>${['students','teachers','total'].map(k=>`<td>${change(changes[k])}</td>`).join('')}</tr>`;
}
function render(){
 if(!allowed()||!active()||!analysis)return;
 const data=analysis.view({year:Number($('ng-year').value),month:Number($('ng-month').value),selection:$('ng-department').value});
 $('ng-period').textContent=`${period(data.range)} · ${data.selection==='all'?'전체':departments[data.selection]} · 평균은 0명·미입력 제외, 합계는 주일별 합산 기준`;
 $('ng-students').textContent=value(data.current.students.mean);$('ng-teachers').textContent=value(data.current.teachers.mean);$('ng-total').textContent=value(data.current.total.mean);
 for(const [id,k]of [['ng-students','students'],['ng-teachers','teachers'],['ng-total','total']])$(id).title=data.current[k].mean===null?'유효 기록 없음':`합계 ${data.current[k].sum} / 유효 ${data.current[k].count}회 = ${data.current[k].mean}`;
 $('ng-student-count').textContent=`유효 기록 ${data.current.students.count}회`;$('ng-teacher-count').textContent=`유효 기록 ${data.current.teachers.count}회`;
 $('ng-ratio').textContent=data.current.ratio===null?'교사 1명당 학생: 자료 없음':`교사 1명당 학생 ${nf.format(data.current.ratio)}명 · 동시 기록 ${data.current.ratioCount}회`;
 $('ng-yoy').innerHTML=change(data.changes.students);$('ng-yoy-basis').textContent=`${data.year-1}년 동일 기간 대비`;
 const notices=[];
 if(data.current.legacyCount)notices.push(`부서 내역이 없는 ${data.current.legacyCount}개 주일은 저장 학생 합계만 전체 통계에 포함하며 부서별 분석에서는 제외합니다.`);
 if(data.youthTeacherUnknown)notices.push('젊은이 교사는 유효한 양수 기록이 없어 실제 교사 출석 규모를 확인할 수 없습니다.');
 if(data.current.mismatches)notices.push(`저장 합계와 부서 합계가 다른 기록 ${data.current.mismatches}건은 저장 합계를 유지합니다.`);
 $('ng-notices').textContent=notices.join(' ');$('ng-notices').hidden=!notices.length;
 $('ng-trend-title').textContent=data.month?`${data.year}년 ${data.month}월 주일별 출석 추이`:'월별 출석 추이';
 $('ng-trend').innerHTML=chart(data.trend,{title:$('ng-trend-title').textContent});
 $('ng-department-chart').innerHTML=chart(data.departmentRows.map(r=>({label:r.label,students:r.current.students.mean,teachers:r.current.teachers.mean,studentCount:r.current.students.count,teacherCount:r.current.teachers.count})),{title:'부서별 평균 출석',bars:true});
 $('ng-department-rows').innerHTML=data.departmentRows.map(r=>`<tr class="${r.key==='visioncamp'?'ng-reference':''}"><th scope="row">${r.label}${r.key==='visioncamp'?' (통합 참고)':''}</th>${['students','teachers','total'].map(k=>`<td title="유효 ${r.current[k].count}회">${value(r.current[k].mean)}</td>`).join('')}<td>${change(r.changes.students)}</td><td>${change(r.changes.teachers)}</td></tr>`).join('');
 $('ng-comparison-rows').innerHTML=comparisonRow('전년 동일 기간',data.current,data.previous,data.changes)+comparisonRow('전월 동일 기간',data.monthComparison.current,data.monthComparison.previous,data.monthComparison.changes);
 $('ng-year-chart').innerHTML=chart(data.annual.map(r=>({label:`${r.year}년`,students:r.current.students.mean,teachers:r.current.teachers.mean,studentCount:r.current.students.count,teacherCount:r.current.teachers.count})),{title:'동일 기간 연도별 출석 변화'});
 $('ng-year-rows').innerHTML=data.annual.map(r=>`<tr><th scope="row">${r.year}년</th><td>${period(r.current.range)}</td><td>${r.current.students.count}/${r.current.teachers.count}회</td>${['students','teachers','total'].map(k=>`<td>${value(r.current[k].mean)}</td>`).join('')}${['students','teachers','total'].map(k=>`<td>${change(r.changes[k])}</td>`).join('')}</tr>`).join('');
 $('ng-detail-count').textContent=`${data.current.records}개 주일 · 수정 불가`;
 $('ng-detail-rows').innerHTML=data.details.length?data.details.map(r=>`<tr class="${r.isTotal?'ng-total':''}"><td>${r.date}</td><th scope="row">${escape(r.label)}</th>${['teachers','students','total'].map(k=>`<td>${r[k]===null?'—':nf.format(r[k])}</td>`).join('')}</tr>`).join(''):'<tr><td colspan="5" class="ng-empty">선택한 조건에 출석 자료가 없습니다.</td></tr>';
}
for(const id of ['ng-year','ng-month','ng-department'])$(id).addEventListener('change',render);
$('ng-refresh').addEventListener('click',load);
syncGate();
