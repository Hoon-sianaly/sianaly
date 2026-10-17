// The comparison window requested for every company; missing is distinct from zero.
const STANDARD_FINANCIAL_QUARTERS=[[2025,1],[2025,2],[2025,3],[2025,4],[2026,1],[2026,2]];
const STANDARD_FINANCIAL_YEARS=[2023,2024,2025];
function financialDateRange(row){
 const label=row.reportPeriod||row.periodLabel||'';
 const m=label.match(/(\d{4})[./-](\d{1,2})(?:[./-]\d{1,2})?\s*[~–—−-]\s*(?:(\d{4})[./-])?(\d{1,2})/);
 return m?{year:Number(m[1]),start:Number(m[2]),endYear:Number(m[3]||m[1]),end:Number(m[4])}:null;
}
function standardFinancialRows(company){
 const reason=(year,quarter)=>{
  const note=(company.financialPeriodNotes||[]).find(n=>n.year===year&&n.quarter===quarter);
  if(note)return note.reason;
  if(company.financialAvailability)return company.financialAvailability.reason;
  if(company.historyStatus==='baseline-changed')return '정정된 공시와 과거 비교값 대조 필요';
  if(company.historyStatus==='unavailable')return '과거 실적 자료를 불러오지 못함';
  if(company.annualTerm&&/(?:3|6)개월/.test(company.annualTerm)||/반기|6개월/.test(company.quarterlyTerm)||company.allQuarters.some(row=>row.durationMonths===6))return '공시 결산기간이 비교 기준과 다름';
  const issue=(company.historyIssues||[]).find(i=>i.year===year&&(!quarter||i.quarter===quarter||String(i.quarter||'').includes(String(quarter))));
  if(issue?.reason?.includes('reconcile')||issue?.reason?.includes('differs')||issue?.reason?.includes('Negative'))return '공시 비교값·집계 범위 대조 필요';
  if(issue?.reason==='No financial statements')return 'DART 정형자료 미제공 · 원문 확인 필요';
  return '해당 기간의 공시 수치 확인 필요';
 };
 const quarterly=STANDARD_FINANCIAL_QUARTERS.map(([year,quarter])=>{
  const start=quarter*3-2,end=quarter*3;
  const row=company.allQuarters.find(row=>{if(row.partialPeriod||row.durationMonths&&row.durationMonths!==3)return false;const dates=financialDateRange(row);return dates?dates.year===year&&dates.endYear===year&&dates.start===start&&dates.end===end:row.year===year&&row.quarter===quarter&&!/반기|6개월/.test(company.quarterlyTerm);});
  const note=(company.financialPeriodNotes||[]).find(n=>n.year===year&&n.quarter===quarter);
  return row?{...row,year,quarter,periodLabel:`${year}년 ${quarter}분기`}:{year,quarter,periodLabel:`${year}년 ${quarter}분기`,sales:null,op:null,sourceIds:note?.sourceIds||[],missingStatus:note?.status,missingReason:reason(year,quarter)};
 });
 const annual=STANDARD_FINANCIAL_YEARS.map(year=>{
  const row=company.annual.find(row=>{if(row.partialPeriod)return false;const dates=financialDateRange(row);return dates?dates.year===year&&dates.endYear===year&&dates.start===1&&dates.end===12:row.year===year&&!/(?:3|6)개월/.test(company.annualTerm||'');});
  const note=(company.financialPeriodNotes||[]).find(n=>n.year===year&&n.quarter===undefined);
  return row?{...row,periodLabel:String(year),period:String(year)}:{year,periodLabel:String(year),period:String(year),sales:null,op:null,sourceIds:note?.sourceIds||[],missingStatus:note?.status,missingReason:reason(year)};
 });
 return {annual,quarterly};
}
