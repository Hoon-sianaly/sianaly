// Builds data/company-trends.json: each company's latest quarter against the same quarter a year
// earlier, exactly as the company page's "최근 분기" highlight computes it. The home list reads this
// one small file instead of every company's history shard.
//   node scripts/build-company-trends.cjs          write the file
//   node scripts/build-company-trends.cjs --check  fail if the file is out of date
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),output='data/company-trends.json';

// Same wording as metricChange() in company.html.
function metricChange(current,previous,profit){
 if(!Number.isFinite(current)||!Number.isFinite(previous))return null;
 if(profit){
  if(previous<0&&current>0)return '흑자 전환';
  if(previous>0&&current<0)return '적자 전환';
  if(previous<0&&current<0)return current>previous?'적자 축소':current<previous?'적자 확대':'적자 동일';
  if(previous<0&&current===0)return '손익분기';
 }
 if(previous===0)return null;
 const rounded=Math.round((current-previous)/Math.abs(previous)*100*10)/10;
 return `${rounded>0?'+':''}${rounded.toFixed(1)}%`;
}

function quarterTrend(financials){
 if(financials.availability?.status==='awaiting-first-report')return null;
 const rows=[...financials.quarterly].sort((a,b)=>a.year-b.year||a.quarter-b.quarter),latest=rows.at(-1);
 if(!latest||latest.comparableToPrevious===false)return null;
 const prior=rows.find(row=>row.year===latest.year-1&&row.quarter===latest.quarter);
 if(!prior)return null;
 const label=financials.metrics?.op?.label||'영업이익',text=metricChange(latest.op,prior.op,/이익|손익/.test(label));
 if(!text)return null;
 return {text,label,year:latest.year,quarter:latest.quarter,...(latest.disclosureStatus==='preliminary'?{preliminary:true}:{})};
}

async function buildTrends(){
 const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
 const context=vm.createContext({console,URLSearchParams,fetch:async url=>{const file=url.split('?')[0];return {ok:true,json:async()=>read(file)};}});
 vm.runInContext(fs.readFileSync(path.join(root,'company-data.js'),'utf8'),context);
 const load=vm.runInContext('async key=>{let record=await loadCompanyRecord(key);const canonical=record.financials;record=await addFinancialHistory(record);record=await addFinancialPeriodReview(record,canonical);return record;}',context);
 const catalog=read('data/company-index.json'),companies={};
 for(const {key} of catalog.companies){
  if(key.includes('pref'))continue;
  const trend=quarterTrend((await load(key)).financials);
  if(trend)companies[key]=trend;
 }
 return JSON.stringify({schemaVersion:1,basis:'최근 분기 영업이익(또는 기업별 이익 지표)의 전년 같은 분기 대비 증감',companies})+'\n';
}

if(require.main===module){
 buildTrends().then(content=>{
  const file=path.join(root,output);
  if(process.argv.includes('--check')){
   if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==content){console.error(`${output} is out of date. Run: node scripts/build-company-trends.cjs`);process.exitCode=1;return;}
   console.log(`${output} is up to date.`);return;
  }
  fs.writeFileSync(file,content);
  console.log(`Wrote ${output}: ${Object.keys(JSON.parse(content).companies).length} companies.`);
 }).catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={buildTrends,quarterTrend,metricChange,output};
