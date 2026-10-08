const assert=require('node:assert/strict'),core=require('./dart-core.cjs');
const company={key:'sample',corpCode:'00123456',fsDiv:'CFS',currency:'KRW',salesLabel:'매출',opLabel:'영업이익'};
const p={year:2026,report:'11012'};
const row={corp_code:company.corpCode,bsns_year:'2026',reprt_code:'11012',sj_div:'IS',currency:'KRW',fs_div:'CFS',rcept_no:'20260814000001'};
function fixture(){return {status:'000',list:[{...row,account_id:'ifrs-full_Revenue',account_nm:'매출액',thstrm_amount:'1000000000000',thstrm_add_amount:'9000000000000'},{...row,account_id:'dart_OperatingIncomeLoss',account_nm:'영업이익',thstrm_amount:'-50000000000'}]};}
const normalized=core.normalize(fixture(),company,p);assert.equal(normalized.sales,1);assert.equal(normalized.op,-.05);assert.equal(normalized.quarter,2);
for(const [field,value] of [['corp_code','00000000'],['currency','USD'],['fs_div','OFS'],['reprt_code','11013'],['bsns_year','2025'],['thstrm_amount','-']]){const f=fixture();f.list[0][field]=value;assert.throws(()=>core.normalize(f,company,p));}
const conflicting=fixture();conflicting.list.push({...conflicting.list[0],sj_div:'CIS',thstrm_amount:'2'});assert.throws(()=>core.normalize(conflicting,company,p),/Conflicting/);
const security=fixture();security.list.push({...row,account_id:'dart_TotalSellingGeneralAdministrativeExpenses',account_nm:'판매비와관리비',thstrm_amount:'100000000000'});assert.equal(core.normalize(security,{...company,salesLabel:'판관비 차감 전 영업손익'},p).sales,.05);
assert.throws(()=>core.normalize(fixture(),{...company,salesLabel:'보험수익'},p),/not found/);
const record={financials:{annual:[],quarterly:[{year:2026,quarter:2,sales:1,op:-.05}]}};
assert.equal(core.compare(normalized,record).status,'compatible');assert.equal(core.compare({...normalized,sales:2},record).status,'review-required');
assert.ok(core.tolerance(0)<1e-9);assert.ok(core.tolerance(100)<=.050000001);
const xml='<result><list><corp_code>00123456</corp_code><corp_name>Sample</corp_name><stock_code>123456</stock_code><modify_date>20261008</modify_date></list></result>';
assert.equal(core.corporateMap(xml).get('123456').corpCode,'00123456');assert.throws(()=>core.corporateMap(xml+xml),/Duplicate/);
const registry=core.registryFromXML(xml,{companies:[{key:'a',ticker:'123456'},{key:'ap',ticker:'123457'}]},{a:{financials:{basis:'separate'}},ap:{financials:{companyRef:'a'}}});assert.equal(registry.companies[0].fsDiv,'OFS');assert.equal(registry.companies[1].companyRef,'a');
console.log('PASS: issuer mapping, preferred-stock sharing, financial metric semantics, three-month amounts, basis/currency validation, missing data, conflicts and precision gates.');
