type CellValue = string | number | boolean | null | undefined;
type Sheet = {
  name: string;
  rows: CellValue[][];
  widths?: number[];
  headerRow?: number;
  freezeRows?: number;
  autoFilter?: boolean;
  mergeFirstRow?: boolean;
};

const esc=(v:CellValue)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const colName=(n:number)=>{let s='';for(let x=n+1;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+(x-1)%26)+s;return s;};
const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
const crc32=(d:Uint8Array)=>{let c=0xffffffff;for(const b of d)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
const u16=(n:number)=>new Uint8Array([n&255,(n>>>8)&255]);
const u32=(n:number)=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
const join=(ps:Uint8Array[])=>{const out=new Uint8Array(ps.reduce((a,p)=>a+p.length,0));let o=0;for(const p of ps){out.set(p,o);o+=p.length;}return out;};

function styleFor(value:CellValue, row:number, col:number, sheet:Sheet) {
  if (sheet.headerRow === row) return 3;
  if (row === 0) return 1;
  if (row === 1) return 2;
  if (typeof value === 'number') return 4;
  if (value === null || value === undefined || value === '') return 0;
  const first = String(sheet.rows[row]?.[0] ?? '').toLocaleUpperCase('tr-TR');
  if (col === 0 && (first.includes('ÖZETİ') || first.includes('ÖZET') || first.includes('FİNANS ') || first.includes('FATURA ') || first.includes('CARİ '))) return 5;
  return 0;
}

function cell(v:CellValue, ri:number, ci:number, sheet:Sheet){
  if(v===null||v===undefined||v==='')return '<c/>';
  const style=styleFor(v,ri,ci,sheet);
  if(typeof v==='number') return `<c s="${style}"><v>${Number.isFinite(v)?v:0}</v></c>`;
  if(typeof v==='boolean') return `<c s="${style}" t="b"><v>${v?'1':'0'}</v></c>`;
  return `<c s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml(s:Sheet){
  const cols=Math.max(1,...s.rows.map(r=>r.length));
  const lastRow=Math.max(1,s.rows.length), lastCol=colName(cols-1), lastCell=`${lastCol}${lastRow}`;
  const widths=(s.widths??Array.from({length:cols},(_,i)=>i===0?20:22)).slice(0,cols).map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.min(60,Math.max(9,w))}" customWidth="1"/>`).join('');
  const rows=s.rows.map((r,ri)=>`<row r="${ri+1}"${ri===0?' ht="30" customHeight="1"':''}>${Array.from({length:cols},(_,ci)=>cell(r[ci],ri,ci,s)).join('')}</row>`).join('');
  const merge = s.mergeFirstRow && cols>1 ? `<mergeCells count="1"><mergeCell ref="A1:${lastCol}1"/></mergeCells>` : '';
  const freeze = s.freezeRows ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${s.freezeRows}" topLeftCell="A${s.freezeRows+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const filter = s.autoFilter && s.headerRow !== undefined && s.rows.length>s.headerRow+1 ? `<autoFilter ref="A${s.headerRow+1}:${lastCol}${lastRow}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${freeze}<sheetFormatPr defaultRowHeight="22"/><cols>${widths}</cols><sheetData>${rows}</sheetData>${merge}${filter}<printOptions horizontalCentered="1"/><pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

function zipStore(files:{name:string;data:string}[]){
  const enc=new TextEncoder(),local:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
  for(const f of files){
    const n=enc.encode(f.name),d=enc.encode(f.data),c=crc32(d);
    const l=join([new Uint8Array([80,75,3,4]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(c),u32(d.length),u32(d.length),u16(n.length),u16(0),n,d]);
    const h=join([new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(c),u32(d.length),u32(d.length),u16(n.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),n]);
    local.push(l);central.push(h);offset+=l.length;
  }
  const body=join(local),cd=join(central),end=join([new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(files.length),u16(files.length),u32(cd.length),u32(body.length),u16(0)]);
  return new Blob([body,cd,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

export function downloadXlsx(filename:string,sheets:Sheet[]){
  const workbookSheets=sheets.map((s,i)=>`<sheet name="${esc(s.name.slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
  const rels=sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('');
  const files=[
   {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
   {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
   {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="Microsoft Office Excel" lastEdited="7"/><workbookPr defaultThemeVersion="164011"/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="16000"/></bookViews><sheets>${workbookSheets}</sheets><calcPr calcMode="auto"/></workbook>`},
   {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
   {name:'xl/styles.xml',data:`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="[$₺-tr-TR] #,##0.00"/></numFmts><fonts count="5"><font><sz val="11"/><color theme="1"/><name val="Aptos"/></font><font><b/><sz val="19"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="12"/><color rgb="FF52627A"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="12"/><color rgb="FF13233D"/><name val="Aptos"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF163B73"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF1FF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F6BDE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F7FB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="3"><border/><border><bottom style="thin"><color rgb="FFD6DFEA"/></bottom></border><border><top style="thin"><color rgb="FFD6DFEA"/></top><bottom style="thin"><color rgb="FFD6DFEA"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="0"/><xf numFmtId="0" fontId="3" fillId="3" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="2" borderId="2" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf></cellXfs></styleSheet>`},
   ...sheets.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXml(s)}))
  ];
  const blob=zipStore(files), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=filename.endsWith('.xlsx')?filename:`${filename}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
