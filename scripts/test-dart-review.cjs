'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {reconcile,reconcileCheckout}=require('./dart-review.cjs');
const ledger=require('../data/dart-review-20261103.json');
const state={reviewQueue:ledger.results.map(r=>({key:r.key,receipt:r.receipt,title:r.title,reason:r.originalReason})),pending:[],completed:{}};
const result=reconcileCheckout(state);
assert.equal(ledger.results.length,97);assert.equal(new Set(ledger.results.map(r=>r.key)).size,91);
assert.deepEqual(ledger.summary,{total:97,issuers:91,updated:14,confirmed:15,excluded:43,deferred:25,changedCompanies:14});
assert.equal(result.closed.length,72);assert.equal(result.state.reviewQueue.length,25);
assert.equal(result.state.reviewHistory.length,72);assert.equal(state.reviewQueue.length,97);
assert(result.state.reviewQueue.every(r=>r.reviewReason&&r.followUp));
assert(result.state.reviewQueue.some(r=>r.key==='bobcat'));assert(result.state.reviewQueue.some(r=>r.key==='delicious'));
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
console.log('PASS: 97 receipt decisions; 72 source-checked closures, 25 explained holds; amount/basis/currency/source guards, idempotence, fiscal periods and retained registry policy.');
