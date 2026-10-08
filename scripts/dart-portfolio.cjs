const fs=require('node:fs'),path=require('node:path');
const core=require('./dart-core.cjs');
const disclosures=require('./dart-disclosures.cjs');
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
async function fullUpdate(baseSha,useCache=false){
 if(!/^[a-f0-9]{40}$/.test(baseSha||''))throw Error('Verified main SHA is required');
 const asOf=koreanDate(),files=[],results=[];
 write('portfolio-update.json',{status:'running',baseSha,asOf});
 const configuration=await fetch(`https://raw.githubusercontent.com/Hoon-sianaly/sianaly/${baseSha}/data/dart-companies.json`,{signal:AbortSignal.timeout(30000)});
 if(!configuration.ok)throw Error('Portfolio configuration unavailable');
 const registry=await configuration.json();
 if(registry.schemaVersion!==2||registry.companies?.length!==catalog.companies.length||new Set(registry.companies.map(c=>c.key)).size!==catalog.companies.length)throw Error('Portfolio configuration has not been validated');
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
  results.push(result);console.log(`${++done}/${registry.companies.filter(c=>!c.companyRef).length} ${c.key}: ${result.status}`);
 });
 // Only successfully validated issuers can produce files; failures stay isolated.
 files.sort((a,b)=>a.path.localeCompare(b.path));results.sort((a,b)=>a.key.localeCompare(b.key));
 write('portfolio-update.json',{schemaVersion:1,status:'validated',baseSha,asOf,checkedAt:new Date().toISOString(),results,files});
 console.log(`Portfolio complete: ${files.length} changed files; ${results.filter(r=>r.status==='error').length} errors; ${results.filter(r=>r.status==='review').length} review issuers.`);
}
async function remoteJSON(baseSha,relative){
 const response=await fetch(`https://raw.githubusercontent.com/Hoon-sianaly/sianaly/${baseSha}/${relative}`,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('GitHub baseline unavailable');return response.json();
}
async function update(baseSha){
 if(!/^[a-f0-9]{40}$/.test(baseSha||''))throw Error('Verified main SHA is required');
 const asOf=koreanDate(),statePath=file('disclosure-state.json'),files=[],results=[],ready=[];
 write('portfolio-update.json',{status:'running',baseSha,asOf});
 const registry=await remoteJSON(baseSha,'data/dart-companies.json');
 if(registry.schemaVersion!==2||registry.companies?.length!==catalog.companies.length||registry.companies.some(c=>!catalog.companies.some(e=>e.key===c.key&&e.ticker===c.ticker))||new Set(registry.companies.map(c=>c.key)).size!==catalog.companies.length)throw Error('Unvalidated portfolio configuration');
 const discovery=await disclosures.discover(registry,disclosures.loadState(registry,asOf,statePath),asOf),state=discovery.state;
 // Persist all discovered jobs before fetching financials; an interrupted run can resume.
 disclosures.saveState(state,statePath);
 const byKey=new Map(registry.companies.filter(c=>c.corpCode).map(c=>[c.key,c])),groups=new Map();
 for(const job of state.pending){
  if(!byKey.has(job.key)||job.id!==`${job.key}/${job.year}/${job.report}`||!/^\d{14}$/.test(job.receipt)||!['11011','11012','11013','11014'].includes(job.report))throw Error('Invalid pending disclosure job');
  if(!groups.has(job.key))groups.set(job.key,[]);groups.get(job.key).push(job);
 }
 let financialRequests=0;
 await pooled([...groups],async([key,jobs])=>{
  const c=byKey.get(key),automatic=jobs.filter(j=>c.mode==='automatic'&&!c.blockedPeriods?.some(b=>b.year===j.year&&b.report===j.report)),held=jobs.filter(j=>!automatic.includes(j));
  for(const job of held){if(!state.reviewQueue.some(q=>q.receipt===job.receipt))state.reviewQueue.push({...job,reason:c.mode==='review'?'Metric/currency mapping requires review':'Existing period is held for reporting-scope review'});}
  disclosures.complete(state,held);
  if(!automatic.length){results.push({key,status:'review',receipts:held,reason:'New report retained for review; existing values preserved'});return;}
  try{
   const baseline=await remoteJSON(baseSha,`data/companies/${key}.json`),rows=[],completed=[],pending=[];
   for(const job of automatic){
    financialRequests++;const payload=await core.financial(c,job);
    if(payload.status==='013'){pending.push({...job,reason:'Financial API not ready'});continue;}
    const row=core.normalize(payload,c,job),old=(row.quarter?baseline.financials.quarterly:baseline.financials.annual).find(r=>r.year===row.year&&r.quarter===row.quarter);
    if(row.receipt<job.receipt||old?.dart?.receipt>row.receipt){pending.push({...job,reason:'Financial API receipt is older than the filing or published data'});continue;}
    rows.push(row);completed.push(job);
   }
   const applied=applyRows(baseline,rows,c,asOf);
   if(applied.changes.length){files.push({path:`data/companies/${key}.json`,content:JSON.stringify(applied.record,null,2)+'\n'});ready.push(...completed);}
   else disclosures.complete(state,completed);
   results.push({key,status:applied.changes.length?'changed':pending.length?'pending':'unchanged',changes:applied.changes,pending,held});
  }catch(e){results.push({key,status:'error',reason:e.message});}
 });
 disclosures.saveState(state,statePath);
 files.sort((a,b)=>a.path.localeCompare(b.path));
 write('portfolio-update.json',{schemaVersion:1,status:'validated',baseSha,asOf,checkedAt:new Date().toISOString(),strategy:'new-disclosures',stats:{listRequests:discovery.listRequests,listedFilings:discovery.filings,targetIssuers:groups.size,financialRequests,pendingJobs:state.pending.length,reviewItems:state.reviewQueue.length},results,ready,files});
 console.log(`Disclosure update: ${discovery.listRequests} list requests, ${groups.size} target issuers, ${financialRequests} financial requests, ${files.length} changed files, ${state.pending.length} pending jobs.`);
}
async function acknowledge(baseSha){
 if(!/^[a-f0-9]{40}$/.test(baseSha||''))throw Error('Verified published main SHA required');
 const candidate=JSON.parse(fs.readFileSync(file('portfolio-update.json'),'utf8'));
 if(candidate.status!=='validated'||candidate.strategy!=='new-disclosures')throw Error('Validated disclosure candidate required');
 for(const f of candidate.files){
  if(!/^data\/companies\/[a-z][a-z0-9-]*\.json$/.test(f.path))throw Error('Invalid candidate file path');
  const live=await remoteJSON(baseSha,f.path),expected=JSON.parse(f.content);
  if(JSON.stringify(live.financials)!==JSON.stringify(expected.financials))throw Error('Published financials do not match; pending jobs retained');
 }
 const statePath=file('disclosure-state.json'),state=JSON.parse(fs.readFileSync(statePath,'utf8'));
 disclosures.complete(state,candidate.ready||[]);disclosures.saveState(state,statePath);
 console.log('Published disclosure jobs acknowledged.');
}
async function main(){
 const args=process.argv.slice(2),mode=args[args.indexOf('--mode')+1];
 if(mode==='registry')return registry();
 if(mode==='audit')return audit(args.includes('--cache'));
 if(['update','acknowledge','reconcile'].includes(mode)){
  fs.mkdirSync(core.out,{recursive:true});const lock=file('disclosure-run.lock');let handle;
  try{handle=fs.openSync(lock,'wx');}catch{throw Error('Another run or stale disclosure lock exists; do not run concurrently');}
  try{
   const sha=args[args.indexOf('--base-sha')+1];
   if(mode==='update'){if(args.includes('--cache'))throw Error('Disclosure updates must use fresh API data');return await update(sha);}
   if(mode==='acknowledge')return await acknowledge(sha);
   return await fullUpdate(sha,args.includes('--cache'));
  }finally{fs.closeSync(handle);fs.unlinkSync(lock);}
 }
 throw Error('Invalid portfolio mode');
}
module.exports={pooled,applyRows};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
