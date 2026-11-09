import {privateDecrypt,constants,createDecipheriv,createHash,createHmac,timingSafeEqual} from 'node:crypto';
export function snapshotRows(snapshot,name){
 const table=snapshot.tableDefinitions.find(t=>t.name===name);
 if(!table)return [];
 return snapshot.tables[name].map(cells=>Object.fromEntries(table.columns.map((column,i)=>[column,cells[i][0]==='integer'?Number(cells[i][1]):cells[i][1]])));
}
export function verifyPrivateSnapshot(snapshot,privateKey){
 const keys=new Map();
 for(const row of snapshotRows(snapshot,'operator_audit_keys')){
  const event=openRecoveryEvent(row,privateKey),key=Buffer.from(event.data.key,'base64');
  if(event.kind!=='audit-key'||createHash('sha256').update(key).digest('hex').slice(0,24)!==row.key_id)throw Error('Audit key mismatch');
  keys.set(row.key_id,key);
 }
 const logs=snapshotRows(snapshot,'operator_access_audit');
 for(const row of logs){
  const key=keys.get(row.key_id),data=JSON.parse(row.payload);
  if(!key||data.eventId!==row.event_id||data.at!==row.created_at||!/^[a-f0-9]{64}$/.test(row.signature))throw Error('Audit record mismatch');
  const actual=createHmac('sha256',key).update(row.payload).digest();
  if(!timingSafeEqual(actual,Buffer.from(row.signature,'hex')))throw Error('Audit signature mismatch');
 }
 for(const key of keys.values())key.fill(0);
 const receipts=snapshotRows(snapshot,'privacy_recovery_journal');
 for(const row of receipts)openRecoveryEvent(row,privateKey);
 return {operatorSignaturesVerified:logs.length,recoveryEnvelopesVerified:receipts.length};
}
export function mergeFreshPrivacySnapshot(sqlite,snapshot,now=Date.now()){
 const tables={operator_audit_keys:['key_id','event_id','created_at','envelope'],operator_access_audit:['event_id','created_at','payload','key_id','signature'],privacy_recovery_journal:['event_id','created_at','envelope']};
 const allowed=new Set(Object.keys(tables));
 for(const type of ['table','index','trigger'])for(const entry of snapshot.schema.filter(s=>s.type===type&&allowed.has(s.tbl_name))){
  sqlite.exec(entry.sql.replace(/^CREATE\s+(TABLE|INDEX|TRIGGER)\s+(?!IF\s+NOT\s+EXISTS)/i,'CREATE $1 IF NOT EXISTS '));
 }
 sqlite.exec('BEGIN');
 try{
  for(const [table,columns] of Object.entries(tables))for(const row of snapshotRows(snapshot,table).sort((a,b)=>(a.seq||0)-(b.seq||0))){
   const unique=table==='operator_audit_keys'?'key_id':'event_id';
   const existing=sqlite.prepare('SELECT * FROM '+table+' WHERE '+unique+'=?').get(row[unique]);
   if(existing){
    if(table!=='operator_audit_keys'&&columns.some(c=>existing[c]!==row[c]))throw Error('Conflicting independent privacy record');
    continue;
   }
   sqlite.prepare('INSERT INTO '+table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...columns.map(c=>row[c]));
  }
  const cutoff=Math.floor(now/1000)*1000;
  const cleanup=[['company_reports',"status='resolved' AND updated_at <= ?",cutoff-30*86400000],['board_view_visitors','seen_at < ?',cutoff-86400000],['member_email_attempts','expires_at < ?',cutoff],['popular_views','viewed_at < ?',cutoff-48*3600000],['privacy_recovery_journal','created_at < ?',cutoff-45*86400000],['operator_access_audit','created_at < ?',cutoff-366*86400000]];
  for(const [table,where,value]of cleanup)if(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))sqlite.prepare('DELETE FROM '+table+' WHERE '+where).run(value);
  sqlite.exec('COMMIT');
 }catch(e){sqlite.exec('ROLLBACK');throw e;}
}
export function openRecoveryEvent(row,privateKey){
 const envelope=JSON.parse(row.envelope),header=JSON.parse(envelope.header);
 if(header.version!==1||header.eventId!==row.event_id||header.at!==row.created_at)throw Error('Recovery envelope metadata mismatch');
 const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.key,'base64'));
 try{
  const ciphertext=Buffer.from(envelope.ciphertext,'base64'),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
  decipher.setAAD(Buffer.from(envelope.header));decipher.setAuthTag(ciphertext.subarray(-16));
  const event=JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]).toString('utf8'));
  if(event.eventId!==header.eventId||event.at!==header.at)throw Error('Recovery event mismatch');
  return event;
 }finally{key.fill(0);}
}
const id=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw Error('Invalid recovery member');return value;};
const number=value=>{if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid recovery identifier');return value;};
// Call only against isolated restored databases. A pending withdrawal blocks release.
export async function replayRecoveryEvents({pg,sqlite,events,backupStartedAt}){
 number(backupStartedAt);const pending=new Set(),done=new Set();let applied=0;
 const ordered=events.filter(e=>e.at>=backupStartedAt);
 for(const event of ordered){
  if(!Number.isSafeInteger(event.at)||!event.data)throw Error('Invalid recovery event');
  const d=event.data;
  if(event.kind==='member-delete-request'){pending.add(id(d.userId));continue;}
  if(event.kind==='member-deleted'){
   const user=id(d.userId);done.add(user);
   await pg.query('DELETE FROM auth.users WHERE id=$1',[user]);
   const hash=(await import('node:crypto')).createHash('sha256').update(user).digest('hex');
   const viewHash=(await import('node:crypto')).createHash('sha256').update('member:'+hash).digest('hex');
   sqlite.prepare("UPDATE board_posts SET owner='',author='탈퇴한 회원' WHERE owner=?").run(user);
   sqlite.prepare("UPDATE board_comments SET owner='',author='탈퇴한 회원' WHERE owner=?").run(user);
   sqlite.prepare('DELETE FROM board_recommendations WHERE owner_hash=?').run(hash);
   sqlite.prepare('DELETE FROM board_view_visitors WHERE visitor_hash=?').run(viewHash);
   sqlite.prepare('DELETE FROM member_legal_acceptances WHERE owner_hash=?').run(hash);
   sqlite.prepare('INSERT OR IGNORE INTO board_departed_members(owner_hash) VALUES(?)').run(hash);
  }else if(event.kind==='post-delete'){
   sqlite.prepare('DELETE FROM board_posts WHERE id=? AND created_at=?').run(number(d.id),number(d.createdAt));
  }else if(event.kind==='post-update'){
   if(typeof d.title!=='string'||typeof d.body!=='string'||d.title.length>100||d.body.length>4000)throw Error('Invalid correction');
   sqlite.prepare('UPDATE board_posts SET title=?,body=? WHERE id=? AND created_at=?').run(d.title,d.body,number(d.id),number(d.createdAt));
  }else if(event.kind==='report-delete'){
   sqlite.prepare('DELETE FROM company_reports WHERE id=? AND created_at=?').run(number(d.id),number(d.createdAt));
  }else if(event.kind==='report-redact'){
   if(typeof d.body!=='string'||d.body.length>2000)throw Error('Invalid report correction');
   sqlite.prepare('UPDATE company_reports SET body=? WHERE id=? AND created_at=?').run(d.body,number(d.id),number(d.createdAt));
  }else if(event.kind==='favorite-delete'){
   if(typeof d.company!=='string'||!/^[a-z0-9_:-]{1,100}$/i.test(d.company))throw Error('Invalid company');
   await pg.query('DELETE FROM public.sianaly_favorites WHERE user_id=$1 AND company_key=$2',[id(d.userId),d.company]);
  }else if(event.kind==='nickname-update'){
   if(typeof d.nickname!=='string'||Array.from(d.nickname).length<2||Array.from(d.nickname).length>20||!/^[\p{L}\p{N} _-]+$/u.test(d.nickname))throw Error('Invalid nickname');
   await pg.query("UPDATE auth.users SET raw_user_meta_data=jsonb_set(coalesce(raw_user_meta_data,'{}'::jsonb),'{sianaly_nickname}',$2::jsonb) WHERE id=$1",[id(d.userId),JSON.stringify(d.nickname)]);
  }else if(event.kind==='profile-minimize'){
   const user=id(d.userId);
   await pg.query("UPDATE auth.users SET raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)-array['name','full_name','picture','avatar_url'] WHERE id=$1",[user]);
   await pg.query("UPDATE auth.identities SET identity_data=coalesce(identity_data,'{}'::jsonb)-array['name','full_name','picture','avatar_url'] WHERE user_id=$1",[user]);
  }else throw Error('Unsupported recovery event');
  applied++;
 }
 const unresolved=[...pending].filter(user=>!done.has(user));
 return {applied,pendingWithdrawalCount:unresolved.length,releaseAllowed:unresolved.length===0};
}
