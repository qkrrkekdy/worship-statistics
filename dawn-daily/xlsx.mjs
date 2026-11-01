import {monthMatrix} from './model.mjs';
const enc=new TextEncoder();
const xml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
const col=n=>n<26?String.fromCharCode(65+n):col(Math.floor(n/26)-1)+col(n%26);
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function zip(files){
  const chunks=[],central=[];let offset=0,size=0;
  const header=(length,fields)=>{const a=new Uint8Array(length),v=new DataView(a.buffer);for(const [p,n,value]of fields)n===4?v.setUint32(p,value,true):v.setUint16(p,value,true);return a;};
  for(const [path,text]of files){const name=enc.encode(path),data=enc.encode(text),sum=crc(data);
    const local=header(30,[[0,4,0x04034b50],[4,2,20],[6,2,0x800],[12,2,33],[14,4,sum],[18,4,data.length],[22,4,data.length],[26,2,name.length]]);
    const cd=header(46,[[0,4,0x02014b50],[4,2,20],[6,2,20],[8,2,0x800],[14,2,33],[16,4,sum],[20,4,data.length],[24,4,data.length],[28,2,name.length],[42,4,offset]]);
    chunks.push(local,name,data);central.push(cd,name);offset+=local.length+name.length+data.length;size+=cd.length+name.length;
  }
  const end=header(22,[[0,4,0x06054b50],[8,2,files.length],[10,2,files.length],[12,4,size],[16,4,offset]]);
  const result=new Uint8Array(offset+size+22);let at=0;for(const a of [...chunks,...central,end]){result.set(a,at);at+=a.length;}return result;
}
export function workbook(months,year){
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const name=`${year}년 새벽 일별 현황`,rows=[],merges=[];
  const dateSlots=Math.max(...months.map(month=>month.days.length));
  const lastColumn=col(dateSlots+1);
  months.forEach((month,i)=>{
    const titleRow=rows.length+1;merges.push(`A${titleRow}:${lastColumn}${titleRow}`);
    rows.push({kind:'title',cells:[`${year}년 ${month.month}월`,...Array(dateSlots+1).fill(null)]});
    monthMatrix(month,year).forEach((row,r)=>{
      // Compact Mon-Sat dates; shorter months have trailing blanks to align all means.
      const cells=[row[0],...Array.from({length:dateSlots},(_,d)=>d<month.days.length?row[d+1]:null),row.at(-1)];
      rows.push({kind:r<2?'head':r===4?'total':r===5?'note':'data',cells});
    });
    if(i<months.length-1)rows.push({kind:'gap',cells:[]},{kind:'gap',cells:[]});
  });
  const rowXml=rows.map(({kind,cells},r)=>{
    const noteLength=kind==='note'?Math.max(...cells.map(v=>typeof v==='string'?v.length:0)):0;
    const height=kind==='gap'?15:kind==='title'?28:kind==='note'?Math.min(409,Math.max(28,Math.ceil(noteLength/8)*14)):25;
    return `<row r="${r+1}" ht="${height}" customHeight="1">${cells.map((v,c)=>{
      const style=kind==='title'?3:kind==='head'||c===0?1:c===dateSlots+1&&typeof v==='number'?2:kind==='total'?4:0;
      const ref=`${col(c)}${r+1}`;
      return v===null?`<c r="${ref}" s="${style}"/>`:typeof v==='number'?`<c r="${ref}" s="${style}"><v>${v}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('')}</row>`;
  }).join('');
  const alignment='<alignment horizontal="center" vertical="center" wrapText="1"/>';
  const xf=(font,fill,num=0)=>`<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1">${alignment}</xf>`;
  const solid=color=>`<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  return zip([
    ['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(name)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'${xml(name)}'!$A$1:$${lastColumn}$${rows.length}</definedName></definedNames></workbook>`],
    ['xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml',`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.#"/></numFmts><fonts count="3"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${solid('FFE7F0EC')}${solid('FF23483E')}${solid('FFF0F5F2')}</fills><borders count="2"><border/><border>${['left','right','top','bottom'].map(s=>`<${s} style="thin"><color rgb="FFDCE2DF"/></${s}>`).join('')}<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5">${xf(0,0)}${xf(2,2)}${xf(0,2,164)}${xf(1,3)}${xf(2,4)}</cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml',`<worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastColumn}${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" topLeftCell="B1" activePane="topRight" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="11" customWidth="1"/><col min="2" max="${dateSlots+1}" width="6" customWidth="1"/><col min="${dateSlots+2}" max="${dateSlots+2}" width="12" customWidth="1"/></cols><sheetData>${rowXml}</sheetData><mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells><pageMargins left="0.2" right="0.2" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><rowBreaks count="${months.length-1}" manualBreakCount="${months.length-1}">${months.slice(1).map((_,i)=>`<brk id="${(i+1)*9}" min="0" max="16383" man="1"/>`).join('')}</rowBreaks></worksheet>`]
  ]);
}
