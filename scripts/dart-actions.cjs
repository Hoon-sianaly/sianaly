'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const repo='Hoon-sianaly/sianaly',branch='codex/dart-state',out=path.resolve('dart-output');
async function api(route,method='GET',body){
 const r=await fetch(`https://api.github.com/repos/${repo}/${route}`,{method,headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','User-Agent':'SIANALY-DART','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
 if(r.status===404&&method==='GET')return null;
 if(!r.ok)throw Error(`GitHub ${method} ${route.split('/')[0]} failed (${r.status})`);
 return r.json();
}
function run(script,args=[]){execFileSync(process.execPath,[`scripts/${script}.cjs`,...args],{stdio:'inherit'});}
function validateFiles(candidate,registry){
 if(candidate.status!=='validated'||candidate.strategy!=='new-disclosures')throw Error('Unvalidated candidate');
 const allowed=new Set(registry.companies.filter(c=>c.mode==='automatic').map(c=>`data/companies/${c.key}.json`));
 for(const f of candidate.files){if(!allowed.has(f.path))throw Error('Unexpected company file');JSON.parse(f.content);}
 if(new Set(candidate.files.map(f=>f.path)).size!==candidate.files.length)throw Error('Duplicate candidate');
}
async function live(files){
 for(let attempt=0;attempt<20;attempt++){
  const ok=await Promise.all(files.map(async f=>{try{const r=await fetch(`https://dev.sianaly.com/${f.path}?dart=${Date.now()}`,{signal:AbortSignal.timeout(20000)});return r.ok&&JSON.stringify((await r.json()).financials)===JSON.stringify(JSON.parse(f.content).financials);}catch{return false;}}));
  if(ok.every(Boolean))return;
  await new Promise(r=>setTimeout(r,15000));
 }
 throw Error('Development deployment not verified; pending jobs retained');
}
async function main(){
 if(process.env.GITHUB_REPOSITORY!==repo||!process.env.GITHUB_TOKEN||!process.env.OPENDART_API_KEY)throw Error('Repository and Actions secrets required');
 fs.mkdirSync(out,{recursive:true});
 let stateRef=await api(`git/ref/heads/${branch}`),envelope={};
 if(stateRef){const saved=await api(`contents/state.json?ref=${encodeURIComponent(branch)}`);if(!saved)throw Error('Missing durable state');envelope=JSON.parse(Buffer.from(saved.content,'base64').toString());}
 const persist=async()=>{
  const stateFile=path.join(out,'disclosure-state.json');if(fs.existsSync(stateFile))envelope.disclosures=JSON.parse(fs.readFileSync(stateFile));
  const tree=await api('git/trees','POST',{tree:[{path:'state.json',mode:'100644',type:'blob',content:JSON.stringify(envelope,null,2)+'\n'}]});
  const commit=await api('git/commits','POST',{message:'Persist DART disclosure cursor and pending jobs',tree:tree.sha,parents:stateRef?[stateRef.object.sha]:[]});
  if(stateRef)await api(`git/refs/heads/${branch}`,'PATCH',{sha:commit.sha,force:false});else await api('git/refs','POST',{ref:`refs/heads/${branch}`,sha:commit.sha});
  stateRef={object:{sha:commit.sha}};
 };
 if(envelope.disclosures)fs.writeFileSync(path.join(out,'disclosure-state.json'),JSON.stringify(envelope.disclosures));
 // Recover deployment verification before allowing a new collection to replace its candidate.
 if(envelope.publication){
  const p=envelope.publication;fs.writeFileSync(path.join(out,'portfolio-update.json'),JSON.stringify(p.candidate));
  let head=await api('git/ref/heads/main');
  if(head.object.sha===p.candidate.baseSha){await api('git/refs/heads/main','PATCH',{sha:p.commit,force:false});head={object:{sha:p.commit}};}
  run('dart-portfolio',['--mode','acknowledge','--base-sha',head.object.sha]);await live(p.candidate.files);delete envelope.publication;await persist();
 }
 try{
  const head=await api('git/ref/heads/main'),base=head.object.sha;
  if(base!==process.env.GITHUB_SHA)throw Error('Main changed since checkout; rerun on latest main');
  run('dart-portfolio',['--mode','update','--base-sha',base]);
  const candidate=JSON.parse(fs.readFileSync(path.join(out,'portfolio-update.json'))),registry=JSON.parse(fs.readFileSync('data/dart-companies.json'));
  validateFiles(candidate,registry);if(candidate.baseSha!==base)throw Error('Candidate baseline mismatch');
  await persist();
  if(candidate.files.length){
   for(const f of candidate.files)fs.writeFileSync(f.path,f.content);
   for(const script of ['validate-data','test-company-data','test-insights','test-search','test-financial-format'])run(script);
   const commitBase=await api(`git/commits/${base}`),tree=await api('git/trees','POST',{base_tree:commitBase.tree.sha,tree:candidate.files.map(f=>({...f,mode:'100644',type:'blob'}))});
   const commit=await api('git/commits','POST',{message:'Update verified financials from new DART disclosures',tree:tree.sha,parents:[base]});
   const current=await api('git/ref/heads/main');if(current.object.sha!==base)throw Error('Main changed before publication');
   envelope.publication={commit:commit.sha,candidate};await persist();
   await api('git/refs/heads/main','PATCH',{sha:commit.sha,force:false});
   await live(candidate.files);run('dart-portfolio',['--mode','acknowledge','--base-sha',commit.sha]);delete envelope.publication;await persist();
  }
  const errors=candidate.results.filter(r=>r.status==='error');
  const summary=`DART new-disclosure update\n\nChanged companies: ${candidate.files.length}\nFinancial API requests: ${candidate.stats.financialRequests}\nPending jobs: ${candidate.stats.pendingJobs}\nReview items: ${candidate.stats.reviewItems}\nErrors: ${errors.length}\n`;
  console.log(summary);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
  if(errors.length)throw Error('Some issuers require attention; their pending jobs were retained');
 }catch(e){await persist();throw e;}
}
module.exports={validateFiles};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
