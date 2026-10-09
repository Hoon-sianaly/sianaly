const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const loader = fs.readFileSync(path.join(root, "company-data.js"), "utf8");
const html = fs.readFileSync(path.join(root, "company.html"), "utf8");
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join("\n");
function context(key, transform, failed = false) {
 const nodes = {}, storage = new Map(), errors = [], requests = [];
 const classList = () => ({add(){},toggle(){}});
 const ctx = vm.createContext({
  URLSearchParams, document:{body:{classList:classList()},getElementById(id){return nodes[id] ||= {innerHTML:"",classList:classList(),addEventListener(){}};}},
  location:{search:`?company=${key}`,reload(){}},
  console:{error(error){errors.push(error);}},
  localStorage:{getItem:key=>storage.get(key) || null,setItem:(key,value)=>storage.set(key,value)},
  fetch:async url=>{
   requests.push(url);
   if (failed) return {ok:false,status:503};
   const data = JSON.parse(fs.readFileSync(path.join(root,url.split("?")[0]),"utf8"));
   if (transform) transform(data);
   return {ok:true,json:async()=>data};
  }
 });
 vm.runInContext(loader,ctx);
 return {ctx,nodes,storage,errors,requests};
}
(async()=>{
 const catalog = JSON.parse(fs.readFileSync(path.join(root,"data/company-index.json"),"utf8"));
 for (const entry of catalog.companies) {
  const state = context(entry.key);
  await vm.runInContext(script,state.ctx);
  const out = state.nodes.app.innerHTML;
  assert.equal(state.errors.length,0,entry.key);
  assert.ok(out.includes(entry.name),entry.key);
  for (const id of ["intro","business","annual","quarterly","drivers","glossary"]) {
   const record=JSON.parse(fs.readFileSync(path.join(root,"data/companies",entry.file),"utf8"));
   if(id==='glossary'&&record.presentation.compact&&!record.glossary.length){
    assert.ok(!out.includes('href="#company-glossary"')&&!out.includes('id="company-glossary"'),entry.key+'/empty glossary');continue;
   }
   assert.ok(out.includes(`href="#company-${id}"`) && out.includes(`id="company-${id}"`),`${entry.key}/${id}`);
  }
  assert.equal((out.match(/class="vertical-chart"/g)||[]).length,4);
  assert.ok(!out.includes("undefined") && !out.includes("NaN"),entry.key);
  if(entry.key==='shinyoung'){
   assert.ok(out.includes('2025.04–2026.03')&&out.includes('2026.04–06 (회계 1분기)'), 'Actual fiscal reporting dates must be visible');
   assert.ok(!out.includes('1분기: 1–3월'), 'Fiscal quarter must not use calendar-month guidance');
  }
  assert.equal(JSON.parse(state.storage.get("sianalyRecent"))[0].key,entry.key);
  assert.ok(!out.includes("주가와 밸류에이션"),entry.key);
  assert.ok(out.includes("공식 자료") && !out.includes("발표 null"),entry.key);
  const record=JSON.parse(fs.readFileSync(path.join(root,"data/companies",entry.file),"utf8"));
  if(record.financials.metrics){
   for(const metric of Object.values(record.financials.metrics)) {
    assert.ok(out.includes(`<figcaption>${metric.label}</figcaption>`),`${entry.key}: chart metric`);
    assert.ok(out.includes(`<th scope="col">${metric.label}</th>`),`${entry.key}: table metric`);
    assert.ok(!out.includes(`<figcaption>${metric.label}</figcaption><p class="desc">`),`${entry.key}: chart has no definition paragraph`);
   }
  }
  if (entry.key === "sksquare") {
   assert.ok(out.includes("지분법 이익이 포함") && out.includes("재작성 수치"));
   for(const row of record.financials.annual)for(const field of ["sales","op"])assert.ok(out.includes(vm.runInContext(`formatFinancialHighlight(${row[field]})`,state.ctx)+"</td>"));
  }
  if (record.financials.annualTerm === "6개월 결산") {
   assert.ok(out.includes("6개월 결산 실적 그래프"),entry.key);
   assert.ok(!out.includes("연간 실적 그래프")&&!out.includes("연간 보고 기간"),entry.key);
   assert.ok(out.includes(record.financials.annual.at(-1).reportPeriod),entry.key);
  }
  if (entry.key === "kbif") {
   assert.ok(out.includes("운용수익 (회계상)")&&out.includes("당기순이익 (회계상)"));
   assert.ok(!out.includes("<span>영업이익률</span>"));
  }
  if (entry.key === "mapsrealty") {
   assert.ok(out.includes('2026 상반기 결산 실적 그래프'));
   assert.ok(out.includes('6개월 실적 · 2026.01–06'));
   assert.ok(!out.includes('각 분기 3개월 실적(누적 아님)'));
   assert.ok(!out.includes('<span>영업이익률</span>'));
   assert.equal(record.financials.quarterly[0].durationMonths,6);
   assert.deepEqual(record.financials.annual.map(r=>r.year),[2024,2025]);
  }
  if (entry.key === "samsungel") {
   assert.ok(out.includes("자료 기준 2025년 연간까지"));
   assert.ok(out.includes("억원</td>"));
   assert.ok(out.includes("패키지솔루션") && !out.includes("<h3>4. 전장"));
  }
  if (entry.key === "samsungpref") {
   assert.ok(out.includes("삼성전자우만의 별도 매출") && out.includes("의결권"));
   assert.ok(out.includes("삼성전자 공식 연간 실적 자료"));
  }
  if (entry.key === "samsung") {
   assert.equal((out.match(/metric-panel/g)||[]).length,4);
   for(const row of record.financials.annual)for(const field of ["sales","op"])assert.ok(out.includes(vm.runInContext(`formatFinancialHighlight(${row[field]})`,state.ctx)+"</td>"));
   assert.ok(!out.includes("<div class=\"blue\">01"));
  }
  if (entry.key === "hynix") {
   assert.equal((out.match(/metric-panel/g)||[]).length,4);
   assert.ok(out.includes("조원"));
   for(const row of record.financials.annual)for(const field of ["sales","op"])assert.ok(out.includes(vm.runInContext(`formatFinancialHighlight(${row[field]})`,state.ctx)+"</td>"));
   assert.ok(out.includes("SK하이닉스 공식 연간 실적 자료"));
   assert.ok(!out.includes("삼성전자 공식 연간 실적 자료"));
   assert.ok(!out.includes("주가와 밸류에이션"));
   assert.ok(!out.includes("<div class=\"blue\">01"));
  }
 }
 const preferred = context("samsungpref");
 const rows = await vm.runInContext("loadCompanyData('samsungpref')",preferred.ctx);
 assert.ok(preferred.requests.some(url=>url.includes("samsung.json")));
 assert.equal(rows.latestSales,vm.runInContext("formatFinancialHighlight("+JSON.parse(fs.readFileSync(path.join(root,"data/companies/samsung.json"))).financials.annual.at(-1).sales+")",preferred.ctx));
 const yearState = context("samsung",data=>{
  if(data.profile?.key === "samsung") {
   data.financials.annual.push({year:2099,sales:123,op:12,sourceIds:["annual"]});
   data.financials.quarterly.push({year:2099,quarter:4,sales:31,op:3,sourceIds:["q2"]});
  }
 });
 const future = await vm.runInContext("loadCompanyData('samsung')",yearState.ctx);
 assert.equal(future.latestYear,"2099");
 assert.equal(future.latestSales,"123조원");
 assert.equal(future.quarterlyYear,2099);
 assert.equal(future.quarterly.length,1);
 assert.equal(future.latestNet,null);
 const invalid = context("not-a-company");
 await vm.runInContext(script,invalid.ctx);
 assert.ok(invalid.nodes.app.innerHTML.includes("기업 정보를 찾을 수 없습니다"));
 assert.equal(invalid.requests.length,1);
 const failure = context("samsung",null,true);
 await vm.runInContext(script,failure.ctx);
 assert.ok(failure.nodes.app.innerHTML.includes("다시 시도"));
 const cycle = context("samsung",data=>{if(data.profile?.key === "samsung") data.financials={companyRef:"samsungpref"};});
 await assert.rejects(vm.runInContext("loadCompanyData('samsung')",cycle.ctx),/순환/);
 const loss = context("sksquare");
 await vm.runInContext(script,loss.ctx);
 assert.ok(loss.nodes.app.innerHTML.includes('fill="#dc2626"'));
 assert.ok(loss.nodes.app.innerHTML.includes("영업손실은 0선 아래"));
 console.log(`Passed: all ${catalog.companies.length} pages, sector metrics, shared financials, future periods, invalid keys, load failure and circular references.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
