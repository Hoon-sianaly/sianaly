const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../company.html'),'utf8');
const functions=html.slice(html.indexOf('function metricChange('),html.indexOf("if(!c){app.innerHTML="));
const ctx=vm.createContext({c:{financialMetrics:{sales:{label:'매출'},op:{label:'영업이익'}}},salesLabel:'매출',opLabel:'영업이익'});vm.runInContext(functions,ctx);
for(const [current,previous,profit,expected] of [[110,100,false,'+10.0%'],[80,100,false,'-20.0%'],[1,-1,true,'흑자 전환'],[-1,1,true,'적자 전환'],[-1,-2,true,'적자 축소'],[-3,-2,true,'적자 확대'],[0,-2,true,'손익분기'],[1,0,false,'비교 기준 0'],[0,0,false,'변화 없음'],[1,undefined,false,'비교 자료 없음']])assert.equal(ctx.metricChange(current,previous,profit),expected);
const ordinary=ctx.financialInsights({year:2025,sales:200,op:20},{year:2024,sales:100,op:10},'전년 대비 · 2024년');assert.ok(ordinary.includes('10.0%')&&ordinary.includes('+100.0%')&&ordinary.includes('영업이익률'));
ctx.c.financialMetrics={sales:{label:'보험서비스손익'},op:{label:'지배주주 순이익'}};ctx.salesLabel='보험서비스손익';ctx.opLabel='지배주주 순이익';const insurance=ctx.financialInsights({year:2025,sales:200,op:20},null,'전년 대비');assert.ok(!insurance.includes('<span>영업이익률</span>'));assert.ok(insurance.includes('비교 자료 없음')&&!insurance.includes('NaN'));
console.log('Insights passed: growth, loss transitions, zero/missing comparisons, margin and sector-specific labels.');
