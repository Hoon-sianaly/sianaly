// Runs the comparison table for every company against a few very different partners
// (ordinary manufacturer, bank, foreign-currency issuer, company awaiting its first report).
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const context=vm.createContext({console,URLSearchParams,fetch:async url=>({ok:true,json:async()=>read(url.split('?')[0])})});
for(const file of ['company-reading.js','company-data.js','company-industries.js','compare.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const load=vm.runInContext('loadCompanyData',context),{buildComparison,metricChange,esc}=vm.runInContext('COMPARE_PAGE',context);

assert.equal(metricChange(120,100,true),'+20.0%');
assert.equal(metricChange(-5,10,true),'적자 전환');
assert.equal(metricChange(5,-10,true),'흑자 전환');
assert.equal(metricChange(-5,-10,true),'적자 축소');
assert.equal(metricChange(5,0,false),null);
assert.equal(metricChange(-5,-10,false),'+50.0%','non-profit metrics use plain growth');

(async()=>{
 const catalog=read('data/company-index.json'),market=Object.fromEntries(catalog.companies.map(c=>[c.key,c.market]));
 const withMarket=c=>({...c,market:market[c.key]});
 const anchors=['samsung','kb','prestigebiopharma','hanwhamachinery'];
 const partners=await Promise.all(anchors.map(load));
 partners.forEach((p,i)=>assert.ok(p,anchors[i]+' must load'));
 let pairs=0;
 for(const {key} of catalog.companies){
  const company=await load(key);
  for(const partner of partners){
   for(const [a,b] of [[company,partner],[partner,company]]){
    const html=buildComparison(withMarket(a),withMarket(b));
    assert.ok(html.includes(esc(a.name))&&html.includes(esc(b.name)),`${a.key} vs ${b.key}: names`);
    assert.doesNotMatch(html,/undefined|NaN|null|\[object/,`${a.key} vs ${b.key}: no broken values`);
    pairs++;
   }
  }
 }
 const bank=buildComparison(withMarket(partners[0]),withMarket(partners[1]));
 assert.match(bank,/지표의 이름과 구성이 다릅니다/,'different metrics are explained');
 assert.match(buildComparison(withMarket(partners[0]),withMarket(partners[2])),/통화가 다릅니다/,'different currencies are explained');
 assert.match(buildComparison(withMarket(partners[0]),withMarket(partners[3])),/첫 정기 실적 공시 대기|공시/,'awaiting company shows its reason');
 const peers=buildComparison(withMarket(partners[0]),withMarket(await load('hynix')));
 assert.match(peers,/cmp-bar/,'same metric and currency draw bars');
 // KB reports 총영업이익 instead of 매출, so only the shared 영업이익 rows get bars.
 const barCount=html=>(html.match(/cmp-bar/g)||[]).length;
 assert.ok(barCount(bank)<barCount(peers),'a metric the two companies do not share never draws bars');
 assert.doesNotMatch(buildComparison(withMarket(partners[0]),withMarket(partners[2])),/cmp-bar/,'different currencies never draw bars');
 console.log(`Compare passed: ${pairs} pairs, metric/currency/basis notes, awaiting reports, bars only for like-for-like figures.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
