import {monthMatrix} from './model.mjs';
const enc=new TextEncoder();
const xml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
const col=n=>n<26?String.fromCharCode(65+n):col(Math.floor(n/26)-1)+col(n%26);
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
// Standard uncompressed ZIP: offline XLSX export with no runtime CDN dependency.
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
  const sheets=months.map((month,i)=>({name:`${month.month}월`,path:`xl/worksheets/sheet${i+1}.xml`,matrix:monthMatrix(month,year)}));
  const files=[
    ['[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map(s=>`<Override PartName="/${s.path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${s.name}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><definedNames>${sheets.map((s,i)=>`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${s.name}'!$A$1:$${col(s.matrix[0].length-1)}$6</definedName>`).join('')}</definedNames></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',`<styleSheet xmlns="${ns}"><fonts count="1"><font><sz val="10"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7F0EC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="2" fontId="0" fillId="2" borderId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs></styleSheet>`]
  ];
  for(const s of sheets){const width=s.matrix[0].length;
    files.push([s.path,`<worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="2" topLeftCell="B3" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="21" customWidth="1"/><col min="2" max="${width-1}" width="10" customWidth="1"/><col min="${width}" max="${width}" width="27" customWidth="1"/></cols><sheetData>${s.matrix.map((row,r)=>`<row r="${r+1}" ht="${r===5?80:32}" customHeight="1">${row.map((v,c)=>{const ref=`${col(c)}${r+1}`,style=c===width-1&&r>=2&&r<=4?2:c===0||c===width-1||r<2?1:0;return v===null?`<c r="${ref}" s="${style}"/>`:typeof v==='number'?`<c r="${ref}" s="${style}"><v>${v}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;}).join('')}</row>`).join('')}</sheetData><pageMargins left="0.2" right="0.2" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/></worksheet>`]);
  }return zip(files);
}
