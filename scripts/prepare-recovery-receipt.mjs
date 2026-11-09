// Prepare an encrypted manual privacy receipt after the operator verifies a request.
// This utility never queries or changes a live database.
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {sealRecoveryEvent} from './recovery-journal.mjs';
import {replayRecoveryEvents} from './recovery-replay.mjs';
const allowed=new Set(['member-delete-request','member-deleted','post-delete','post-update','favorite-delete','nickname-update','profile-minimize','report-delete','report-redact']);
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>20000)throw Error('Receipt input too large');}
const {kind,data}=JSON.parse(input);input='';
if(!allowed.has(kind)||!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid manual recovery receipt');
const fields={
 'member-delete-request':['userId'],'member-deleted':['userId'],'profile-minimize':['userId'],
 'post-delete':['id','createdAt'],'post-update':['id','createdAt','title','body'],
 'favorite-delete':['userId','company'],'nickname-update':['userId','nickname'],
 'report-delete':['id','createdAt'],'report-redact':['id','createdAt','body']
};
if(Object.keys(data).some(k=>!fields[kind].includes(k)))throw Error('Do not add unrelated personal information to a receipt');
await replayRecoveryEvents({pg:{query:async()=>({rows:[]})},sqlite:{prepare:()=>({run:()=>({})})},events:[{kind,data,at:Date.now()}],backupStartedAt:0});
const eventId=crypto.randomUUID(),at=Date.now(),envelope=await sealRecoveryEvent({eventId,at,kind,data});
const dir=resolve('.secrets/backup');await mkdir(dir,{recursive:true});
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const sql='-- Encrypted privacy receipt only; execute only after verifying the request.\nINSERT INTO privacy_recovery_journal(event_id,created_at,envelope) VALUES('+quote(eventId)+','+at+','+quote(envelope)+');\n';
const destination=join(dir,'receipt-'+eventId+'.sql');await writeFile(destination,sql,{flag:'wx',mode:0o600});
console.log(JSON.stringify({prepared:true,encrypted:true,liveDataModified:false,receipt:destination}));
