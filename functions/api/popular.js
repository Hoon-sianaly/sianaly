import catalog from '../../data/company-index.json' with {type:'json'};

const companies=new Set(catalog.companies.map(c=>c.key));
const ready=new WeakMap();
const DAY=86400000;
function json(value,status=200,cache='no-store'){
 return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':cache,'X-Content-Type-Options':'nosniff'}});
}
async function initialize(db){
 if(!ready.has(db)){
  const task=db.batch([
   db.prepare('CREATE TABLE IF NOT EXISTS popular_views (event_id TEXT PRIMARY KEY, company_key TEXT NOT NULL, viewed_at INTEGER NOT NULL)'),
   db.prepare('CREATE INDEX IF NOT EXISTS popular_views_time ON popular_views (viewed_at, company_key)')
  ]).catch(error=>{ready.delete(db);throw error;});
  ready.set(db,task);
 }
 await ready.get(db);
}
async function boundedJSON(request){
 const reader=request.body?.getReader();if(!reader)throw Error('Empty body');
 let size=0;const parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256){await reader.cancel();throw Error('Body too large');}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export async function onRequest(context){
 const {request,env}=context,url=new URL(request.url),db=env.POPULAR_DB;
 if(!['GET','POST'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, POST'}});
 if(request.method==='POST'){
  if(request.headers.get('Origin')!==url.origin)return json({status:'forbidden'},403);
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({status:'invalid'},415);
  if(/bot|crawler|spider|slurp|bingpreview/i.test(request.headers.get('User-Agent')||''))return json({status:'ignored'},202);
  let body;try{body=await boundedJSON(request);}catch{return json({status:'invalid'},400);}
  if(!body||Object.keys(body).some(k=>!['company','eventId'].includes(k))||!companies.has(body.company)||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.eventId||''))return json({status:'invalid'},400);
  if(!db)return json({status:'unavailable'},503);
  try{
   await initialize(db);
   await db.prepare('INSERT OR IGNORE INTO popular_views (event_id, company_key, viewed_at) VALUES (?, ?, ?)').bind(body.eventId,body.company,Date.now()).run();
   return json({status:'recorded'});
  }catch{return json({status:'unavailable'},503);}
 }
 if(!db)return json({status:'unavailable',companies:[]},503);
 const cache=globalThis.caches?.default;
 // Ignore query strings so arbitrary cache-busting URLs cannot multiply ranking scans.
 const cacheKey=new Request(url.origin+'/api/popular',{method:'GET'});
 if(cache){try{const cached=await cache.match(cacheKey);if(cached)return cached;}catch{}}
 try{
  await initialize(db);const now=Date.now();
  const result=await db.batch([
   db.prepare('DELETE FROM popular_views WHERE viewed_at < ?').bind(now-2*DAY),
   db.prepare('SELECT company_key, COUNT(*) AS views FROM popular_views WHERE viewed_at > ? AND viewed_at <= ? GROUP BY company_key ORDER BY views DESC, company_key ASC LIMIT 5').bind(now-DAY,now)
  ]);
  const ranking=(result[1].results||[]).filter(r=>companies.has(r.company_key)&&Number.isSafeInteger(r.views)&&r.views>0).map(r=>({key:r.company_key,views:r.views}));
  const response=json({status:'ready',windowHours:24,asOf:new Date(now).toISOString(),companies:ranking},200,'public, max-age=300');
  if(cache){const store=cache.put(cacheKey,response.clone()).catch(()=>{});if(context.waitUntil)context.waitUntil(store);else await store;}
  return response;
 }catch{return json({status:'unavailable',companies:[]},503);}
}
