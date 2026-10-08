const assert=require('node:assert/strict'),{amount,normalize,compare}=require('./dart-samsung.cjs');
function fixture(report='11011'){const row={corp_code:'00126380',bsns_year:'2025',reprt_code:report,sj_div:'IS',currency:'KRW',rcept_no:'20260311000001'};return {status:'000',list:[{...row,account_id:'ifrs-full_Revenue',account_nm:'매출액',thstrm_amount:'333,600,000,000,000',thstrm_add_amount:'666,000,000,000,000'},{...row,account_id:'dart_OperatingIncomeLoss',account_nm:'영업이익',thstrm_amount:'-50,000,000,000',thstrm_add_amount:'999,000,000,000'}]};}
const annual=normalize(fixture(),{year:2025,report:'11011'});assert.equal(annual.sales,333.6);assert.equal(annual.op,-.05);assert.equal(annual.rawKRW.op,'-50000000000');assert.equal(annual.quarter,undefined);
const quarter=normalize(fixture('11012'),{year:2025,report:'11012'});assert.equal(quarter.quarter,2);assert.equal(quarter.op,-.05);assert.equal(quarter.periodBasis,'three-month');
const withNet=fixture();withNet.list.push({...withNet.list[0],account_id:'ifrs-full_ProfitLoss',thstrm_amount:'45,206,805,000,000'});assert.equal(normalize(withNet,{year:2025,report:'11011'}).net,45.206805);
for(const [field,value] of [['currency','USD'],['corp_code','00000000'],['bsns_year','2024'],['reprt_code','11012'],['rcept_no','invalid'],['thstrm_amount','']]){const p=fixture();p.list[0][field]=value;assert.throws(()=>normalize(p,{year:2025,report:'11011'}));}
for(const status of ['010','013','020'])assert.throws(()=>normalize({status},{year:2025,report:'11011'}));
const conflict=fixture();conflict.list.push({...conflict.list[0],sj_div:'CIS',thstrm_amount:'1'});assert.throws(()=>normalize(conflict,{year:2025,report:'11011'}),/Conflicting/);
assert.throws(()=>amount('-'));assert.equal(amount('0'),0n);
const record={financials:{annual:[{year:2025,sales:333.6,op:-.05}],quarterly:[]}};assert.equal(compare(annual,record).status,'match');assert.equal(compare({...annual,op:1},record).status,'review-required');assert.equal(compare(quarter,record).status,'new-period');
console.log('PASS: synthetic DART fixtures; exact KRW conversion, quarter vs cumulative, losses, mismatch/missing guards and review flags. Live API not tested.');
