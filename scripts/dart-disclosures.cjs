const fs=require('node:fs'),path=require('node:path');
const core=require('./dart-core.cjs');
function dayShift(day,delta){const d=new Date(day+'T12:00:00Z');if(!Number.isFinite(d.getTime()))throw Error('Invalid disclosure date');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
function windows(start,end){const result=[];if(start>end)throw Error('Disclosure cursor is in the future');while(start<=end){const to=[dayShift(start,29),end].sort()[0];result.push({from:start,to});start=dayShift(to,1);}return result;}
function reportPeriod(name){
 const m=String(name).match(/(?:사업|반기|분기)보고서\s*\((\d{4})\.(\d{2})\)/);
 if(!m)return null;
 const kind=String(name).match(/(사업|반기|분기)보고서/)[1],year=Number(m[1]),month=Number(m[2]);
 const report=kind==='사업'&&month===12?'11011':kind==='반기'&&month===6?'11012':kind==='분기'&&month===3?'11013':kind==='분기'&&month===9?'11014':null;
 return {year,report,month};
}
function loadState(registry,asOf,statePath){
 if(fs.existsSync(statePath)){
  const s=JSON.parse(fs.readFileSync(statePath,'utf8'));
  if(s.schemaVersion!==1||!/^\d{4}-\d{2}-\d{2}$/.test(s.scannedThrough||'')||!Array.isArray(s.pending)||!Array.isArray(s.reviewQueue))throw Error('Invalid disclosure state; refusing to skip filings');
  return s;
 }
 const dates=registry.companies.map(c=>c.validation?.asOf).filter(Boolean).sort();
 return {schemaVersion:1,scannedThrough:dates[0]||asOf,pending:[],reviewQueue:[]};
}
async function listFilings(from,to,api=core.api){
 const rows=[];let pages=1;
 for(let page=1;page<=pages;page++){
  const p=await api('list.json',{bgn_de:from.replaceAll('-',''),end_de:to.replaceAll('-',''),pblntf_ty:'A',last_reprt_at:'N',corp_cls:'Y',sort:'date',sort_mth:'asc',page_count:'100',page_no:String(page)});
  if(p.status==='013'){if(page!==1)throw Error('Disclosure pagination changed; retry required');return [];}
  const count=Number(p.total_page);
  if(!Number.isInteger(count)||count<1||count>10000||Number(p.page_no)!==page||!Array.isArray(p.list)||!p.list.length)throw Error('Invalid disclosure pagination');
  pages=Math.max(pages,count);rows.push(...p.list);
 }
 return rows;
}
async function discover(registry,state,asOf,api=core.api){
 const next=structuredClone(state),byCorp=new Map(registry.companies.filter(c=>c.corpCode).map(c=>[c.corpCode,c])),jobs=new Map(next.pending.map(j=>[j.id,j]));
 let listRequests=0,filings=0;
 for(const window of windows(dayShift(state.scannedThrough,-3),asOf)){
  const rows=await listFilings(window.from,window.to,async(...args)=>{listRequests++;return api(...args);});filings+=rows.length;
  for(const r of rows){
   const c=byCorp.get(r.corp_code);if(!c)continue;
   if(!/^\d{14}$/.test(r.rcept_no||'')||!/^\d{8}$/.test(r.rcept_dt||'')||r.rcept_dt<window.from.replaceAll('-','')||r.rcept_dt>window.to.replaceAll('-',''))throw Error('Invalid filing receipt/date');
   const p=reportPeriod(r.report_nm);
   if(!p?.report){
    if(!next.reviewQueue.some(q=>q.receipt===r.rcept_no))next.reviewQueue.push({key:c.key,receipt:r.rcept_no,title:r.report_nm,reason:'Unsupported report period; manual review required'});
    continue;
   }
   const id=`${c.key}/${p.year}/${p.report}`,job={id,key:c.key,year:p.year,report:p.report,receipt:r.rcept_no,title:r.report_nm};
   const prior=jobs.get(id),completed=next.completed?.[id];
   if(completed&&completed>=job.receipt)continue;
   if(!prior||job.receipt>prior.receipt)jobs.set(id,job);
  }
 }
 next.scannedThrough=asOf;next.pending=[...jobs.values()];next.completed=next.completed||{};
 return {state:next,listRequests,filings};
}
function saveState(state,statePath){fs.mkdirSync(path.dirname(statePath),{recursive:true});fs.writeFileSync(statePath+'.tmp',JSON.stringify(state,null,2)+'\n');fs.renameSync(statePath+'.tmp',statePath);}
function complete(state,jobs){
 for(const job of jobs){
  state.completed[job.id]=[state.completed[job.id]||'',job.receipt].sort().at(-1);
  state.pending=state.pending.filter(p=>p.id!==job.id||p.receipt>job.receipt);
 }
}
module.exports={dayShift,windows,reportPeriod,loadState,listFilings,discover,saveState,complete};
