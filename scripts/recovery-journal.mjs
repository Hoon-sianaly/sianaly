import {RECOVERY_PUBLIC_KEY} from './recovery-public-key.mjs';
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const allowed=new Set(['member-delete-request','member-deleted','post-delete','post-update','favorite-delete','nickname-update','profile-minimize','report-delete','report-redact','audit-key']);
export const RECOVERY_RETENTION_DAYS=45;
export async function initializeRecoveryJournal(db){
 if(!db)throw Error('Recovery journal unavailable');
 await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS privacy_recovery_journal (seq INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE NOT NULL,created_at INTEGER NOT NULL,envelope TEXT NOT NULL)'),
  db.prepare('CREATE INDEX IF NOT EXISTS privacy_recovery_journal_time ON privacy_recovery_journal(created_at)'),
  db.prepare("CREATE TRIGGER IF NOT EXISTS privacy_recovery_journal_no_update BEFORE UPDATE ON privacy_recovery_journal BEGIN SELECT RAISE(ABORT,'Recovery events are immutable'); END"),
  db.prepare("CREATE TRIGGER IF NOT EXISTS privacy_recovery_journal_no_early_delete BEFORE DELETE ON privacy_recovery_journal WHEN OLD.created_at > CAST(strftime('%s','now') AS INTEGER)*1000-3888000000 BEGIN SELECT RAISE(ABORT,'Recovery event retention has not expired'); END")
 ]);
 await db.prepare("DELETE FROM privacy_recovery_journal WHERE created_at < CAST(strftime('%s','now') AS INTEGER)*1000-3888000000").run();
}
export async function sealRecoveryEvent(event,publicKey=RECOVERY_PUBLIC_KEY){
 if(!event||!allowed.has(event.kind)||!Number.isSafeInteger(event.at)||typeof event.eventId!=='string')throw Error('Invalid recovery event');
 const publicBytes=Uint8Array.from(atob(publicKey.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0));
 const rsa=await crypto.subtle.importKey('spki',publicBytes,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const header=JSON.stringify({version:1,eventId:event.eventId,at:event.at});
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(header)},key,enc.encode(JSON.stringify(event)));
 const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},rsa,await crypto.subtle.exportKey('raw',key));
 return JSON.stringify({header,key:b64(wrapped),iv:b64(iv),ciphertext:b64(ciphertext)});
}
export async function recoveryStatement(db,kind,data,now=Date.now(),publicKey=RECOVERY_PUBLIC_KEY){
 await initializeRecoveryJournal(db);
 const eventId=crypto.randomUUID(),envelope=await sealRecoveryEvent({eventId,at:now,kind,data},publicKey);
 return db.prepare('INSERT INTO privacy_recovery_journal(event_id,created_at,envelope) VALUES(?,?,?)').bind(eventId,now,envelope);
}
export async function recordRecoveryEvent(db,kind,data,now=Date.now()){
 await (await recoveryStatement(db,kind,data,now)).run();
 await db.prepare('DELETE FROM privacy_recovery_journal WHERE created_at < ?').bind(Math.floor(now/1000)*1000-RECOVERY_RETENTION_DAYS*86400000).run();
}
