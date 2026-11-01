import {createReader} from '../analysis/reader.mjs';
import {buildYear, monthMatrix, todayKorea} from './model.mjs';
import {workbook} from './xlsx.mjs';
const $ = id => document.getElementById(id);
const select = $('dd-year'), status = $('dd-status');
const yearNow = Number(todayKorea().slice(0,4));
for(let y=yearNow;y>=2023;y--) select.add(new Option(`${y}년`,y));
let months = null, request = 0, authTransition = false;
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isAdmin = () => !authTransition && window.WORSHIP_ADMIN_ACCESS?.() === true;
function updateActions() {
  for(const id of ['dd-export','dd-print']) {$(id).hidden=!isAdmin();$(id).disabled=!isAdmin()||!months;}
}
document.addEventListener('worship:admin-state',()=>{authTransition=false;updateActions();});
// Hide on transitions; the existing app rechecks app_admins and publishes its decision.
supabaseClient.auth.onAuthStateChange(event=>{if(event!=='INITIAL_SESSION')authTransition=true;updateActions();});
updateActions();
function setStatus(message='') {status.textContent=message;status.hidden=!message;}
async function load() {
  const token=++request, year=Number(select.value);
  months=null; $('dd-months').replaceChildren();updateActions();
  setStatus('새벽예배 일별 기록을 조회하고 있습니다…');
  try {
    const reader=createReader({publishableKey:window.WORSHIP_SUPABASE_CONFIG?.publishableKey});
    const rows=await reader.read({table:'dawn_attendance',columns:['onsite','online','total','note'],start:`${year}-01-01`,end:`${year}-12-31`});
    if(token!==request)return;
    months=buildYear(rows,year);
    $('dd-months').innerHTML=months.map(month=>{
      const matrix=monthMatrix(month,year);
      return `<article class="panel dd-month"><h2>${year}년 ${month.month}월</h2><div class="dd-scroll" tabindex="0" role="region" aria-label="${month.month}월 출석표"><table class="dd-table"><caption>${year}년 ${month.month}월 새벽 일별 현황</caption><thead>${matrix.slice(0,2).map(row=>`<tr>${row.map(v=>`<th scope="col">${escape(v??'')}</th>`).join('')}</tr>`).join('')}</thead><tbody>${matrix.slice(2).map((row,r)=>`<tr>${row.map((v,c)=>{
        const tag=c===0?'th':'td';
        const content=r===3&&c>0?(v?`<button type="button" class="dd-note-trigger" data-note-date="${month.days[c-1].date}" title="${escape(v)}" aria-label="${month.days[c-1].date} 비고 전체 보기">${escape(v)}</button>`:''):v===null?'—':escape(v);
        return `<${tag} ${c===0?'scope="row"':''} class="${r===3?'dd-note':''}">${content}</${tag}>`;
      }).join('')}</tr>`).join('')}</tbody></table></div></article>`;
    }).join('');
    const mismatches=months.flatMap(m=>m.days).filter(d=>d.mismatch).length;
    setStatus(mismatches?`현장+온라인 불일치 ${mismatches}건: 기존 통계와 동일한 저장 합계를 유지합니다.`:'');updateActions();
  } catch(error) {if(token===request)setStatus(`조회 실패: ${error.message} 새로고침으로 다시 시도해주세요.`);}
}
$('dd-months').addEventListener('click',event=>{
  const button=event.target.closest('[data-note-date]');if(!button||!months)return;
  const day=months.flatMap(m=>m.days).find(d=>d.date===button.dataset.noteDate);if(!day?.note)return;
  $('dd-note-title').textContent=`${day.date} 비고`;$('dd-note-full').textContent=day.note;$('dd-note-dialog').showModal();
});
select.addEventListener('change',load);$('dd-refresh').addEventListener('click',load);
$('dd-export').addEventListener('click',()=>{
  if(!isAdmin()||!months)return;
  const url=URL.createObjectURL(new Blob([workbook(months,Number(select.value))],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=`${select.value}년_새벽_일별현황.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('dd-print').addEventListener('click',()=>{if(!isAdmin()||!months)return;document.body.classList.add('dd-printing');window.print();});
// Native browser printing remains available for this public static page.
window.addEventListener('beforeprint',()=>document.body.classList.toggle('dd-printing',$('dawn-daily').classList.contains('active')));
window.addEventListener('afterprint',()=>document.body.classList.remove('dd-printing'));
new MutationObserver(()=>{if($('dawn-daily').classList.contains('active'))load();}).observe($('dawn-daily'),{attributes:true,attributeFilter:['class']});
if($('dawn-daily').classList.contains('active'))load();
