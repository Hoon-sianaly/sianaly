const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),root=path.resolve(__dirname,'..'),ctx=vm.createContext({}),catalog=require('../data/company-index.json'),registry=require('../data/dart-companies.json'),keys=new Set(catalog.companies.map(c=>c.key)),issuers=new Map(registry.companies.filter(c=>!c.companyRef).map(c=>[c.key,c]));
vm.runInContext(fs.readFileSync(path.join(root,'financial-periods.js'),'utf8'),ctx);
ctx.shortPeriodCompany={annual:[{year:2025,sales:0,op:-1,partialPeriod:true,reportPeriod:'2025.01.08–2025.12.31'}],allQuarters:[{year:2025,quarter:2,sales:0,op:-1,partialPeriod:true,reportPeriod:'2025.04.08–2025.06.30'},{year:2026,quarter:2,sales:0,op:-2,reportPeriod:'2026.04–06'}]};
const shortPeriods=vm.runInContext('standardFinancialRows(shortPeriodCompany)',ctx);
assert.equal(shortPeriods.annual.find(r=>r.year===2025).sales,null);
assert.equal(shortPeriods.quarterly.find(r=>r.year===2025&&r.quarter===2).sales,null);
assert.equal(shortPeriods.quarterly.find(r=>r.year===2026&&r.quarter===2).sales,0);
async function checkHistoryLoader(){
 const loadContext=vm.createContext({fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,url.split('?')[0]),'utf8'))})});
 vm.runInContext(fs.readFileSync(path.join(root,'company-data.js'),'utf8'),loadContext);
 const original=await vm.runInContext("loadCompanyRecord('hynix')",loadContext);
 loadContext.input=original;
 const merged=await vm.runInContext('addFinancialHistory(input)',loadContext);
 assert.equal(merged.historyStatus,'loaded');
 assert(merged.financials.annual.some(row=>row.year===2023));
 for(const row of original.financials.annual)assert.deepEqual(merged.financials.annual.find(r=>r.year===row.year),row);
 for(const row of original.financials.quarterly)assert.deepEqual(merged.financials.quarterly.find(r=>r.year===row.year&&r.quarter===row.quarter),row);
 const changed=JSON.parse(JSON.stringify(original));changed.financials.annual.find(row=>row.year===2025).sales+=1;loadContext.input=changed;
 const held=await vm.runInContext('addFinancialHistory(input)',loadContext);
 assert.equal(held.historyStatus,'baseline-changed');assert.equal(held.financials.annual.length,changed.financials.annual.length);
 const preferred=await vm.runInContext("loadCompanyData('samsungpref')",loadContext),parent=await vm.runInContext("loadCompanyData('samsung')",loadContext);
 assert.deepEqual(preferred.annual,parent.annual);assert.deepEqual(preferred.allQuarters,parent.allQuarters);
 console.log('PASS historical loader: canonical values win, changed anchors held, preferred shares inherit issuer history.');
}
checkHistoryLoader().catch(error=>{console.error(error);process.exitCode=1;});
const sample={annual:[{year:2024,sales:0,op:-1},{year:2025,sales:2,op:1}],allQuarters:[{year:2025,quarter:2,sales:0,op:-1},{year:2026,quarter:2,sales:3,op:1}],quarterlyTerm:'분기'};ctx.sample=sample;const result=vm.runInContext('standardFinancialRows(sample)',ctx);assert.equal(result.quarterly.length,6);assert.equal(result.annual.length,3);assert.equal(result.quarterly[1].sales,0);assert.equal(result.quarterly[0].sales,null);assert(result.quarterly[0].missingReason);assert.equal(result.annual[0].sales,null);assert.equal(result.annual[1].sales,0);
ctx.sample={...sample,annual:[{year:2025,periodLabel:'2024.04–2025.03',sales:1,op:1}],allQuarters:[{year:2026,quarter:2,periodLabel:'2026.01–06',durationMonths:6,sales:1,op:1}],quarterlyTerm:'반기(6개월)'};const special=vm.runInContext('standardFinancialRows(sample)',ctx);assert(special.quarterly.every(r=>r.sales===null));assert(special.annual.every(r=>r.sales===null));
ctx.sample={...sample,allQuarters:[{year:2025,quarter:1,periodLabel:'2025.04–06 (회계 1분기)',sales:7,op:2}]};const mapped=vm.runInContext('standardFinancialRows(sample)',ctx);assert.equal(mapped.quarterly[1].sales,7);assert.equal(mapped.quarterly[0].sales,null);
let rows=0,companies=0;for(let i=0;i<16;i++){const s=JSON.parse(fs.readFileSync(path.join(root,'data/history/'+i.toString(16)+'.json')));assert.equal(s.schemaVersion,1);for(const [key,h]of Object.entries(s.companies)){assert(keys.has(key));const c=issuers.get(key);assert(c);assert.equal(h.ticker,c.ticker);assert.equal(h.currency,c.currency);assert.equal(h.basis,c.fsDiv==='CFS'?'consolidated':'separate');assert.equal([...key].reduce((n,ch)=>(n+ch.charCodeAt(0))%16,0),i);const sources=new Set(h.sources.map(x=>x.id));for(const x of h.sources){assert.match(x.url,/^https:\/\/dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d{14}$/);assert(x.verifiedAt);}for(const r of [...h.annual,...h.quarterly]){assert(r.sourceIds.length&&r.sourceIds.every(x=>sources.has(x)));for(const field of ['sales','op']){assert.match(r['reported'+h.currency][field],/^-?\d+$/);assert.equal(r[field],Number(r['reported'+h.currency][field])/1e12);}if(r.history.method==='annual-minus-first-nine-month'){assert.equal(r.quarter,4);for(const field of ['sales','op'])assert.equal(BigInt(r['reported'+h.currency][field]),BigInt(r.history.evidence.annual[field])-BigInt(r.history.evidence.firstNine[field]));assert.equal(r.sourceIds.length,2);}rows++;}companies++;}}assert.equal(companies,issuers.size);console.log('PASS fixed history:',companies,'issuers,',rows,'official supplementary periods; six quarters/three years, zero vs missing, fiscal/half-year exclusions and exact raw calculations.');
