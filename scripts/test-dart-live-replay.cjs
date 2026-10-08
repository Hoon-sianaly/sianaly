// Offline replay of today's real API responses; requires ignored audit cache.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const core=require('./dart-core.cjs'),{applyRows}=require('./dart-portfolio.cjs'),{periods}=require('./update-dart-samsung.cjs');
const registry=require('../data/dart-companies.json'),catalog=require('../data/company-index.json');
assert.equal(registry.companies.length,catalog.companies.length);assert.equal(new Set(registry.companies.map(c=>c.key)).size,catalog.companies.length);
let checked=0,reports=0;
for(const c of registry.companies){
 const record=require('../data/companies/'+c.key+'.json');
 assert.equal(record.profile.ticker,c.ticker);assert.ok(catalog.companies.some(e=>e.key===c.key));
 if(c.companyRef){assert.equal(record.financials.companyRef,c.companyRef);assert.ok(registry.companies.some(e=>e.key===c.companyRef&&e.corpCode));continue;}
 assert.match(c.corpCode,/^\d{8}$/);assert.ok(['CFS','OFS'].includes(c.fsDiv));
 if(c.mode!=='automatic')continue;
 const rows=[];
 for(const p of c.validation.periods.filter(p=>p.status==='validated')){
  if(p.year===2025&&p.report!=='11011'&&!record.financials.quarterly.some(r=>r.year===p.year&&r.quarter===({11013:1,11012:2,11014:3}[p.report])))continue;
  if(c.blockedPeriods?.some(b=>b.year===p.year&&b.report===p.report))continue;
  const payload=JSON.parse(fs.readFileSync(path.join(core.out,'cache',`${c.corpCode}-${p.year}-${p.report}-${c.fsDiv}.json`),'utf8'));
  if(payload.status==='013')continue;
  rows.push(core.normalize(payload,c,p));reports++;
 }
 assert.equal(applyRows(record,rows,c,'2026-10-08').changes.length,0,c.key+' duplicate changes');checked++;
}
assert.equal(checked,registry.companies.filter(c=>c.mode==='automatic').length);
console.log(`PASS: all ${catalog.companies.length} identities and shared stocks; ${checked} automatic issuers, ${reports} real statements replayed without duplicate changes.`);
