'use strict';
const fs=require('node:fs'),path=require('node:path');

// Close only exact receipts reviewed against the published checkout. Never use
// unpublished candidate files as evidence that a financial correction is live.
function reconcile(state,ledger,records){
 const decisions=new Map(ledger.results.map(r=>[`${r.key}/${r.receipt}`,r]));
 if(decisions.size!==ledger.results.length)throw Error('Duplicate reviewed receipt');
 const next=structuredClone(state),remaining=[],closed=[];
 next.reviewHistory=next.reviewHistory||[];
 for(const item of next.reviewQueue){
  const decision=decisions.get(`${item.key}/${item.receipt}`);
  if(!decision){remaining.push(item);continue;}
  let resolved=false;
  if(['updated','confirmed'].includes(decision.status)){
   const expected=decision.expected,record=records[item.key],f=record?.financials;
   const row=expected&&(expected.quarter?f?.quarterly:f?.annual)?.find(r=>r.year===expected.year&&r.quarter===expected.quarter);
   resolved=Boolean(expected&&f&&f.unit===`${expected.currency}_trillion`&&f.basis===expected.basis&&row&&['sales','op'].every(k=>Number.isFinite(expected[k])&&row[k]===expected[k])&&(!expected.reportPeriod||row.reportPeriod===expected.reportPeriod));
   if(resolved&&(decision.status==='updated'||expected.receipt)){
    resolved=Boolean(row.sourceIds?.some(id=>record.sources?.some(s=>s.id===id&&s.url===decision.url)));
   }
  }else if(decision.status==='excluded'){
   resolved=['monthly','basis','subsidiary'].includes(decision.exclusion)&&Boolean(decision.reason);
  }else if(decision.status!=='deferred')throw Error('Unknown review decision');
  if(resolved){
   const history={key:item.key,receipt:item.receipt,title:item.title,status:decision.status,reason:decision.reason,reviewedAt:decision.reviewedAt,report:decision.report||'data/dart-review-20261103.json'};
   if(!next.reviewHistory.some(r=>r.key===item.key&&r.receipt===item.receipt))next.reviewHistory.push(history);
   closed.push(history);
  }else remaining.push({...item,reviewedAt:decision.reviewedAt,reviewReason:decision.reason,followUp:decision.followUp||'Published financial evidence must match before this item can close'});
 }
 next.reviewQueue=remaining;
 return {state:next,closed};
}
function reconcileCheckout(state,root=path.resolve(__dirname,'..')){
 const ledger=JSON.parse(fs.readFileSync(path.join(root,'data/dart-review-20261103.json'),'utf8')),records={};
 const followUpFile=path.join(root,'data/dart-review-20261106.json');
 if(fs.existsSync(followUpFile)){
  const followUp=JSON.parse(fs.readFileSync(followUpFile,'utf8'));
  const decisions=new Map(ledger.results.map(r=>[r.key+'/'+r.receipt,r]));
  for(const r of followUp.results){
   const previous=decisions.get(r.key+'/'+r.receipt);
   if(!previous||previous.status!=='deferred')throw Error('Follow-up must reference an existing held receipt');
   decisions.set(r.key+'/'+r.receipt,r);
  }
  ledger.results=[...decisions.values()];
 }
 for(const {key,status}of ledger.results)if(['updated','confirmed'].includes(status)&&!records[key])records[key]=JSON.parse(fs.readFileSync(path.join(root,`data/companies/${key}.json`),'utf8'));
 return reconcile(state,ledger,records);
}
module.exports={reconcile,reconcileCheckout};
