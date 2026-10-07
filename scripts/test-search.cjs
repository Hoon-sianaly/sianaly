const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/company-index.json'),'utf8'));
function setup(failed=false){
 const nodes={q:{value:'',listeners:{},addEventListener(k,fn){this.listeners[k]=fn;}},r:{innerHTML:'',className:'',addEventListener(){}}};
 const ctx=vm.createContext({console:{error(){}},location:{href:'index.html'},encodeURIComponent,loadCompanyCatalog:()=>failed?Promise.reject(Error('offline')):Promise.resolve(catalog),document:{getElementById:id=>nodes[id],addEventListener(){}}});
 vm.runInContext(script,ctx);return {ctx,nodes};
}
(async()=>{
 const {ctx,nodes}=setup();await new Promise(setImmediate);
 for(const e of catalog.companies){vm.runInContext(`render(${JSON.stringify(e.ticker)})`,ctx);assert.ok(nodes.r.innerHTML.includes(`data-key="${e.key}"`));assert.equal((nodes.r.innerHTML.match(/data-key=/g)||[]).length,1);}
 for(const [query,key] of [['lg energy solution','lges'],['현대 자동차','hyundai'],['네이버','naver'],['LS일렉트릭','lselectric'],['삼바','samsungbio'],['삼성전자우선주','samsungpref']]){vm.runInContext(`render(${JSON.stringify(query)})`,ctx);assert.ok(nodes.r.innerHTML.includes(`data-key="${key}"`),query);}
 nodes.q.listeners.keydown({key:'Enter',preventDefault(){}});assert.equal(ctx.location.href,'index.html');
 nodes.q.value='086790';nodes.q.listeners.keydown({key:'Enter',preventDefault(){}});assert.equal(ctx.location.href,'company.html?company=hana');
 vm.runInContext('render("등록되지않은기업")',ctx);assert.ok(nodes.r.innerHTML.includes('검색 결과가 없습니다'));
 const failure=setup(true);failure.nodes.q.value='삼성';await new Promise(setImmediate);assert.ok(failure.nodes.r.innerHTML.includes('불러오지 못했습니다'));
 console.log(`Search passed: ${catalog.companies.length} tickers, Korean/English aliases, whitespace, Enter, empty and unavailable catalog.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
