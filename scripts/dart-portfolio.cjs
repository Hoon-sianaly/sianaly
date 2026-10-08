const fs=require('node:fs'),path=require('node:path');
const core=require('./dart-core.cjs');
const {periods,koreanDate}=require('./update-dart-samsung.cjs');
const catalog=require('../data/company-index.json');
const readRecords=()=>Object.fromEntries(catalog.companies.map(c=>[c.key,JSON.parse(fs.readFileSync(path.join(core.root,'data/companies',c.file),'utf8'))]));
const file=name=>path.join(core.out,name);
function write(name,data){fs.mkdirSync(core.out,{recursive:true});fs.writeFileSync(file(name),JSON.stringify(data,null,2)+'\n');}
function applyRows(record,rows,company,asOf){
 if(record.profile.key!==company.key||record.profile.ticker!==company.ticker||record.financials.unit!=='KRW_trillion'||record.financials.basis!==(company.fsDiv==='CFS'?'consolidated':'separate'))throw Error('Website identity or basis mismatch');
 const next=structuredClone(record),changes=[];
 for(const row of rows){
  if(row.currency!=='KRW'||row.basis!==record.financials.basis||!/^\d{14}$/.test(row.receipt)||row.periodBasis!==(row.quarter?'three-month':'annual'))throw Error('Invalid candidate provenance');
  if(!Number.isInteger(row.year)||row.year<2015||row.year>Number(asOf.slice(0,4))||row.quarter!==undefined&&![1,2,3].includes(row.quarter))throw Error('Invalid candidate period');
  for(const field of ['sales','op',...(row.net!==undefined?['net']:[])])if(!Number.isFinite(row[field])||row[field]!==Number(core.amount(row.rawKRW[field]))/1e12)throw Error('Invalid candidate amount');
  if(row.sales<0)throw Error('Negative sales is unsupported by the current UI');
  const bucket=row.quarter?next.financials.quarterly:next.financials.annual,old=bucket.find(r=>r.year===row.year&&r.quarter===row.quarter);
  const reconciled=company.reconciliations?.some(r=>r.year===row.year&&r.quarter===(row.quarter||null)&&r.receipt===row.receipt&&['sales','op'].every(f=>r.values[f]===row.rawKRW[f]&&r.previous[f]===old?.[f]));
  if(old&&!old.dart&&core.compare(row,record).status==='review-required'&&!reconciled)throw Error('Uncalibrated existing values require review');
  if(!row.quarter&&old?.net!==undefined&&row.net===undefined)throw Error('Existing annual net income has no matching account');
  const fields=['sales','op',...(!row.quarter&&row.net!==undefined?['net']:[])],id=`dart-${row.year}-${row.quarter?'q'+row.quarter:'annual'}`;
  if(old&&fields.every(f=>old[f]===row[f])&&old.dart?.receipt===row.receipt)continue;
  const updated={...(old||{}),year:row.year,...(row.quarter?{quarter:row.quarter}:{}),sales:row.sales,op:row.op,...(!row.quarter&&row.net!==undefined?{net:row.net}:{}),sourceIds:[id],dart:{receipt:row.receipt,rawKRW:row.rawKRW,periodBasis:row.periodBasis,accounts:row.accounts}};
  if(old)bucket[bucket.indexOf(old)]=updated;else bucket.push(updated);
  bucket.sort((a,b)=>a.year-b.year||(a.quarter||0)-(b.quarter||0));
  const source={id,label:`${row.year}년 ${row.quarter?row.quarter+'분기':'연간'} ${row.basis==='separate'?'별도':'연결'} 재무제표 · DART`,url:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${row.receipt}`,published:row.receipt.slice(0,8).replace(/(\d{4})(\d{2})(\d{2})/,'$1.$2.$3'),verifiedAt:asOf.replaceAll('-','.')};
  const index=next.sources.findIndex(s=>s.id===id);if(index<0)next.sources.push(source);else next.sources[index]=source;
  changes.push({year:row.year,quarter:row.quarter||null,receipt:row.receipt,fields:fields.map(f=>({field:f,before:old?.[f]??null,after:row[f]}))});
 }
 if(changes.length)next.financials.automaticUpdate={provider:'OpenDART',scope:'Validated financial statement metrics',updatedAt:asOf.replaceAll('-','.')};
 return {record:next,changes};
}
async function pooled(items,fn){let cursor=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<items.length){const i=cursor++;await fn(items[i],i);}}));}
async function registry(){
 const cache=file('corpCode.xml');fs.mkdirSync(core.out,{recursive:true});
 const xml=fs.existsSync(cache)?fs.readFileSync(cache,'utf8'):core.unzipXML(await core.api('corpCode.xml',{},true));
 fs.writeFileSync(cache,xml);
 const data=core.registryFromXML(xml,catalog,readRecords());
 write('registry.json',data);
 console.log(`Official identities connected: ${data.companies.length} stocks, ${data.companies.filter(c=>!c.companyRef).length} issuers.`);
}
async function audit(useCache){
 const registry=JSON.parse(fs.readFileSync(file('registry.json'),'utf8')),records=readRecords(),asOf=koreanDate(),year=Number(asOf.slice(0,4));
 const targets=registry.companies.filter(c=>!c.companyRef),results=[];
 let finished=0;
 write('portfolio-audit.json',{status:'running',asOf});
 await pooled(targets,async c=>{
  const reports=[];
  const requested=[{year:year-1,report:'11011'},{year,report:'11013'},{year,report:'11012'},...records[c.key].financials.quarterly.filter(r=>r.year===year-1&&r.quarter<=3).map(r=>({year:r.year,report:({1:'11013',2:'11012',3:'11014'}[r.quarter])}))];
  for(const p of requested){
   try{
    const payload=await core.financial(c,p,{cache:useCache});
    if(payload.status==='013'){reports.push({...p,status:'unavailable'});continue;}
    const row=core.normalize(payload,c,p),comparison=core.compare(row,records[c.key]);reports.push({...p,status:comparison.status,row,comparison});
   }catch(e){reports.push({...p,status:'review-required',reason:e.message});}
  }
  const complete=reports.every(r=>['compatible','new-period'].includes(r.status)),problems=reports.filter(r=>!['compatible','new-period'].includes(r.status));
  results.push({key:c.key,name:records[c.key].profile.name,mode:complete?'automatic':'review',reports,problems});
  console.log(`${++finished}/${targets.length} ${c.key}: ${complete?'automatic':'review'}`);
 });
 results.sort((a,b)=>targets.findIndex(c=>c.key===a.key)-targets.findIndex(c=>c.key===b.key));
 write('portfolio-audit.json',{schemaVersion:1,status:'complete',asOf,results});
 const byKey=new Map(results.map(r=>[r.key,r]));
 for(const c of registry.companies)if(!c.companyRef){const result=byKey.get(c.key);c.mode=result.mode;c.validation={asOf,periods:result.reports.map(r=>({year:r.year,report:r.report,status:r.status})),...(result.mode==='review'?{reasons:result.problems.map(p=>p.reason||'Existing values or period need review')}: {})};}
 write('registry-validated.json',registry);
 console.log(`Audit complete: ${results.filter(r=>r.mode==='automatic').length} automatic issuers, ${results.filter(r=>r.mode==='review').length} review issuers, 2 shared stocks.`);
}
async function update(baseSha,useCache=false){
 if(!/^[a-f0-9]{40}$/.test(baseSha||''))throw Error('Verified main SHA is required');
 const asOf=koreanDate(),files=[],results=[];
 write('portfolio-update.json',{status:'running',baseSha,asOf});
 const configuration=await fetch(`https://raw.githubusercontent.com/Hoon-sianaly/sianaly/${baseSha}/data/dart-companies.json`,{signal:AbortSignal.timeout(30000)});
 if(!configuration.ok)throw Error('Portfolio configuration unavailable');
 const registry=await configuration.json();
 if(registry.schemaVersion!==2||registry.companies?.length!==100||new Set(registry.companies.map(c=>c.key)).size!==100)throw Error('Portfolio configuration has not been validated');
 let done=0;
 await pooled(registry.companies.filter(c=>!c.companyRef),async c=>{
  let result;
  try{
   const response=await fetch(`https://raw.githubusercontent.com/Hoon-sianaly/sianaly/${baseSha}/data/companies/${c.key}.json`,{signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw Error('Baseline unavailable');
   const baseline=await response.json(),rows=[],missing=[],receipts=[];
   const currentYear=Number(asOf.slice(0,4));
   const relevant=periods(asOf).filter(p=>p.year===currentYear||p.report==='11011'||baseline.financials.quarterly.some(r=>r.year===p.year&&r.quarter===({11013:1,11012:2,11014:3}[p.report])));
   for(const p of relevant){
    const payload=await core.financial(c,p,{cache:useCache});
    if(payload.status==='013'){missing.push({year:p.year,report:p.report});continue;}
    const receipt=payload.list?.find(r=>['IS','CIS'].includes(r.sj_div))?.rcept_no;
    if(!/^\d{14}$/.test(receipt||''))throw Error('Missing receipt');
    receipts.push({year:p.year,report:p.report,receipt});
    if(c.mode==='automatic'&&!c.blockedPeriods?.some(b=>b.year===p.year&&b.report===p.report))rows.push(core.normalize(payload,c,p));
   }
   if(c.mode!=='automatic')result={key:c.key,status:'review',reason:c.validation?.reasons?.join('; ')||'Metric mapping not validated',receipts,missing};
   else{
    if(!rows.length)throw Error('No financial statements');
    const applied=applyRows(baseline,rows,c,asOf);
    if(applied.changes.length)files.push({path:`data/companies/${c.key}.json`,content:JSON.stringify(applied.record,null,2)+'\n'});
    result={key:c.key,status:applied.changes.length?'changed':'unchanged',changes:applied.changes,missing,held:c.blockedPeriods?.map(b=>({...b,currentReceipt:receipts.find(r=>r.year===b.year&&r.report===b.report)?.receipt||null}))||[]};
   }
  }catch(e){result={key:c.key,status:'error',reason:e.message};}
  results.push(result);console.log(`${++done}/98 ${c.key}: ${result.status}`);
 });
 // Only successfully validated issuers can produce files; failures stay isolated.
 files.sort((a,b)=>a.path.localeCompare(b.path));results.sort((a,b)=>a.key.localeCompare(b.key));
 write('portfolio-update.json',{schemaVersion:1,status:'validated',baseSha,asOf,checkedAt:new Date().toISOString(),results,files});
 console.log(`Portfolio complete: ${files.length} changed files; ${results.filter(r=>r.status==='error').length} errors; ${results.filter(r=>r.status==='review').length} review issuers.`);
}
async function main(){
 const args=process.argv.slice(2),mode=args[args.indexOf('--mode')+1];
 if(mode==='registry')return registry();
 if(mode==='audit')return audit(args.includes('--cache'));
 if(mode==='update')return update(args[args.indexOf('--base-sha')+1],args.includes('--cache'));
 throw Error('Invalid portfolio mode');
}
module.exports={pooled,applyRows};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
