const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { requiredTerms, hasExplanation } = require("./glossary-rules.cjs");
const root = path.resolve(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/company-index.json"), "utf8"));
const records = new Map();
const tickers = new Set();
assert.equal(catalog.schemaVersion, 1);
assert.ok(Array.isArray(catalog.companies) && catalog.companies.length);
for (const entry of catalog.companies) {
 assert.match(entry.key, /^[a-z][a-z0-9-]*$/);
 assert.equal(entry.file, `${entry.key}.json`);
 assert.ok(!records.has(entry.key), `Duplicate key: ${entry.key}`);
 assert.match(entry.ticker, /^[0-9A-Z]{6}$/);
 assert.ok(!tickers.has(entry.ticker), `Duplicate ticker: ${entry.ticker}`);
 tickers.add(entry.ticker);
 const record = JSON.parse(fs.readFileSync(path.join(root, "data/companies", entry.file), "utf8"));
 assert.equal(record.schemaVersion, 1);
 assert.equal(record.profile.key, entry.key);
 assert.equal(record.profile.name, entry.name);
 assert.equal(record.profile.ticker, entry.ticker);
 for (const field of ["summary", "short"]) assert.ok(record.overview[field]?.trim());
 assert.equal(record.overview.takeaways.length, 5);
 for (const field of ["business", "drivers"]) assert.ok(Array.isArray(record.overview[field]) && record.overview[field].length);
 assert.ok(["legacy", "comparison"].includes(record.presentation.chartStyle));
 const ids = new Set();
 for (const source of record.sources) {
  assert.ok(source.id && source.label && !ids.has(source.id), `Invalid source: ${entry.key}`);
  ids.add(source.id);
  if (source.url) assert.equal(new URL(source.url).protocol, "https:");
 }
 for (const refs of Object.values(record.sectionSourceIds)) for (const id of refs) assert.ok(ids.has(id), `Missing section source: ${entry.key}/${id}`);
 records.set(entry.key, record);
}
function validateFinancials(record, seen = []) {
 const key = record.profile.key, financials = record.financials;
 assert.ok(!seen.includes(key), `Circular financial reference: ${key}`);
 if (financials.companyRef) {
  assert.ok(records.has(financials.companyRef), `Missing financial parent: ${key}`);
  assert.equal(Object.keys(financials).length, 1, `Referenced financials must not duplicate rows: ${key}`);
  return validateFinancials(records.get(financials.companyRef), [...seen, key]);
 }
 assert.equal(financials.unit, "KRW_trillion");
 if(financials.metrics) for(const field of ["sales","op"]){
  assert.ok(financials.metrics[field]?.label?.trim(),`Missing metric label: ${key}/${field}`);
  assert.ok(financials.metrics[field]?.help?.trim(),`Missing metric explanation: ${key}/${field}`);
 }
 assert.ok(["consolidated", "separate"].includes(financials.basis));
 assert.ok(["verified", "unverified"].includes(financials.verification.status));
 const verified = financials.verification.status === "verified";
 const awaiting=financials.availability?.status === "awaiting-first-report";
 if(awaiting){
  assert.equal(verified,false,`Awaiting record cannot claim verified financials: ${key}`);
  assert.ok(financials.availability.reason?.trim());
  assert.ok(financials.availability.sourceIds?.length);
  for(const id of financials.availability.sourceIds) assert.ok(record.sources.some(s=>s.id===id&&s.url),`Missing availability source: ${key}`);
  assert.deepEqual(financials.annual,[]);assert.deepEqual(financials.quarterly,[]);
 }
 if (verified) assert.match(financials.verification.verifiedAt, /^\d{4}\.\d{2}\.\d{2}$/);
 for (const field of ["annual", "quarterly"]) {
  assert.ok(Array.isArray(financials[field]) && (financials[field].length || awaiting), `No ${field} rows: ${key}`);
  const periods = new Set();
  for (const row of financials[field]) {
   assert.ok(Number.isInteger(row.year) && row.year >= 1900 && row.year <= 2200);
   if (field === "quarterly") assert.ok(Number.isInteger(row.quarter) && row.quarter >= 1 && row.quarter <= 4);
   if (row.durationMonths !== undefined) {
    assert.equal(field,'quarterly',`Duration override belongs to period graph: ${key}`);
    assert.equal(row.durationMonths,6,`Unsupported duration override: ${key}`);
    assert.ok(financials.quarterlyTerm && financials.quarterlyBasisLabel.includes('6개월'),`Six-month graph must identify its duration: ${key}`);
    assert.ok(row.reportPeriod && row.periodLabel,`Six-month row must show actual dates: ${key}`);
   }
   const period = `${row.year}/${row.quarter || 0}`;
   assert.ok(!periods.has(period), `Duplicate period: ${key}/${period}`);
   periods.add(period);
   assert.ok(Number.isFinite(row.sales) && row.sales >= 0, `Invalid sales: ${key}/${period}`);
   assert.ok(Number.isFinite(row.op), `Invalid operating profit: ${key}/${period}`);
   if (row.net !== undefined) assert.ok(Number.isFinite(row.net));
   assert.ok(Array.isArray(row.sourceIds));
   if (verified) assert.ok(row.sourceIds.length, `Verified row needs a source: ${key}/${period}`);
   for (const id of row.sourceIds) {
    const source = record.sources.find(source => source.id === id);
    assert.ok(source, `Missing row source: ${key}/${id}`);
    if (verified) assert.ok(source.url && (source.published || source.asOf) && source.verifiedAt, `Incomplete verified source: ${key}/${id}`);
   }
  }
 }
 for(const annual of financials.annual){
  if(!annual.calculation)continue;
  assert.equal(annual.calculation.method,'sum-calendar-quarters');
  const quarters=financials.quarterly.filter(row=>row.year===annual.year);
  assert.deepEqual(quarters.map(row=>row.quarter).sort(),[1,2,3,4],`Annual sum needs four quarters: ${key}`);
  for(const field of ['sales','op']){
   for(const row of quarters){assert.match(row.reportedKRW?.[field]||'',/^-?\d+$/);assert.equal(row[field],Number(row.reportedKRW[field])/1e12);}
   const total=quarters.reduce((sum,row)=>sum+BigInt(row.reportedKRW[field]),0n).toString();
   assert.equal(annual.calculation.rawKRW[field],total,`Calendar annual sum mismatch: ${key}/${field}`);
   assert.equal(annual[field],Number(total)/1e12);
  }
  assert.deepEqual([...new Set(quarters.flatMap(row=>row.sourceIds))].sort(),[...annual.sourceIds].sort(),`Annual sum source mismatch: ${key}`);
 }
 for(const row of financials.quarterly.filter(row=>row.derivation==='six-month-minus-first-three-month')){
  const total=financials.annual.find(r=>r.year===row.year),first=financials.quarterly.find(r=>r.year===row.year&&r.quarter===1);
  assert.equal(financials.annualTerm,'6개월 결산');
  assert.equal(row.quarter,2);assert.ok(total&&first,`Missing subtraction periods: ${key}`);
  for(const field of ['sales','op']){
   for(const item of [row,total,first]){assert.match(item.reportedKRW?.[field]||'',/^-?\d+$/);assert.equal(item[field],Number(item.reportedKRW[field])/1e12);}
   assert.equal(row.reportedKRW[field],String(BigInt(total.reportedKRW[field])-BigInt(first.reportedKRW[field])),`Three-month subtraction mismatch: ${key}/${row.year}/${field}`);
  }
  assert.deepEqual([...row.sourceIds].sort(),[...new Set([...total.sourceIds,...first.sourceIds])].sort(),`Subtraction source mismatch: ${key}`);
 }
}
for (const record of records.values()) validateFinancials(record);
for (const record of records.values()) {
 assert.ok(Array.isArray(record.glossary), `Missing glossary review: ${record.profile.key}`);
 const names = new Set();
 for (const term of record.glossary) {
  assert.ok(term.name?.trim() && term.desc?.trim(), `Empty glossary explanation: ${record.profile.key}`);
  assert.ok(!names.has(term.name), `Duplicate glossary term: ${record.profile.key}/${term.name}`);
  names.add(term.name);
 }
 const financials = record.financials.companyRef ? records.get(record.financials.companyRef).financials : record.financials;
 for (const [name] of requiredTerms(record, financials)) {
  assert.ok(hasExplanation(record.glossary, name), `Missing glossary explanation: ${record.profile.key}/${name}`);
 }
}
console.log(`Data validation passed: ${records.size} companies. Unverified existing records retain their unverified status.`);
