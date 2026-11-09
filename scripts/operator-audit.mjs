// Operator records only. Never log request bodies, credentials, email or cookies.
import {sealRecoveryEvent} from './recovery-journal.mjs';
export const AUDIT_RETENTION_DAYS=366;
const actions=new Set(['board.read','board.list','board.delete','board.hide','board.restore','reports.read','reports.status']);
const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
export async function initializeOperatorAudit(db){
 if(!db)throw Error('Operator audit storage unavailable');
 await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS operator_access_audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL, key_id TEXT NOT NULL, signature TEXT NOT NULL)'),
  db.prepare('CREATE INDEX IF NOT EXISTS operator_access_audit_time ON operator_access_audit(created_at)'),
  db.prepare('CREATE TABLE IF NOT EXISTS operator_audit_keys (key_id TEXT PRIMARY KEY,event_id TEXT NOT NULL,created_at INTEGER NOT NULL,envelope TEXT NOT NULL)'),
  db.prepare("CREATE TRIGGER IF NOT EXISTS operator_access_audit_no_update BEFORE UPDATE ON operator_access_audit BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END"),
  db.prepare("CREATE TRIGGER IF NOT EXISTS operator_access_audit_no_early_delete BEFORE DELETE ON operator_access_audit WHEN OLD.created_at > CAST(strftime('%s','now') AS INTEGER)*1000-31622400000 BEGIN SELECT RAISE(ABORT,'Audit retention has not expired'); END")
 ]);
}
export async function writeOperatorAudit({db,secret,request,user,action,targets=[],now=Date.now()}){
 if(user?.app_metadata?.sianaly_role!=='admin')return;
 if(!actions.has(action)||typeof user.id!=='string'||user.id.length>128||typeof secret!=='string'||!secret||!Number.isSafeInteger(now))throw Error('Invalid audit context');
 if(!Array.isArray(targets)||targets.length>100||targets.some(t=>typeof t!=='string'||!/^[a-z0-9:_-]{1,150}$/i.test(t)))throw Error('Invalid audit targets');
 const rawIP=request.headers.get('CF-Connecting-IP')||'';
 const ip=/^[a-f0-9:.]{2,45}$/i.test(rawIP)?rawIP:'unavailable';
 const eventId=crypto.randomUUID();
 const payload=JSON.stringify({version:1,eventId,at:now,actor:user.id,ip,action,phase:action.endsWith('.read')||action.endsWith('.list')?'access':'attempt',targets:[...new Set(targets)],source:'site-admin'});
 const keyBytes=await crypto.subtle.digest('SHA-256',enc.encode('sianaly-operator-audit-v1:'+secret));
 const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=hex(await crypto.subtle.sign('HMAC',key,enc.encode(payload)));
 const keyId=hex(await crypto.subtle.digest('SHA-256',keyBytes)).slice(0,24);
 await initializeOperatorAudit(db);
 if(!await db.prepare('SELECT key_id FROM operator_audit_keys WHERE key_id=?').bind(keyId).first()){
  const envelope=await sealRecoveryEvent({eventId,at:now,kind:'audit-key',data:{keyId,key:btoa(String.fromCharCode(...new Uint8Array(keyBytes)))}});
  await db.prepare('INSERT OR IGNORE INTO operator_audit_keys(key_id,event_id,created_at,envelope) VALUES(?,?,?,?)').bind(keyId,eventId,now,envelope).run();
 }
 await db.prepare('INSERT INTO operator_access_audit(event_id,created_at,payload,key_id,signature) VALUES(?,?,?,?,?)').bind(eventId,now,payload,keyId,signature).run();
 // Only expire old records; the database independently rejects early deletion.
 await db.prepare('DELETE FROM operator_access_audit WHERE created_at < ?').bind(Math.floor(now/1000)*1000-AUDIT_RETENTION_DAYS*86400000).run();
}
export async function verifyOperatorAudit(row,secret){
 if(typeof row.payload!=='string'||!/^[a-f0-9]{64}$/.test(row.signature||''))return false;
 try{
  const data=JSON.parse(row.payload);
  if(data.eventId!==row.event_id||data.at!==row.created_at)return false;
  const bytes=await crypto.subtle.digest('SHA-256',enc.encode('sianaly-operator-audit-v1:'+secret));
  if(hex(await crypto.subtle.digest('SHA-256',bytes)).slice(0,24)!==row.key_id)return false;
  const key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return await crypto.subtle.verify('HMAC',key,Uint8Array.from(row.signature.match(/../g),x=>parseInt(x,16)),enc.encode(row.payload));
 }catch{return false;}
}
