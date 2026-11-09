export const MEMBER_POLICY_VERSION='2026-11-09';
export const memberPolicy={version:MEMBER_POLICY_VERSION,minimumAge:14,terms:'/terms.html',privacy:'/privacy.html'};
export function validMemberAcceptance(body){
 return body?.policyVersion===MEMBER_POLICY_VERSION&&body.age14===true&&body.termsAccepted===true&&body.privacyConsent===true;
}
export async function legalOwnerHash(id){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function initializeMemberLegal(db){
 if(!db)throw Error('Legal receipt storage unavailable');
 await db.prepare('CREATE TABLE IF NOT EXISTS member_legal_acceptances (owner_hash TEXT NOT NULL, policy_version TEXT NOT NULL, accepted_at INTEGER NOT NULL, PRIMARY KEY(owner_hash,policy_version))').run();
}
async function receiptSignature(secret,text){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('member-policy:'+text));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function pendingMemberReceipt(secret,id,now){const text=MEMBER_POLICY_VERSION+'.'+now+'.'+await legalOwnerHash(id);return text+'.'+await receiptSignature(secret,text);}
export async function verifyPendingMemberReceipt(secret,id,value,now){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:-r[1-9][0-9]*)?\.\d{13}\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value))return null;
 const [version,time,owner,signature]=value.split('.'),acceptedAt=Number(time);
 if(version!==MEMBER_POLICY_VERSION||acceptedAt>now||now-acceptedAt>=86400000||owner!==await legalOwnerHash(id))return null;
 const expected=await receiptSignature(secret,value.slice(0,value.lastIndexOf('.')));
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);
 return diff===0?acceptedAt:null;
}
export const memberLegalStore={
 async has(db,id){await initializeMemberLegal(db);return Boolean(await db.prepare('SELECT accepted_at FROM member_legal_acceptances WHERE owner_hash=? AND policy_version=?').bind(await legalOwnerHash(id),MEMBER_POLICY_VERSION).first());},
 async save(db,id,now){await initializeMemberLegal(db);await db.prepare('INSERT OR IGNORE INTO member_legal_acceptances(owner_hash,policy_version,accepted_at) VALUES(?,?,?)').bind(await legalOwnerHash(id),MEMBER_POLICY_VERSION,now).run();}
};
