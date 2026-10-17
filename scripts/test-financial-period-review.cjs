const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=require('path').resolve(__dirname,'..'),data=require('../data/financial-period-review.json'),catalog=require('../data/company-index.json');
const ctx=vm.createContext({fetch:async u=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(require('path').join(root,u.split('?')[0]),'utf8'))})});
vm.runInContext(fs.readFileSync(root+'/company-data.js','utf8')+'\n'+fs.readFileSync(root+'/financial-periods.js','utf8'),ctx);
(async()=>{let notes=0,recovered=0;
 for(const [key,r]of Object.entries(data.companies)){
  assert(catalog.companies.some(c=>c.key===key&&c.ticker===r.ticker));
  const raw=require(root+'/data/companies/'+key+'.json');assert(!raw.financials.companyRef);
  const anchor=row=>row?{sales:row.sales,op:row.op,sourceIds:row.sourceIds}:null;
  const canonical=raw.financials,anchors={annual2025:anchor(canonical.annual.find(r=>r.year===2025)),quarter2025Q2:anchor(canonical.quarterly.find(r=>r.year===2025&&r.quarter===2)),quarter2026Q2:anchor(canonical.quarterly.find(r=>r.year===2026&&r.quarter===2))},compatible=JSON.stringify(anchors)===JSON.stringify(r.anchors);
  const loaded=await vm.runInContext(`loadCompanyData(${JSON.stringify(key)})`,ctx);ctx.company=loaded;
  const fixed=vm.runInContext('standardFinancialRows(company)',ctx);
  for(const [kind,rows]of [['annual',loaded.annual],['quarterly',loaded.allQuarters]])for(const old of raw.financials[kind]){const current=rows.find(x=>x.year===old.year&&x.quarter===old.quarter);assert.equal(current.sales,old.sales);assert.equal(current.op,old.op);}
  const slots=[...fixed.annual,...fixed.quarterly];
  for(const note of r.notes){assert(note.reason&&note.checkedAt&&['not-established','partial-first-period','different-fiscal-period','unconfirmed'].includes(note.status));const slot=slots.find(s=>s.year===note.year&&s.quarter===note.quarter);assert(slot);if(slot.sales===null){assert.equal(slot.missingReason,note.reason);assert.equal(slot.op,null);}for(const id of note.sourceIds)assert(loaded.sourceLinks[id],key+' note source '+id);notes++;}
  for(const row of [...r.annual,...r.quarterly]){const actual=slots.find(s=>s.year===row.year&&s.quarter===row.quarter);if(compatible){assert.equal(actual.sales,row.sales);assert.equal(actual.op,row.op);for(const id of row.sourceIds)assert(loaded.sourceLinks[id]?.url.includes('rcpNo='));}for(const field of ['sales','op'])assert.equal(row[field],Number(row['reported'+r.currency][field])/1e12);recovered++;}
 }
 const key=Object.keys(data.companies).find(k=>data.companies[k].quarterly.length),raw=JSON.parse(fs.readFileSync(root+'/data/companies/'+key+'.json'));const changed=structuredClone(raw.financials);const target=changed.annual.find(r=>r.year===2025)||changed.quarterly[0];if(target)target.sales+=1;ctx.changed=changed;ctx.record=raw;const held=await vm.runInContext('addFinancialPeriodReview(record,changed)',ctx);assert.equal(held.financials.quarterly.length,raw.financials.quarterly.length,'new anchors must hold supplementary values');
 ctx.sample={annual:[{year:2025,sales:0,op:0}],allQuarters:[],financialPeriodNotes:[{year:2025,status:'unconfirmed',reason:'確認不可'},{year:2025,quarter:1,status:'not-established',reason:'설립 전 자체 실적 없음'}]};const sample=vm.runInContext('standardFinancialRows(sample)',ctx);assert.equal(sample.annual[2].sales,0);assert.equal(sample.quarterly[0].sales,null);assert.equal(sample.quarterly[0].missingReason,'설립 전 자체 실적 없음');
 const preferred=catalog.companies.find(c=>{const f=require(root+'/data/companies/'+c.key+'.json').financials;return f.companyRef&&data.companies[f.companyRef]?.quarterly.length;});if(preferred){const child=await vm.runInContext(`loadCompanyData(${JSON.stringify(preferred.key)})`,ctx),parentKey=require(root+'/data/companies/'+preferred.key+'.json').financials.companyRef,parent=await vm.runInContext(`loadCompanyData(${JSON.stringify(parentKey)})`,ctx);assert.deepEqual(child.allQuarters,parent.allQuarters);assert.deepEqual(child.financialPeriodNotes,parent.financialPeriodNotes);}
 console.log('PASS financial period review:',Object.keys(data.companies).length,'issuers,',notes,'period reasons,',recovered,'recovered periods; canonical values, real zero, missing/null, source links, anchor guard and preferred inheritance.');
})().catch(e=>{console.error(e);process.exitCode=1});
