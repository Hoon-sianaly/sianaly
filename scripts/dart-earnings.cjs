'use strict';
const zlib=require('node:zlib'),core=require('./dart-core.cjs');
const isEarnings=title=>/^(?:\[[^\]]+\])*(?:연결재무제표기준)?영업\(잠정\)실적\(공정공시\)$/.test(String(title).replace(/\s/g,''));
function documentText(buffer,receipt){
 if(!/^\d{14}$/.test(receipt))throw Error('Invalid earnings receipt');
 for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--){
  if(buffer.readUInt32LE(i)!==0x06054b50)continue;
  let cursor=buffer.readUInt32LE(i+16);const count=buffer.readUInt16LE(i+10);
  for(let n=0;n<count;n++){
   if(buffer.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid document ZIP');
   const method=buffer.readUInt16LE(cursor+10),size=buffer.readUInt32LE(cursor+20),length=buffer.readUInt16LE(cursor+28),extra=buffer.readUInt16LE(cursor+30),comment=buffer.readUInt16LE(cursor+32),local=buffer.readUInt32LE(cursor+42);
   const name=buffer.subarray(cursor+46,cursor+46+length).toString();
   if(name===receipt+'.xml'){
    if(buffer.readUInt32LE(local)!==0x04034b50)throw Error('Invalid document entry');
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28),raw=buffer.subarray(start,start+size);
    const content=method===8?zlib.inflateRawSync(raw,{maxOutputLength:12000000}):method===0?raw:null;
    if(!content)throw Error('Unsupported document compression');
    const text=content.toString('utf8');return text.includes('\ufffd')?new TextDecoder('euc-kr',{fatal:true}).decode(content):text;
   }
   cursor+=46+length+extra+comment;
  }
 }
 throw Error('Official earnings document unavailable');
}
function text(html){return html.replace(/<[^>]*>/g,' ').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,h,d)=>String.fromCodePoint(parseInt(h||d,h?16:10))).replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();}
function grid(table){
 const result=[];
 for(const [i,row]of [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].entries()){
  result[i]||=[];let col=0;
  for(const cell of row[1].matchAll(/<(?:td|th)\b([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi)){
   while(result[i][col]!==undefined)col++;
   const span=key=>Number(cell[1].match(new RegExp(key+'\\s*=\\s*["\']?(\\d+)','i'))?.[1]||1),rs=span('rowspan'),cs=span('colspan');
   if(rs>30||cs>30||i>200||col>30)throw Error('Unsupported earnings table');
   for(let y=i;y<i+rs;y++){result[y]||=[];for(let x=col;x<col+cs;x++)result[y][x]=text(cell[2]);}col+=cs;
  }
 }
 return result;
}
function rawAmount(value,unit){
 const clean=value.replace(/[ ,]/g,'').replace(/^[△▲]/,'-');
 if(!/^-?\d+(?:\.\d+)?$/.test(clean))throw Error('Earnings amount missing, ranged or ambiguous');
 const [integer,fraction='']=clean.replace(/^-/,'').split('.'),factor={원:1n,천원:1000n,백만원:1000000n,억원:100000000n,조원:1000000000000n}[unit],scale=10n**BigInt(fraction.length);
 const scaled=(BigInt(integer)*scale+BigInt(fraction||'0'))*factor;
 if(scaled%scale)throw Error('Fractional KRW earnings amount');
 return (clean.startsWith('-')?-scaled/scale:scaled/scale).toString();
}
function normalize(html,company,job){
 if(!isEarnings(job.title)||!/^\d{14}$/.test(job.receipt))throw Error('Unsupported earnings filing');
 if(company.currency!=='KRW'||company.salesLabel!=='매출'||company.opLabel!=='영업이익')throw Error('Earnings metric/currency mapping requires review');
 const consolidated=job.title.replace(/\s/g,'').includes('연결재무제표기준');
 if(consolidated!==(company.fsDiv==='CFS'))throw Error('Earnings reporting basis mismatch');
 const title=text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
 const identity=value=>String(value).replace(/\s|\(주\)|㈜/g,'');
 if(identity(title.split('/')[0])!==identity(company.corpName))throw Error('Earnings company identity mismatch');
 const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m=>m[0]);
 const periods=tables.map(grid).flat().filter(r=>r[0]==='당기실적'&&r.some(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)));
 if(periods.length!==1)throw Error('Ambiguous earnings period');
 const dates=periods[0].filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v));
 if(dates.length!==2)throw Error('Missing earnings dates');
 const [start,end]=dates,year=Number(start.slice(0,4)),month=Number(start.slice(5,7)),last=Number(end.slice(5,7)),duration=last-month+1;
 if(start.slice(8)!=='01'||start.slice(0,4)!==end.slice(0,4)||end!==new Date(Date.UTC(year,last,0)).toISOString().slice(0,10)||!((duration===3&&[1,4,7,10].includes(month))||(duration===12&&month===1))||end.replaceAll('-','')>job.receipt.slice(0,8))throw Error('Earnings period is not a completed calendar quarter/year');
 const quarter=duration===3?Math.ceil(last/3):undefined;
 const candidates=tables.filter(t=>text(t).includes('당해실적')&&/단위\s*[:：]/.test(text(t))&&text(t).includes('매출액')&&text(t).includes('영업이익'));
 if(candidates.length!==1)throw Error('Ambiguous earnings statement');
 const table=candidates[0],unit=text(table).match(/단위\s*[:：]\s*(조원|억원|백만원|천원|원)(?:\s|,|$)/)?.[1];
 if(!unit)throw Error('Unsupported earnings unit');
 const rows=grid(table),header=rows.find(r=>r.includes('당기실적')&&r.includes('전기실적')),index=header?.indexOf('당기실적');
 if(index===undefined||index<2)throw Error('Missing current-quarter earnings column');
 const value=metric=>{const matches=rows.filter(r=>r[0]===metric&&r[1]==='당해실적');if(matches.length!==1)throw Error('Missing or duplicate current earnings metric');return rawAmount(matches[0][index],unit);};
 const rawKRW={sales:value('매출액'),op:value('영업이익')};
 if(BigInt(rawKRW.sales)<0n)throw Error('Negative earnings revenue requires review');
 return {year,...(quarter?{quarter}:{}),sales:Number(rawKRW.sales)/1e12,op:Number(rawKRW.op)/1e12,rawKRW,currency:'KRW',basis:consolidated?'consolidated':'separate',receipt:job.receipt,periodBasis:quarter?'three-month':'annual',disclosureStatus:'preliminary',reportPeriod:start+'–'+end,accounts:{sales:['매출액/당해실적'],op:['영업이익/당해실적']}};
}
async function fetchEarnings(company,job){return normalize(documentText(await core.api('document.xml',{rcept_no:job.receipt},true),job.receipt),company,job);}
module.exports={isEarnings,documentText,grid,rawAmount,normalize,fetchEarnings};
