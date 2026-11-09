import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,dirname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {decryptBackup} from './backup-vault.mjs';
import {openRecoveryEvent,replayRecoveryEvents,verifyPrivateSnapshot,mergeFreshPrivacySnapshot} from './recovery-replay.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
async function main(){
 const [archivePath,sqlitePath,backupTime]=process.argv.slice(2),backupStartedAt=Date.parse(backupTime);
 if(!archivePath||!sqlitePath||!Number.isFinite(backupStartedAt)||backupStartedAt<Date.now()-30*86400000||backupStartedAt>Date.now())throw Error('Use an unexpired backup and its UTC capture start time.');
 const target=await realpath(resolve(sqlitePath));
 const relative=target.slice(root.length+1).replaceAll('\\','/');
 if(!target.startsWith(root+sep)||!/^\.secrets\/backup\/restore-\d{8}T\d{9}Z\/.+\.sqlite$/.test(relative))throw Error('Target must be inside a private isolated restore directory.');
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>32000)throw Error('Oversized local configuration');}
 const config=JSON.parse(input);input='';
 const psql=join(root,'tmp/backup-tools/postgresql17/pgsql/bin/psql.exe');
 const run=sql=>{const result=spawnSync(psql,['-h','127.0.0.1','-p','55439','-U','restore_admin','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',windowsHide:true,env:{...process.env,PGPASSWORD:config.localDatabasePassword,PGSSLMODE:'disable'},maxBuffer:1024*1024});if(result.status!==0)throw Error('Isolated PostgreSQL operation failed.');return result.stdout.trim();};
 const server=JSON.parse(run("select json_build_object('actor',current_user,'dir',current_setting('data_directory'))::text;"));
 if(server.actor!=='restore_admin'||!resolve(server.dir).startsWith(dirname(target)+sep))throw Error('Target PostgreSQL is not the same isolated restore directory.');
 const files=decryptBackup(await readFile(resolve(archivePath)),config.password);
 const snapshot=JSON.parse(files.get('community-snapshot.json')?.toString('utf8')||'null');
 if(!snapshot||Date.parse(snapshot.capturedAt)<backupStartedAt||Date.parse(snapshot.capturedAt)<Date.now()-3600000)throw Error('Capture a new independent D1 recovery journal before restoring.');
 verifyPrivateSnapshot(snapshot,config.privateKey);
 const definition=snapshot.tableDefinitions.find(t=>t.name==='privacy_recovery_journal');
 if(!definition)throw Error('Recovery journal missing; manual privacy reconciliation required.');
 const rows=snapshot.tables.privacy_recovery_journal.map(cells=>Object.fromEntries(definition.columns.map((name,i)=>[name,cells[i][0]==='integer'?Number(cells[i][1]):cells[i][1]]))).sort((a,b)=>a.seq-b.seq);
 const events=rows.map(row=>openRecoveryEvent(row,config.privateKey));
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
 const pg={query:async(sql,args=[])=>{run(sql.replace(/\$(\d+)/g,(_,n)=>quote(args[Number(n)-1]))+';');return{rows:[]}}};
 const sqlite=new DatabaseSync(target);sqlite.exec('PRAGMA foreign_keys=ON');
 let result;try{result=await replayRecoveryEvents({pg,sqlite,events,backupStartedAt});mergeFreshPrivacySnapshot(sqlite,snapshot);}finally{sqlite.close();}
 await writeFile(join(dirname(target),'privacy-replay-result.json'),JSON.stringify({...result,journalCapturedAt:snapshot.capturedAt,checkedAt:new Date().toISOString(),isolated:true},null,2),{mode:0o600});
 config.privateKey='';config.password='';config.localDatabasePassword='';
 console.log(JSON.stringify({...result,isolated:true}));if(!result.releaseAllowed)process.exitCode=2;
}
main().catch(()=>{console.error('Privacy replay did not pass. Keep the restored service offline; no live database was changed by this tool.');process.exitCode=1;});
