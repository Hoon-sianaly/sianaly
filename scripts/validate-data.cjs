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
 if (verified) assert.match(financials.verification.verifiedAt, /^\d{4}\.\d{2}\.\d{2}$/);
 for (const field of ["annual", "quarterly"]) {
  assert.ok(Array.isArray(financials[field]) && financials[field].length, `No ${field} rows: ${key}`);
  const periods = new Set();
  for (const row of financials[field]) {
   assert.ok(Number.isInteger(row.year) && row.year >= 1900 && row.year <= 2200);
   if (field === "quarterly") assert.ok(Number.isInteger(row.quarter) && row.quarter >= 1 && row.quarter <= 4);
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
