const fs = require('node:fs');
const path = require('node:path');
const {fetchReport} = require('./dart-samsung.cjs');
const root = path.resolve(__dirname, '..');
const repo = 'Hoon-sianaly/sianaly';
function koreanDate(now = new Date()) {
 return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function periods(asOf) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw Error('Invalid as-of date.');
 const year=Number(asOf.slice(0,4));
 // Recheck the prior year (including corrections) and every completed quarter this year.
 return [year-1,year].flatMap(y=>[
  {year:y,report:'11011',end:`${y}-12-31`},
  {year:y,report:'11013',end:`${y}-03-31`},
  {year:y,report:'11012',end:`${y}-06-30`},
  {year:y,report:'11014',end:`${y}-09-30`}
 ]).filter(p=>p.end<asOf);
}
function applyRows(record, rows, asOf) {
 if(record.profile?.key!=='samsung'||record.profile.ticker!=='005930'||record.financials?.basis!=='consolidated'||record.financials.unit!=='KRW_trillion')throw Error('Website company or financial basis mismatch.');
 const next=structuredClone(record),changes=[];
 for(const row of rows){
  if(row.basis!=='consolidated'||row.currency!=='KRW'||!/^\d{14}$/.test(row.receipt)||row.sourceUrl!==`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${row.receipt}`)throw Error('Invalid candidate provenance.');
  if(!Number.isInteger(row.year)||row.year<2015||row.year>Number(asOf.slice(0,4)))throw Error('Invalid candidate year.');
  if(row.quarter!==undefined&&![1,2,3].includes(row.quarter))throw Error('Invalid candidate quarter.');
  if(row.periodBasis!==(row.quarter?'three-month':'annual'))throw Error('Candidate period basis mismatch.');
  for(const field of ['sales','op',...(!row.quarter?['net']:[])]){
   if(!Number.isFinite(row[field])||!/^[-]?\d+$/.test(row.rawKRW?.[field]||'')||row[field]!==Number(BigInt(row.rawKRW[field]))/1e12)throw Error('Invalid or missing candidate amount: '+field);
  }
  if(row.sales<0)throw Error('Negative sales.');
  const bucket=row.quarter?next.financials.quarterly:next.financials.annual;
  const old=bucket.find(r=>r.year===row.year&&r.quarter===row.quarter);
  const id=`dart-${row.year}-${row.quarter?'q'+row.quarter:'annual'}`;
  const fields=row.quarter?['sales','op']:['sales','op','net'];
  const source=next.sources.find(s=>s.id===id);
  if(old&&fields.every(f=>old[f]===row[f])&&old.dart?.receipt===row.receipt&&source?.url===row.sourceUrl)continue;
  const updated={...(old||{}),year:row.year,...(row.quarter?{quarter:row.quarter}:{}),sales:row.sales,op:row.op,...(!row.quarter?{net:row.net}:{}),sourceIds:[id],dart:{receipt:row.receipt,rawKRW:row.rawKRW,periodBasis:row.periodBasis}};
  if(row.quarter)delete updated.net;
  if(old)bucket[bucket.indexOf(old)]=updated;else bucket.push(updated);
  bucket.sort((a,b)=>a.year-b.year||(a.quarter||0)-(b.quarter||0));
  const published=row.receipt.slice(0,8).replace(/(\d{4})(\d{2})(\d{2})/,'$1.$2.$3');
  const newSource={id,label:`${row.year}년 ${row.quarter?row.quarter+'분기':'연간'} 연결 재무제표 · DART`,url:row.sourceUrl,published,verifiedAt:asOf.replaceAll('-','.')};
  if(source)next.sources[next.sources.indexOf(source)]=newSource;else next.sources.push(newSource);
  changes.push({year:row.year,quarter:row.quarter||null,receipt:row.receipt,fields:fields.map(f=>({field:f,before:old?.[f]??null,after:row[f]}))});
 }
 if(changes.length)next.financials.automaticUpdate={provider:'OpenDART',scope:'Samsung consolidated financial statements',updatedAt:asOf.replaceAll('-','.')};
 return {record:next,changes};
}
async function main(){
 const args=process.argv.slice(2),i=args.indexOf('--base-sha'),baseSha=args[i+1];
 if(i<0||!/^\w{40}$/.test(baseSha)||!/^[a-f0-9]{40}$/.test(baseSha))throw Error('A verified GitHub main commit SHA is required.');
 const asOf=koreanDate(),out=path.join(root,'dart-output','auto-update.json');
 fs.mkdirSync(path.dirname(out),{recursive:true});
 // Invalidate earlier candidates before any request, so failures cannot publish stale output.
 fs.writeFileSync(out,JSON.stringify({status:'running',baseSha,asOf})+'\n');
 try {
  const response=await fetch(`https://raw.githubusercontent.com/${repo}/${baseSha}/data/companies/samsung.json`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Could not read the current website baseline.');
  const baseline=await response.json(),rows=[],missing=[];
  for(const period of periods(asOf)){
   const row=await fetchReport({...period,allowMissing:true});
   if(row)rows.push(row);else missing.push({year:period.year,report:period.report});
  }
  if(!rows.length)throw Error('No financial statements returned.');
  const result=applyRows(baseline,rows,asOf);
  fs.writeFileSync(out,JSON.stringify({schemaVersion:1,status:'validated',baseSha,asOf,checkedAt:new Date().toISOString(),missing,changes:result.changes,files:result.changes.length?[{path:'data/companies/samsung.json',content:JSON.stringify(result.record,null,2)+'\n'}]:[]},null,2)+'\n');
  console.log(`Samsung automatic collection validated: ${rows.length} reports, ${missing.length} unavailable, ${result.changes.length} changed periods.`);
  console.log('Publish only validated files using the matching base commit; never publish credentials or collection output.');
 }catch(error){
  fs.writeFileSync(out,JSON.stringify({status:'failed',baseSha,asOf})+'\n');
  throw error;
 }
}
module.exports={periods,applyRows,koreanDate};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
