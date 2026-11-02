const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(v);
const colors={students:'#2f6758',teachers:'#e87500'};
// Native SVG charts: accessible point titles, keyboard focus and gaps for missing observations.
export function chart(points,{title,bars=false}={}){
 const values=points.flatMap(p=>[p.students,p.teachers]).filter(v=>v!==null),width=Math.max(720,points.length*(bars?105:62)+90),height=320,pad={l:50,r:24,t:35,b:55};
 if(!values.length)return '<p class="ng-empty">선택한 기간에 유효한 출석 자료가 없습니다.</p>';
 const max=Math.max(...values,1)*1.22,pw=width-pad.l-pad.r,ph=height-pad.t-pad.b;
 const x=i=>pad.l+(i+0.5)*pw/points.length,y=v=>pad.t+ph-v/max*ph;
 let body='';
 for(let i=0;i<=4;i++){const v=max*i/4,yp=y(v);body+=`<line x1="${pad.l}" x2="${width-pad.r}" y1="${yp}" y2="${yp}" stroke="#dce2df"/><text x="${pad.l-8}" y="${yp+4}" text-anchor="end" fill="#68756f">${fmt(v)}</text>`;}
 points.forEach((p,i)=>{body+=`<text x="${x(i)}" y="${height-20}" text-anchor="middle" fill="#68756f">${escape(p.label)}</text>`;});
 for(const [index,key]of ['students','teachers'].entries()){
  const label=key==='students'?'학생':'교사';
  if(!bars){let d='',gap=true;points.forEach((p,i)=>{if(p[key]===null){gap=true;return;}d+=`${gap?'M':'L'}${x(i)},${y(p[key])} `;gap=false;});body+=`<path class="ng-series" data-series="${key}" d="${d}" fill="none" stroke="${colors[key]}" stroke-width="2.5"/>`;}
  points.forEach((p,i)=>{const value=p[key];if(value===null)return;const titleText=`${p.label} · ${label} ${value}명${p[key==='students'?'studentCount':'teacherCount']!=null?` · 유효 ${p[key==='students'?'studentCount':'teacherCount']}회`:''}`;
   const tooltip=`<title>${escape(titleText)}</title>`;
   if(bars){const bw=Math.min(22,pw/points.length*0.26),xp=x(i)+(index?2:-bw-2);body+=`<rect tabindex="0" aria-label="${escape(titleText)}" x="${xp}" y="${y(value)}" width="${bw}" height="${pad.t+ph-y(value)}" fill="${colors[key]}">${tooltip}</rect><text x="${xp+bw/2}" y="${y(value)-6}" text-anchor="middle" fill="${colors[key]}">${fmt(value)}</text>`;}
   else body+=`<circle tabindex="0" aria-label="${escape(titleText)}" cx="${x(i)}" cy="${y(value)}" r="4" fill="${colors[key]}">${tooltip}</circle><text x="${x(i)}" y="${y(value)+(index?18:-10)}" text-anchor="middle" fill="${colors[key]}">${fmt(value)}</text>`;
  });
 }
 return `<svg role="img" aria-label="${escape(title)}" viewBox="0 0 ${width} ${height}" style="min-width:${width}px" xmlns="http://www.w3.org/2000/svg"><title>${escape(title)}</title>${body}</svg>`;
}
