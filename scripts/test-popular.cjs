'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{pathToFileURL}=require('node:url'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..');
class D1 {
 constructor(){this.sqlite=new DatabaseSync(':memory:');this.queries=0;}
 prepare(sql){const db=this;return {values:[],bind(...values){this.values=values;return this;},async run(){db.queries++;const result=db.sqlite.prepare(sql).run(...this.values);return {success:true,meta:{changes:Number(result.changes)}};},sql};}
 async batch(statements){this.queries+=statements.length;this.sqlite.exec('BEGIN');try{const results=statements.map(s=>{const p=this.sqlite.prepare(s.sql);return /^SELECT/i.test(s.sql)?{success:true,results:p.all(...s.values)}:{success:true,meta:{changes:Number(p.run(...s.values).changes)}};});this.sqlite.exec('COMMIT');return results;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
}
async function main(){
 const {createPopularHandler}=await import(pathToFileURL(root+'/scripts/popular-handler.mjs'));
 const onRequest=createPopularHandler(require('../data/company-index.json').companies.map(c=>c.key));
 const db=new D1(),env={POPULAR_DB:db},url='https://dev.sianaly.com/api/popular';
 const call=(method='GET',body,options={})=>onRequest({env:options.env||env,request:new Request(url+(options.query||''),{method,headers:{Origin:options.origin||'https://dev.sianaly.com','Content-Type':options.type||'application/json','User-Agent':options.agent||'Browser'},...(body!==undefined?{body:JSON.stringify(body)}:{})}),waitUntil:promise=>promise});
 assert.equal((await call('GET',undefined,{env:{}})).status,503);
 assert.equal((await call('PUT')).status,405);
 assert.equal((await call('POST',{company:'samsung',eventId:randomUUID()},{origin:'https://other.example'})).status,403);
 assert.equal((await call('POST',{company:'unknown',eventId:randomUUID()})).status,400);
 assert.equal((await call('POST',{company:'samsung',eventId:randomUUID(),email:'must not be collected'})).status,400);
 assert.equal((await call('POST',{company:'samsung',eventId:'invalid'})).status,400);
 assert.equal((await call('POST',{company:'samsung',eventId:randomUUID()},{type:'text/plain'})).status,415);
 assert.equal((await call('POST',{company:'samsung',eventId:randomUUID(),extra:'x'.repeat(1000)})).status,400);
 assert.equal((await call('POST',{company:'samsung',eventId:randomUUID()},{agent:'Googlebot'})).status,202);
 assert.equal((await (await call()).json()).companies.length,0);
 const duplicate={company:'samsung',eventId:randomUUID()};assert.equal((await call('POST',duplicate)).status,200);await call('POST',duplicate);
 for(let i=0;i<2;i++)await call('POST',{company:'hynix',eventId:randomUUID()});
 const now=Date.now();db.sqlite.prepare('INSERT INTO popular_views VALUES (?,?,?)').run(randomUUID(),'samsung',now-86400001);
 db.sqlite.prepare('INSERT INTO popular_views VALUES (?,?,?)').run(randomUUID(),'samsung',now-2*86400000-10000);
 const ranking=await (await call()).json();assert.equal(ranking.windowHours,24);assert.deepEqual(ranking.companies,[{key:'hynix',views:2},{key:'samsung',views:1}]);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM popular_views WHERE viewed_at < ?').get(Date.now()-2*86400000).n,0);
 const fields=db.sqlite.prepare('PRAGMA table_info(popular_views)').all().map(r=>r.name);assert.deepEqual(fields,['event_id','company_key','viewed_at']);
 const cache=new Map();globalThis.caches={default:{match:async key=>cache.get(key.url)?.clone(),put:async(key,response)=>{cache.set(key.url,response.clone());}}};
 const cached=await call();await cached.text();const requests=db.queries;await call('GET',undefined,{query:'?bust=1'});assert.equal(db.queries,requests,'Query strings must not bypass the shared ranking cache');assert.match(cached.headers.get('Cache-Control'),/max-age=300/);delete globalThis.caches;
 // The client retries the same event ID and suppresses refreshes for 30 minutes.
 const storage=new Map(),sent=[];let delayed;
 const context=vm.createContext({crypto:{randomUUID},Date,AbortSignal,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{visibilityState:'visible'},setTimeout:fn=>{delayed=fn;},fetch:async(path,options)=>{sent.push(JSON.parse(options.body));return {ok:true,status:200};}});
 vm.runInContext(fs.readFileSync(root+'/company-popularity.js','utf8'),context);context.scheduleCompanyView('samsung');await delayed();await new Promise(r=>setImmediate(r));context.scheduleCompanyView('samsung');await delayed();await new Promise(r=>setImmediate(r));assert.equal(sent.length,1);
 storage.clear();let attempts=0;context.fetch=async(path,options)=>{sent.push(JSON.parse(options.body));return {ok:++attempts>1,status:attempts===1?503:200};};context.scheduleCompanyView('hynix');await delayed();await new Promise(r=>setImmediate(r));assert.equal(sent.at(-1).eventId,sent.at(-2).eventId);assert.equal(sent.at(-1).company,'hynix');
 assert(!fs.readFileSync(root+'/home-popular.js','utf8').includes('삼성전자'),'The ranking must not contain sample companies');
 class Element{constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.attributes={};}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this.attributes[k]=v;}}
 const list=new Element('ol'),status=new Element('p'),area={querySelector:selector=>selector==='.popular-list'?list:status};let timer,rankingResponse={status:'ready',windowHours:24,companies:[{key:'samsung',views:3},{key:'unknown',views:999},{key:'hynix',views:2},{key:'samsung',views:1}]};
 const ui=vm.createContext({document:{visibilityState:'visible',getElementById:()=>area,createElement:tag=>new Element(tag),addEventListener(){}},loadCompanyCatalog:async()=>({companies:[{key:'samsung',name:'삼성전자'},{key:'hynix',name:'SK하이닉스'}]}),fetch:async()=>({ok:true,json:async()=>rankingResponse}),AbortSignal,encodeURIComponent,setInterval:fn=>{timer=fn;}});
 vm.runInContext(fs.readFileSync(root+'/home-popular.js','utf8'),ui);await new Promise(r=>setImmediate(r));assert.equal(list.children.length,2);assert.equal(list.children[0].children[0].href,'company.html?company=samsung');assert.equal(list.children[0].children[0].children[1].textContent,'삼성전자');assert.equal(status.hidden,true);
 rankingResponse={status:'ready',windowHours:24,companies:[]};await timer();assert.equal(list.children.length,0);assert.equal(status.hidden,false);assert.match(status.textContent,/조회수가 쌓이면/);
 ui.fetch=async()=>({ok:false});await timer();assert.match(status.textContent,/집계 준비/);
 console.log('PASS popular: real SQLite aggregation, exact 24-hour cutoff, 48-hour cleanup, duplicate IDs, cached rankings, same-origin/valid-company gates, no personal fields, client cooldown and retry deduplication.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
