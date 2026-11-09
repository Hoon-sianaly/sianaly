const categories=new Set(['financial','description','source','display','other']);
const statuses=new Set(['pending','reviewing','resolved','dismissed']);
export async function handleReports({db,url,method,user,companyKeys,readBody,respond,allowAttempt,audit=async()=>{},now=Date.now()}){
 if(!db)return respond({code:'reports_unavailable'},503);
 if(method!=='POST'&&user?.app_metadata?.sianaly_role!=='admin')return respond({code:'forbidden'},403);
 let input;
 if(method!=='GET'){
  try{input=await readBody();}catch{return respond({code:'invalid_report'},400);}
 }
 if(method==='POST'){
  if(Object.keys(input).some(k=>!['id','company','category','body'].includes(k))||typeof input.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)||!companyKeys.has(input.company)||!categories.has(input.category)||typeof input.body!=='string'||input.body.trim().length<5||input.body.trim().length>2000)return respond({code:'invalid_report'},400);
 }else if(method==='PATCH'){
  if(Object.keys(input).some(k=>!['id','status'].includes(k))||!Number.isSafeInteger(input.id)||input.id<1||!statuses.has(input.status))return respond({code:'invalid_report'},400);
 }else if(method!=='GET')return respond({code:'method_not_allowed'},405);
 const status=url.searchParams.get('status')||'pending',before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);
 if(method==='GET'&&(!statuses.has(status)||!Number.isSafeInteger(before)||before<1))return respond({code:'invalid_report'},400);
 await db.batch([
  db.prepare("CREATE TABLE IF NOT EXISTS company_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT UNIQUE NOT NULL, company_key TEXT NOT NULL, category TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
  db.prepare('CREATE INDEX IF NOT EXISTS company_reports_status_id ON company_reports (status, id)')
 ]);
 // The owner chose one month (30 days) after resolution.
 // Pending, reviewing and deferred (dismissed in storage) reports stay available.
 await db.prepare("DELETE FROM company_reports WHERE status = 'resolved' AND updated_at <= ?").bind(now-30*86400000).run();
 if(method==='POST'){
  if(!await allowAttempt())return respond({code:'too_many_attempts'},429);
  await db.prepare('INSERT OR IGNORE INTO company_reports (request_id, company_key, category, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(input.id,input.company,input.category,input.body.trim(),now,now).run();
  return respond({ok:true},201);
 }
 if(method==='PATCH'){
  await audit('reports.status',['report:'+input.id,'status:'+input.status]);
  const result=await db.prepare('UPDATE company_reports SET status = ?, updated_at = ? WHERE id = ?').bind(input.status,now,input.id).run();
  return result.meta.changes?respond({ok:true}):respond({code:'report_not_found'},404);
 }
 const {results}=await db.prepare('SELECT id, company_key, category, body, status, created_at, updated_at FROM company_reports WHERE status = ? AND id < ? ORDER BY id DESC LIMIT 21').bind(status,before).all();
 await audit('reports.read',['status:'+status,...results.slice(0,20).map(row=>'report:'+row.id)]);
 return respond({reports:results.slice(0,20),next:results.length>20?results[19].id:null});
}
