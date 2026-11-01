import {createReader} from '../analysis/reader.mjs';
import {buildYear, monthMatrix, todayKorea} from './model.mjs';
import {workbook} from './xlsx.mjs';
const $ = id => document.getElementById(id);
const select = $('dd-year'), status = $('dd-status');
const yearNow = Number(todayKorea().slice(0,4));
for(let y=yearNow;y>=2023;y--) select.add(new Option(`${y}년`,y));
let months = null, request = 0;
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function load() {
  const token=++request, year=Number(select.value);
  months=null; $('dd-months').replaceChildren();
  $('dd-export').disabled=$('dd-print').disabled=true;
  status.textContent='새벽예배 일별 기록을 조회하고 있습니다…';
  try {
    const reader=createReader({publishableKey:window.WORSHIP_SUPABASE_CONFIG?.publishableKey});
    const rows=await reader.read({table:'dawn_attendance',columns:['onsite','online','total','note'],start:`${year}-01-01`,end:`${year}-12-31`});
    if(token!==request)return;
    months=buildYear(rows,year);
    $('dd-months').innerHTML=months.map(month=>{
      const matrix=monthMatrix(month,year);
      return `<article class="panel dd-month"><h2>${year}년 ${month.month}월 <small>기록 ${month.recordCount}회 · 현장 ${month.counts[0]}회 / 온라인 ${month.counts[1]}회 / 합계 ${month.counts[2]}회</small></h2><div class="dd-scroll" tabindex="0" role="region" aria-label="${month.month}월 출석표, 좌우 스크롤"><table class="dd-table"><caption>${year}년 ${month.month}월 새벽 일별 현황</caption><thead>${matrix.slice(0,2).map(row=>`<tr>${row.map((v,c)=>`<th scope="col" class="${month.days[c-1]?.future?'dd-future':''}">${escape(v??'')}</th>`).join('')}</tr>`).join('')}</thead><tbody>${matrix.slice(2).map((row,r)=>`<tr>${row.map((v,c)=>{const tag=c===0?'th':'td';return `<${tag} ${c===0?'scope="row"':''} class="${month.days[c-1]?.future?'dd-future':''} ${r===3?'dd-note':''}">${v===null?'—':escape(v)}</${tag}>`}).join('')}</tr>`).join('')}</tbody></table></div></article>`;
    }).join('');
    const mismatches=months.flatMap(m=>m.days).filter(d=>d.mismatch).length;
    status.textContent=`${year}년 · 실제 기록 ${rows.length}회${rows.length?'':' · 일별 자료가 없습니다.'}${mismatches?` · 현장+온라인 불일치 ${mismatches}건: 기존 통계와 동일한 저장 합계를 유지합니다. 비고를 확인해주세요.`:''}`;
    $('dd-export').disabled=$('dd-print').disabled=false;
  } catch(error) { if(token===request)status.textContent=`조회 실패: ${error.message} 새로고침으로 다시 시도해주세요.`; }
}
select.addEventListener('change',load);
$('dd-refresh').addEventListener('click',load);
$('dd-export').addEventListener('click',()=>{
  if(!months)return;
  const url=URL.createObjectURL(new Blob([workbook(months,Number(select.value))],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=`${select.value}년_새벽_일별현황.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('dd-print').addEventListener('click',()=>{document.body.classList.add('dd-printing');window.print();});
window.addEventListener('beforeprint',()=>document.body.classList.toggle('dd-printing',$('dawn-daily').classList.contains('active')));
window.addEventListener('afterprint',()=>document.body.classList.remove('dd-printing'));
// Observe existing navigation without changing app.js or its render/chart pipeline.
new MutationObserver(()=>{if($('dawn-daily').classList.contains('active'))load();}).observe($('dawn-daily'),{attributes:true,attributeFilter:['class']});
if($('dawn-daily').classList.contains('active'))load();
