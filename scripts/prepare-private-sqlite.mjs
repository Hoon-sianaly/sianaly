import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const [source,target]=process.argv.slice(2);
if(!source||!target||!/[/\\]\.secrets[/\\]backup[/\\]restore-\d{8}T\d{9}Z[/\\]/.test(resolve(target)))throw Error('Private disposable restore path required');
try{await stat(target);throw Error('Refusing to overwrite an existing SQLite file');}catch(e){if(e.code!=='ENOENT')throw e;}
const sqlite=new DatabaseSync(resolve(target));
try{sqlite.exec(await readFile(resolve(source),'utf8'));if(sqlite.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('SQLite integrity check failed');}finally{sqlite.close();}
console.log('Private disposable SQLite restored. No member rows displayed.');
