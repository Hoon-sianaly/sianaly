'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(__dirname+'/../company-reading.js','utf8'),ctx);
const compact=ctx.compactCompanyText;
for(const [before,after]of [
 ['DRAM은 작업 중인 데이터를 저장합니다.','DRAM은 작업 중인 데이터를 저장'],
 ['내부 거래를 제거합니다.','내부 거래를 제거'],['사업 범위에 포함합니다.','사업 범위에 포함'],
 ['AI 연산에 쓰입니다.','AI 연산에 사용'],['화면에 사용됩니다.','화면에 사용'],
 ['실제 현금 수입과 같지는 않습니다.','실제 현금 수입과 같지는 않음'],
 ['손실이 발생할 수 있습니다.','손실이 발생할 수 있음']
]){assert.equal(ctx.compactGlossaryText(before),after);assert.equal(ctx.compactGlossaryText(after),after);}
for(const [before,after]of [
 ['반도체를 만듭니다.','반도체를 만듦'],['향후 실적이 달라질 수 있습니다.','향후 실적이 달라질 수 있음'],
 ['사업을 운영하고 있습니다.','사업을 운영하고 있음'],['기존 매출을 반영했습니다.','기존 매출을 반영했음'],
 ['현금 수입과 같지 않습니다.','현금 수입과 같지 않음'],['확정된 매출은 아닙니다.','확정된 매출은 아님'],
 ['산업용 부품에 쓰입니다.','산업용 부품에 쓰임'],['상승세를 보입니다.','상승세를 보임'],
 ['금리에 따라 움직입니다.','금리에 따라 움직임'],['정확한 비교는 어렵습니다.','정확한 비교는 어려움'],
 ['이해하기 쉽습니다.','이해하기 쉬움'],['다른 회사의 생산을 돕습니다.','다른 회사의 생산을 도움'],
 ['공장을 짓습니다.','공장을 지음'],['기계 부품을 팝니다.','기계 부품을 팖'],['문을 엽니다.','문을 엶']
])assert.equal(compact(before),after);
let count=0;
function verify(value){
 if(typeof value==='string'){
  const after=compact(value);assert.equal(compact(after),after,'Copy conversion must be idempotent');
  assert.deepEqual(after.match(/[A-Za-z0-9]+(?:[.,%/-][A-Za-z0-9]+)*/g)||[],value.match(/[A-Za-z0-9]+(?:[.,%/-][A-Za-z0-9]+)*/g)||[],'Dates, numeric values and English identifiers must remain intact');
  assert(!/니다(?=[.!?](?:\s|$)|\s*$)/.test(after),after);count++;
 }else if(Array.isArray(value))value.forEach(verify);else if(value)Object.values(value).forEach(verify);
}
for(const file of fs.readdirSync(__dirname+'/../data/companies')){
 const r=JSON.parse(fs.readFileSync(__dirname+'/../data/companies/'+file));verify(r.overview);verify(r.glossary);
 const restored=ctx.prepareCompanyCopy({...r.overview,glossary:r.glossary});
 for(const key of ['takeaways','business','drivers'])assert.deepEqual(restored[key],r.overview[key],file+'/'+key+' keeps the original prose');
 assert.equal(restored.introSummary,r.overview.summary);
 for(const term of restored.glossary)assert.equal(ctx.compactGlossaryText(term.desc),term.desc);
}
const sample={summary:'제품을 만듭니다.',annual:[{year:2026,sales:0,op:-1}],sourceLinks:{original:{label:'공식 보고서입니다.',url:'https://example.com'}},glossary:[{name:'DRAM · NAND',desc:'메모리입니다.'},{name:'IP',desc:'지식재산입니다.'},{name:'방산',desc:'방위산업입니다.'},{name:'리스',desc:'빌리는 계약입니다.'},{name:'보험계약서비스마진(CSM)',desc:'미래 이익입니다.'}],financialMetrics:{sales:{label:'매출',help:'전체 판매 금액'},op:{label:'영업이익',help:'본업 이익'}}};
const transformed=ctx.prepareCompanyCopy(sample);assert.equal(sample.summary,'제품을 만듭니다.');assert.equal(transformed.summary,'제품을 만듦');assert.deepEqual(transformed.annual,sample.annual);assert.deepEqual(transformed.sourceLinks,sample.sourceLinks);
const {entries,terms}=ctx.companyReadingTerms(sample);
const find=text=>JSON.parse(JSON.stringify(ctx.findCompanyTerms(text,entries))).map(m=>text.slice(m.start,m.end));
assert.deepEqual(find('DRAM·NAND와 IP, CSM'),['DRAM·NAND','IP','CSM']);
assert.deepEqual(find('DRAM과 NAND'),['DRAM','NAND']);
assert.deepEqual(find('IPTV와 전방산업, 스테인리스, 폴리스티렌'),[]);
assert.deepEqual(find('차량 리스와 방산 수출'),['리스','방산']);
assert.deepEqual(find('영업이익률과 영업이익, 매출원가, 매출'),['영업이익률','영업이익','매출원가','매출']);
assert.equal(terms[ctx.findCompanyTerms('CSM',entries)[0].index].name,'보험계약서비스마진(CSM)');
console.log(`PASS company reading: ${count} source strings; concise endings, preserved uncertainty/negation/tense and numeric identifiers, unchanged financials/sources, term aliases and overlap boundaries.`);
