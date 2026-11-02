import {DEPARTMENTS,WEEK_SLOT} from '../analysis/catalog.mjs';
import {date,day,calendar,koreaToday,previousYear} from '../analysis/dates.mjs';

export const departments=Object.freeze({...DEPARTMENTS,visioncamp:'비전캠프 통합'});
export const columns=Object.freeze(['note','school','school_teachers','school_legacy',...Object.keys(DEPARTMENTS),...Object.keys(DEPARTMENTS).map(k=>`teacher_${k}`)]);
const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const sum=values=>values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;
const mean=values=>{const valid=values.filter(v=>v!==null&&v>0);return {mean:valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null,count:valid.length,sum:valid.reduce((a,b)=>a+b,0)};};
const keys=Object.keys(DEPARTMENTS);
export function comparison(current,previous){
 if(current===null||previous===null)return {difference:null,percent:null,reason:'no-data'};
 return {difference:current-previous,percent:previous>0?(current-previous)/previous*100:null,reason:previous>0?null:'zero-base'};
}
function monthEnd(year,month){return `${year}-${String(month).padStart(2,'0')}-${new Date(Date.UTC(year,month,0)).getUTCDate()}`;}
export function rangeFor(year,month,asOf){
 date(asOf);if(!Number.isInteger(year)||year<1900||year>9999||!Number.isInteger(month)||month<0||month>12)throw Error('잘못된 조회 기간입니다.');
 const start=`${year}-${String(month||1).padStart(2,'0')}-01`,end=[month?monthEnd(year,month):`${year}-12-31`,asOf].sort()[0];
 return {start,end,empty:start>end};
}
function priorYearRange(range){return {start:previousYear(range.start),end:previousYear(range.end),empty:range.empty};}
function previousMonthRange(range){
 const d=new Date(`${range.start}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()-1);const year=d.getUTCFullYear(),month=d.getUTCMonth()+1;
 const full=range.end===monthEnd(Number(range.start.slice(0,4)),Number(range.start.slice(5,7)));
 const end=full?monthEnd(year,month):`${year}-${String(month).padStart(2,'0')}-${String(Math.min(Number(range.end.slice(8)),Number(monthEnd(year,month).slice(8)))).padStart(2,'0')}`;
 return {start:`${year}-${String(month).padStart(2,'0')}-01`,end,empty:range.empty};
}
function selectedKeys(selection){if(selection==='all')return keys;if(selection==='visioncamp')return ['vision1','vision2'];if(keys.includes(selection))return [selection];throw Error('잘못된 부서입니다.');}

// New-generation-only positive-value averages. Existing worship/analysis engines stay unchanged.
export function createAnalysis(input,{asOf=koreaToday()}={}){
 date(asOf);if(!Array.isArray(input))throw Error('출석 자료 형식이 잘못되었습니다.');
 const seen=new Set();
 const records=input.map(raw=>{
  const d=date(raw.worship_date);if(seen.has(d))throw Error(`중복 출석 날짜: ${d}`);seen.add(d);
  const students=keys.map(k=>num(raw[k])),teachers=keys.map(k=>num(raw[`teacher_${k}`]));
  const studentSum=sum(students),teacherSum=sum(teachers),storedStudents=num(raw.school),storedTeachers=num(raw.school_teachers);
  const legacy=storedStudents>0&&students.every(v=>v===null||v===0);
  const groups=Object.fromEntries(keys.map((k,i)=>[k,{students:students[i],teachers:teachers[i]}]));
  return {date:d,note:raw.note,legacy,groups,
   students:storedStudents??studentSum,teachers:storedTeachers??teacherSum,
   studentMismatch:storedStudents!==null&&studentSum!==null&&!legacy&&storedStudents!==studentSum,
   teacherMismatch:storedTeachers!==null&&teacherSum!==null&&storedTeachers!==teacherSum};
 }).filter(r=>day(r.date)===0&&r.date<=asOf&&r.note!==WEEK_SLOT).sort((a,b)=>a.date.localeCompare(b.date));
 const years=[...new Set(records.map(r=>Number(r.date.slice(0,4))))];
 function point(r,selection){
  if(selection==='all')return {date:r.date,students:r.students,teachers:r.teachers,total:sum([r.students,r.teachers]),legacy:r.legacy};
  const selected=selectedKeys(selection);
  if(r.legacy)return {date:r.date,students:null,teachers:null,total:null,legacy:true};
  const students=sum(selected.map(k=>r.groups[k].students)),teachers=sum(selected.map(k=>r.groups[k].teachers));
  return {date:r.date,students,teachers,total:sum([students,teachers]),legacy:false};
 }
 const inRange=range=>range.empty?[]:records.filter(r=>r.date>=range.start&&r.date<=range.end);
 function summarize(range,selection){
  selectedKeys(selection);const source=inRange(range),points=source.map(r=>point(r,selection));
  const matched=points.filter(p=>p.students>0&&p.teachers>0);
  return {range,students:mean(points.map(p=>p.students)),teachers:mean(points.map(p=>p.teachers)),total:mean(points.map(p=>p.total)),
   ratio:matched.length?matched.reduce((s,p)=>s+p.students,0)/matched.reduce((s,p)=>s+p.teachers,0):null,ratioCount:matched.length,
   records:source.length,legacyCount:source.filter(r=>r.legacy).length,
   mismatches:source.filter(r=>r.studentMismatch||r.teacherMismatch).length};
 }
 function changes(current,previous){return Object.fromEntries(['students','teachers','total'].map(k=>[k,comparison(current[k].mean,previous[k].mean)]));}
 function view({year,month=0,selection='all'}={}){
  selectedKeys(selection);const range=rangeFor(year,month,asOf),previousRange=priorYearRange(range);
  const current=summarize(range,selection),previous=summarize(previousRange,selection);
  const targetMonth=month||(year===Number(asOf.slice(0,4))?Number(asOf.slice(5,7)):12);
  const monthRange=rangeFor(year,targetMonth,asOf),lastMonthRange=previousMonthRange(monthRange);
  const monthlyCurrent=summarize(monthRange,selection),monthlyPrevious=summarize(lastMonthRange,selection);
  const trend=month?calendar(`${year}-${String(month).padStart(2,'0')}-01`,monthEnd(year,month),0).map(d=>{
   const r=records.find(r=>r.date===d),p=r?point(r,selection):null;
   return {label:`${Number(d.slice(8))}일`,date:d,students:p?.students>0?p.students:null,teachers:p?.teachers>0?p.teachers:null,studentCount:p?.students>0?1:0,teacherCount:p?.teachers>0?1:0};
  }):Array.from({length:12},(_,i)=>{
   const s=summarize(rangeFor(year,i+1,asOf),selection);
   return {label:`${i+1}월`,students:s.students.mean,teachers:s.teachers.mean,studentCount:s.students.count,teacherCount:s.teachers.count};
  });
  const departmentKeys=selection==='all'?[...keys,'visioncamp']:selection==='visioncamp'?['vision1','vision2','visioncamp']:[selection];
  const departmentRows=departmentKeys.map(key=>{const c=summarize(range,key),p=summarize(previousRange,key);return {key,label:departments[key],current:c,previous:p,changes:changes(c,p)};});
  // Every year uses the selected period's same month/day cutoff, including the previous-year comparison.
  const annual=years.filter(y=>y<=year).map(y=>{
   const start=`${y}${range.start.slice(4)}`,candidate=`${y}${range.end.slice(4)}`;
   let end;try{end=date(candidate);}catch{end=`${y}-02-28`;}
   const r={start,end,empty:range.empty},c=summarize(r,selection),p=summarize(priorYearRange(r),selection);
   return {year:y,current:c,previous:p,changes:changes(c,p)};
  });
  const details=[];
  for(const r of inRange(range)){
   if(selection==='all'){
    const p=point(r,'all');details.push({...p,label:r.legacy?'전체 · 과거 합계':'전체',isTotal:true});
    if(r.legacy)continue;
    for(const k of keys)details.push({...point(r,k),label:departments[k],isTotal:false});
   }else if(!r.legacy)details.push({...point(r,selection),label:departments[selection],isTotal:false});
  }
  return {year,month,selection,range,current,previous,changes:changes(current,previous),trend,departmentRows,annual,details,
   monthComparison:{current:monthlyCurrent,previous:monthlyPrevious,changes:changes(monthlyCurrent,monthlyPrevious)},
   youthTeacherUnknown:!inRange(range).some(r=>!r.legacy&&r.groups.youth.teachers>0)};
 }
 return Object.freeze({years,view,summarize});
}
