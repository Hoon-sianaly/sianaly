import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {encryptBackup,decryptBackup} from './backup-vault.mjs';
import {schemaQuery,captureQuery,restoreAndVerify} from './d1-backup-snapshot.mjs';
import {verifyPrivateSnapshot} from './recovery-replay.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const account='ffb8c481be0c4b4ab18e9b03bf873399',database='25fbfe6b-4780-4e78-a0c7-19f3e92ec46f';
async function main(){
 let input='';for await(const part of process.stdin){input+=part;if(input.length>20000)throw Error('Invalid local configuration.');}
 const config=JSON.parse(input);input='';
 if(!config.CloudflareToken||!config.BackupPassword)throw Error('D1 backup token or archive password is missing.');
 const api=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}`;
 async function call(path,body){
  const response=await fetch(api+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${config.CloudflareToken}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(!response.ok){throw Error(`Cloudflare D1 request failed (HTTP ${response.status}). Permission review may be required.`);}
  const result=await response.json();if(!result.success)throw Error('Cloudflare D1 did not confirm success.');return result.result;
 }
 const metadata=await call('');
 console.log(JSON.stringify({database:metadata.name,tokenReadAccess:true}));
 async function query(sql,params=[]){
  if(!/^SELECT\s/i.test(sql))throw Error('Only read-only backup queries are permitted.');
  const result=await call('/query',{sql,params});if(result.length!==1||result[0].success===false)throw Error('D1 read query failed.');return result[0].results;
 }
 const schema=await query(schemaQuery),tables=[];
 for(const entry of schema.filter(s=>s.type==='table')){
  const columns=await query('SELECT name,hidden FROM pragma_table_xinfo(?) ORDER BY cid',[entry.name]);
  tables.push({name:entry.name,columns:columns.filter(c=>c.hidden===0).map(c=>c.name)});
 }
 const hasSequence=(await query("SELECT count(*) AS n FROM sqlite_master WHERE name='sqlite_sequence'"))[0].n>0;
 const rows=await query(captureQuery(schema,tables,hasSequence));
 const snapshot=JSON.parse(rows[0].snapshot);
 if(JSON.stringify(snapshot.schema)!==JSON.stringify(schema))throw Error('Schema changed during capture; retry after writes settle.');
 Object.assign(snapshot,{version:1,tableDefinitions:tables,capturedAt:new Date().toISOString()});
 const proof=restoreAndVerify(snapshot);
 const sql=Buffer.from(proof.sql);
 const privacyProof=config.RecoveryPrivateKey?verifyPrivateSnapshot(snapshot,config.RecoveryPrivateKey):{};
 if(!config.RecoveryPrivateKey&&snapshot.tableDefinitions.some(t=>t.name==='privacy_recovery_journal'||t.name==='operator_access_audit'))throw Error('Local recovery key is required for privacy verification.');
 const manifest={version:1,capturedAt:snapshot.capturedAt,account,database,name:metadata.name,source:'One read-only SELECT statement (consistent D1 snapshot)',restoreVerified:true,counts:proof.counts,integrity:proof.integrity,foreignKeys:proof.foreignKeys,contentHashesMatch:proof.contentHashesMatch,portableSqlRestore:proof.portableSqlRestore,...privacyProof};
 const archive=encryptBackup({'community.sql':sql,'community-snapshot.json':Buffer.from(JSON.stringify(snapshot)),'d1-manifest.json':Buffer.from(JSON.stringify(manifest))},config.BackupPassword);
 decryptBackup(archive,config.BackupPassword);
 const destination=join(root,'backups');await mkdir(destination,{recursive:true});
 const name=`sianaly-d1-${new Date().toISOString().replace(/[-:.]/g,'')}.sianaly-backup`;
 await writeFile(join(destination,name),archive,{flag:'wx',mode:0o600});
 sql.fill(0);config.CloudflareToken='';config.BackupPassword='';config.RecoveryPrivateKey='';
 const proofDirectory=join(root,'tmp','backup-verification');await mkdir(proofDirectory,{recursive:true});
 await writeFile(join(proofDirectory,'d1-restore-result.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 console.log(JSON.stringify({archive:name,encrypted:true,archiveVerified:true,bytes:archive.length,restoreVerified:true,counts:proof.counts,portableSqlRestore:proof.portableSqlRestore}));
}
main().catch(error=>{console.error(error.message?.startsWith('Cloudflare D1')?error.message:'D1 backup failed. No successful export/restore was recorded.');process.exitCode=1;});
