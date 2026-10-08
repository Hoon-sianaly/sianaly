const fs=require('node:fs'),path=require('node:path'),{root}=require('./dart-core.cjs');
const audit=require('../dart-output/portfolio-audit.json'),registry=require('../dart-output/registry-validated.json');
if(audit.status!=='complete')throw Error('Complete audit required');
function precisionOnly(report){
 if(!report.row||!report.comparison?.differences.length)return false;
 return report.comparison.differences.every(d=>{
  if(d.difference===null||!Number.isFinite(d.existing)||d.existing===0)return d.difference===0;
  const digits=String(d.existing).split('.')[1]?.length||0;
  // Exact one-time reconciliation, not a wider tolerance for future unverified data.
  const units=report.report==='11013'?3:1;
  const bound=Math.min(.0003,units*10**(-digits))+1e-12;
  return Math.abs(d.difference)<=Math.max(d.tolerance,bound);
 });
}
const results=new Map(audit.results.map(r=>[r.key,r]));
for(const c of registry.companies){
 if(c.companyRef)continue;
 const r=results.get(c.key),reconciliations=[];
 const accepted=r.reports.filter(p=>['compatible','new-period'].includes(p.status)||precisionOnly(p));
 for(const p of accepted.filter(p=>p.status==='review-required')){
  const record=require(path.join(root,'data/companies',c.key+'.json'));
  const old=(p.row.quarter?record.financials.quarterly:record.financials.annual).find(x=>x.year===p.row.year&&x.quarter===p.row.quarter);
  reconciliations.push({year:p.row.year,quarter:p.row.quarter||null,receipt:p.row.receipt,values:p.row.rawKRW,previous:{sales:old.sales,op:old.op},reason:'Exact receipt reconciliation of IR precision or rounded cumulative subtraction; do not reuse for other receipts'});
 }
 const blocked=r.reports.filter(p=>!accepted.includes(p));
 const currentYear=Number(audit.asOf.slice(0,4));
 const calibrated=accepted.some(p=>p.year===currentYear&&p.report==='11012')&&r.reports.filter(p=>p.year===currentYear).every(p=>p.row);
 c.mode=calibrated?'automatic':'review';
 if(reconciliations.length)c.reconciliations=reconciliations;
 if(calibrated&&blocked.length)c.blockedPeriods=blocked.map(p=>({year:p.year,report:p.report,receipt:p.row?.receipt,reason:p.reason||'Existing IR values differ from statutory DART values; preserve until reporting scope or correction is reconciled'}));
 c.validation={asOf:audit.asOf,periods:r.reports.map(p=>({year:p.year,report:p.report,status:accepted.includes(p)?'validated':p.status,receipt:p.row?.receipt})),...(blocked.length?{reasons:blocked.map(p=>p.reason||'Existing IR values and statutory statement differ')}: {})};
}
fs.writeFileSync(path.join(root,'data/dart-companies.json'),JSON.stringify(registry,null,2)+'\n');
const automatic=registry.companies.filter(c=>c.mode==='automatic'),review=registry.companies.filter(c=>c.mode==='review'),shared=registry.companies.filter(c=>c.companyRef);
const status={schemaVersion:1,asOf:audit.asOf,stocks:100,issuers:98,automaticIssuers:automatic.length,fullyValidatedIssuers:automatic.filter(c=>!c.blockedPeriods?.length).length,partiallyValidatedIssuers:automatic.filter(c=>c.blockedPeriods?.length).length,reviewIssuers:review.length,sharedStocks:shared.length,companies:registry.companies.map(c=>({key:c.key,ticker:c.ticker,mode:c.mode,...(c.companyRef?{companyRef:c.companyRef}:{basis:c.fsDiv==='CFS'?'consolidated':'separate',blockedPeriods:c.blockedPeriods||[],validation:c.validation})}))};
fs.writeFileSync(path.join(root,'data/dart-status.json'),JSON.stringify(status,null,2)+'\n');
const lines=['# 100개 종목 DART 연결 상태','',`기준일: ${audit.asOf}. 100개 종목 = 98개 기업 + 실적 공유 우선주 2개.`,`자동 수집·검증 대상 ${automatic.length}개 기업 (전체 검증 ${status.fullyValidatedIssuers}, 특정 기간 보류 ${status.partiallyValidatedIssuers}), 지표/통화 예외 ${review.length}개 기업.`, '', '매일 예약은 현재 컴퓨터와 Codex 앱이 실행 중일 때만 동작합니다. 서버 자동화는 아직 이전하지 않았습니다.','', '| 기업 | 처리 | 검토 사유 |','|---|---|---|'];
for(const c of registry.companies){const record=require(path.join(root,'data/companies',c.key+'.json'));lines.push(`| ${record.profile.name} | ${c.companyRef?'본주 실적 공유':c.mode==='automatic'?(c.blockedPeriods?.length?'자동 · 일부 기간 보류':'자동'):'공시 감시 · 수치 보류'} | ${c.companyRef?c.companyRef:(c.validation.reasons||[]).join('; ')} |`);}
fs.writeFileSync(path.join(root,'data/DART-STATUS.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({...status,companies:undefined},null,2));
