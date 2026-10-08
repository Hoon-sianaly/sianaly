const assert=require('node:assert/strict');
const d=require('./dart-disclosures.cjs');
const registry={companies:[{key:'sample',corpCode:'00123456',validation:{asOf:'2026-10-08'}}]};
function filing(receipt='20261008000001',name='[기재정정]분기보고서 (2026.03)'){return {corp_code:'00123456',rcept_no:receipt,rcept_dt:'20261008',report_nm:name};}
const state={schemaVersion:1,scannedThrough:'2026-10-08',pending:[],reviewQueue:[],completed:{}};
async function main(){
 assert.deepEqual(d.reportPeriod('[첨부정정]반기보고서 (2026.06)'),{year:2026,month:6,report:'11012'});
 assert.equal(d.reportPeriod('사업보고서 (2025.12)').report,'11011');assert.equal(d.reportPeriod('분기보고서 (2026.09)').report,'11014');
 assert.equal(d.reportPeriod('분기보고서 (2026.12)').report,null);assert.equal(d.reportPeriod('기업설명회 개최'),null);
 assert.ok(d.windows('2026-01-01','2026-10-08').every(w=>new Date(w.to)-new Date(w.from)<=29*86400000));
 let calls=0;
 const mock=async(endpoint,args)=>{assert.equal(endpoint,'list.json');assert.equal(args.last_reprt_at,'N');calls++;return {status:'000',page_no:args.page_no,total_page:2,list:args.page_no==='1'?[filing(),{...filing(),corp_code:'00999999'}]:[filing('20261008000002')]};};
 const found=await d.discover(registry,state,'2026-10-08',mock);assert.equal(calls,2);assert.equal(found.state.pending.length,1);assert.equal(found.state.pending[0].receipt,'20261008000002');assert.equal(state.pending.length,0);
 const repeated=await d.discover(registry,found.state,'2026-10-08',mock);assert.equal(repeated.state.pending.length,1);
 const completed=structuredClone(found.state);d.complete(completed,completed.pending);assert.equal(completed.pending.length,0);
 assert.equal((await d.discover(registry,completed,'2026-10-08',mock)).state.pending.length,0);
 const zero=await d.discover(registry,state,'2026-10-08',async()=>({status:'013'}));assert.equal(zero.state.pending.length,0);assert.equal(zero.listRequests,1);
 const retry=await d.discover(registry,found.state,'2026-10-09',async()=>({status:'013'}));assert.equal(retry.state.pending.length,1);
 const unsupported=await d.discover(registry,state,'2026-10-08',async()=>({status:'000',page_no:1,total_page:1,list:[filing('20261008000003','사업보고서 (2026.03)')]}));assert.equal(unsupported.state.reviewQueue.length,1);assert.equal(unsupported.state.pending.length,0);
 await assert.rejects(()=>d.discover(registry,state,'2026-10-08',async(e,a)=>a.page_no==='1'?{status:'000',page_no:1,total_page:2,list:[filing()]}:{status:'013'}),/pagination/);assert.equal(state.scannedThrough,'2026-10-08');
 // An older publication acknowledgment cannot delete a newer correction waiting in the queue.
 const newest=structuredClone(found.state);d.complete(newest,[{...newest.pending[0],receipt:'20261008000001'}]);assert.equal(newest.pending.length,1);
 console.log('PASS: pagination, corrections, ignored issuers, durable retries, no-change runs, interrupted scans, deduplication and publication acknowledgment.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
