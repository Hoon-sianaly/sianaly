'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {reconcile,reconcileCheckout}=require('./dart-review.cjs');
const ledger=require('../data/dart-review-20261103.json');
const state={reviewQueue:ledger.results.map(r=>({key:r.key,receipt:r.receipt,title:r.title,reason:r.originalReason})),pending:[],completed:{}};
const result=reconcileCheckout(state);
assert.equal(ledger.results.length,97);assert.equal(new Set(ledger.results.map(r=>r.key)).size,91);
assert.deepEqual(ledger.summary,{total:97,issuers:91,updated:14,confirmed:15,excluded:43,deferred:25,changedCompanies:14});
assert.equal(result.closed.length,77);assert.equal(result.state.reviewQueue.length,20);
assert.equal(result.state.reviewHistory.length,77);assert.equal(state.reviewQueue.length,97);
assert(result.state.reviewQueue.every(r=>r.reviewReason&&r.followUp));
assert(!result.state.reviewQueue.some(r=>r.key==='bobcat'));assert(result.state.reviewQueue.some(r=>r.key==='delicious'));
assert(result.closed.some(r=>r.key==='dongasocio'&&r.status==='excluded'));
assert.equal(reconcileCheckout(result.state).closed.length,0);
for(const r of ledger.results){assert.match(r.documentSHA256,/^[a-f0-9]{64}$/);assert.equal(r.url,`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.receipt}`);}
const sample=ledger.results.find(r=>r.status==='updated'&&r.key==='il');
const record=JSON.parse(fs.readFileSync(path.resolve(__dirname,`../data/companies/${sample.key}.json`)));
const one={reviewQueue:[{key:sample.key,receipt:sample.receipt}]},single={results:[sample]};
assert.equal(reconcile(one,single,{il:record}).closed.length,1);
for(const mutate of [r=>{r.financials.quarterly.find(x=>x.year===sample.expected.year&&x.quarter===sample.expected.quarter).sales+=1;},r=>{r.financials.basis='separate';},r=>{r.financials.unit='USD_trillion';},r=>{r.sources=[];}]){
 const changed=structuredClone(record);mutate(changed);assert.equal(reconcile(one,single,{il:changed}).closed.length,0,'Unpublished or incompatible financial evidence must stay open');
}
const unknown={reviewQueue:[{key:'new',receipt:'20261103009999'}]};assert.equal(reconcile(unknown,ledger,{}).state.reviewQueue.length,1);
const invalid={results:[{...ledger.results.find(r=>r.status==='excluded'),exclusion:'unknown'}]};assert.equal(reconcile({reviewQueue:invalid.results},invalid,{}).closed.length,0);
// The wider missing-period backlog and registry safety policy remain separate.
const registry=require('../data/dart-companies.json').companies;
assert.equal(registry.find(c=>c.key==='cxi').mode,'review');
const kbstar=require('../data/companies/kbstarreit.json').financials;
const six=kbstar.quarterly.find(r=>r.reviewedFiling?.receipt==='20261022000450');
assert.equal(six.durationMonths,6);assert.equal(six.reportPeriod,'2026.02–07');assert.match(kbstar.quarterlyBasisLabel,/6개월/);
const jtc=require('../data/companies/jtc.json').financials;
assert.equal(jtc.unit,'JPY_trillion');assert(jtc.quarterly.some(r=>r.reportPeriod==='2026.06–08'&&r.reportedJPY));
const followUp=require('../data/dart-review-20261106.json');
assert.equal(followUp.results.length,25);assert.equal(followUp.results.filter(r=>r.status==='updated').length,5);
for(const decision of followUp.results.filter(r=>r.status==='updated')){
 const record=JSON.parse(fs.readFileSync(path.resolve(__dirname,`../data/companies/${decision.key}.json`)));
 const row=record.financials.quarterly.find(r=>r.year===2026&&r.quarter===3);
 assert.equal(row.disclosureStatus,'preliminary');
 assert(row.numericReview.precisionKRW.sales);
 assert.equal(reconcile({reviewQueue:[decision]},{results:[decision]},{[decision.key]:record}).closed.length,1);
 for(const mutate of [r=>{r.financials.quarterly.find(x=>x.year===2026&&x.quarter===3).sales+=.001;},r=>{r.sources=r.sources.filter(s=>s.url!==decision.url);}]){
  const invalid=structuredClone(record);mutate(invalid);assert.equal(reconcile({reviewQueue:[decision]},{results:[decision]},{[decision.key]:invalid}).closed.length,0);
 }
}
// A later regular report supersedes a reviewed preliminary figure; anything weaker keeps the item open.
{
 const prelim='20261022900289',regular='20261113000490',url=r=>`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r}`;
 const supersedeLedger={results:[{key:'sample',receipt:prelim,title:'연결재무제표기준영업(잠정)실적(공정공시)',status:'updated',reason:'checked',reviewedAt:'2026.11.03',url:url(prelim),expected:{currency:'KRW',basis:'consolidated',year:2026,quarter:3,sales:0.265589,op:0.010962,receipt:prelim}}]};
 const queue={reviewQueue:[{key:'sample',receipt:prelim,title:'잠정실적',reason:'identity'}],pending:[],completed:{}};
 const record=(row,extra={})=>({financials:{unit:'KRW_trillion',basis:'consolidated',annual:[],quarterly:[{year:2026,quarter:3,sales:0.265589333068,op:0.010962320566,sourceIds:['dart-2026-q3'],dart:{receipt:regular},...row}],...extra},sources:[{id:'dart-2026-q3',url:url(regular)}]});
 const run=rec=>reconcile(queue,supersedeLedger,{sample:rec});
 const closed=run(record({}));
 assert.equal(closed.closed.length,1);assert.equal(closed.closed[0].supersededBy,regular);assert.equal(closed.state.reviewQueue.length,0);
 assert.equal(run(record({disclosureStatus:'preliminary'})).closed.length,0,'a newer preliminary row does not supersede');
 assert.equal(run(record({dart:{receipt:'20261001000001'}})).closed.length,0,'an older receipt does not supersede');
 assert.equal(run(record({sourceIds:['missing']})).closed.length,0,'the regular report must be a published source');
 assert.equal(run(record({},{basis:'separate'})).closed.length,0,'basis must match');
 assert.equal(run(record({sales:null})).closed.length,0,'regular figures must be present');
}
console.log('PASS: 97 original decisions plus 25 follow-ups; 77 source-checked closures, 20 explained holds; publication guards, idempotence, fiscal periods, regular-report supersession and retained registry policy.');
