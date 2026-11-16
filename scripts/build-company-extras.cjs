// Builds data/extras/<issuer>.json: one issuer's slice of the history shards (data/history/*.json) and of
// data/financial-period-review.json. A company page then downloads ~1-3KB instead of a ~330KB shard and the
// ~700KB review file. The shards and the review file stay the source of truth; neither is written by the
// DART pipeline, so these slices only change when those files are edited by hand.
//   node scripts/build-company-extras.cjs          write data/extras/
//   node scripts/build-company-extras.cjs --check  fail if any slice is missing, stale or extra
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'data','extras');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const historyShard=key=>[...key].reduce((n,ch)=>(n+ch.charCodeAt(0))%16,0).toString(16);

function buildExtras(){
 const catalog=read('data/company-index.json'),review=read('data/financial-period-review.json'),shards=new Map(),out=new Map();
 const shard=key=>{const name=historyShard(key);if(!shards.has(name))shards.set(name,read(`data/history/${name}.json`));return shards.get(name);};
 for(const {key,file} of catalog.companies){
  // Preferred shares borrow their issuer's financials (companyRef), so only issuers get a slice.
  if(read(`data/companies/${file}`).financials.companyRef)continue;
  const history=shard(key),entry=history.companies[key],reviewed=review.companies[key];
  out.set(key,JSON.stringify({schemaVersion:1,key,
   history:entry?{asOf:history.asOf,companies:{[key]:entry}}:null,
   periodReview:reviewed?{asOf:review.asOf,companies:{[key]:reviewed}}:null})+'\n');
 }
 return out;
}

if(require.main===module){
 const extras=buildExtras(),check=process.argv.includes('--check');
 const existing=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')):[];
 const problems=[];
 if(!check)fs.mkdirSync(dir,{recursive:true});
 for(const [key,content] of extras){
  const file=path.join(dir,key+'.json');
  if(check){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==content)problems.push(key);}
  else fs.writeFileSync(file,content);
 }
 for(const name of existing)if(!extras.has(name.replace(/\.json$/,''))){if(check)problems.push(name+' (extra)');else fs.unlinkSync(path.join(dir,name));}
 if(check){
  if(problems.length){console.error(`data/extras is out of date (${problems.length}): ${problems.slice(0,5).join(', ')}… Run: node scripts/build-company-extras.cjs`);process.exitCode=1;}
  else console.log(`data/extras is up to date: ${extras.size} issuers.`);
 }else console.log(`Wrote data/extras: ${extras.size} issuers.`);
}
module.exports={buildExtras,historyShard};
