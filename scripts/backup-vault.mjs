// Portable encrypted archive. Passwords arrive only through stdin, never argv.
import {scryptSync,randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {readFile,writeFile,readdir,mkdir,lstat} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
const MAGIC=Buffer.from('SIABK001'),LIMIT=512*1024*1024;
const hash=b=>createHash('sha256').update(b).digest('hex');
function key(password,salt){
 if(typeof password!=='string'||password.length<16)throw Error('Use a backup passphrase of at least 16 characters.');
 return scryptSync(password,salt,32,{N:65536,r:8,p:1,maxmem:128*1024*1024});
}
export function encryptBackup(files,password){
 const entries=Object.entries(files).map(([name,value])=>{
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(name))throw Error('Unsafe archive name.');
  const data=Buffer.from(value);return {name,sha256:hash(data),data:data.toString('base64')};
 });
 if(!entries.length)throw Error('Empty backup.');
 const raw=Buffer.from(JSON.stringify({version:1,createdAt:new Date().toISOString(),entries}));
 if(raw.length>LIMIT)throw Error('Backup exceeds size limit.');
 const salt=randomBytes(16),iv=randomBytes(12),header=Buffer.concat([MAGIC,salt,iv]),secret=key(password,salt);
 try{
  const cipher=createCipheriv('aes-256-gcm',secret,iv);cipher.setAAD(header);
  const ciphertext=Buffer.concat([cipher.update(gzipSync(raw)),cipher.final()]);
  return Buffer.concat([header,ciphertext,cipher.getAuthTag()]);
 }finally{secret.fill(0);raw.fill(0);}
}
export function decryptBackup(archive,password){
 if(archive.length<53||archive.length>LIMIT||!archive.subarray(0,8).equals(MAGIC))throw Error('Invalid backup.');
 const header=archive.subarray(0,36),secret=key(password,archive.subarray(8,24));let raw;
 try{
  const cipher=createDecipheriv('aes-256-gcm',secret,archive.subarray(24,36));cipher.setAAD(header);cipher.setAuthTag(archive.subarray(-16));
  raw=gunzipSync(Buffer.concat([cipher.update(archive.subarray(36,-16)),cipher.final()]),{maxOutputLength:LIMIT});
  const doc=JSON.parse(raw.toString('utf8'));
  if(doc.version!==1||!Array.isArray(doc.entries)||!doc.entries.length)throw Error('Invalid backup manifest.');
  const files=new Map();
  for(const e of doc.entries){
   if(typeof e.name!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(e.name)||files.has(e.name)||typeof e.data!=='string')throw Error('Unsafe archive entry.');
   const data=Buffer.from(e.data,'base64');if(hash(data)!==e.sha256)throw Error('Backup checksum mismatch.');files.set(e.name,data);
  }
  return files;
 }finally{secret.fill(0);raw?.fill(0);}
}
async function main(){
 const [command,input,output]=process.argv.slice(2);
 if(!['pack','verify','unpack'].includes(command)||!input||(command!=='verify'&&!output))throw Error('Usage: backup-vault.mjs pack INPUT_DIRECTORY OUTPUT_FILE | verify ARCHIVE | unpack ARCHIVE NEW_DIRECTORY');
 let stdin='';for await(const chunk of process.stdin){stdin+=chunk;if(stdin.length>16384)throw Error('Input too large.');}
 const {password}=JSON.parse(stdin);stdin='';
 if(command==='pack'){
  const source=resolve(input),files={};
  for(const entry of await readdir(source,{withFileTypes:true})){
   if(!entry.isFile()||entry.isSymbolicLink())throw Error('Only regular files may be packed.');
   const path=join(source,entry.name);if((await lstat(path)).size>LIMIT)throw Error('Input file too large.');files[entry.name]=await readFile(path);
  }
  const sealed=encryptBackup(files,password);decryptBackup(sealed,password);
  await writeFile(resolve(output),sealed,{flag:'wx',mode:0o600});console.log(JSON.stringify({encrypted:true,verified:true,files:Object.keys(files).length,bytes:sealed.length}));
 }else{
  const files=decryptBackup(await readFile(resolve(input)),password);
  if(command==='unpack'){
   // Refuse an existing destination: never overwrite a database or extracted data.
   await mkdir(resolve(output),{recursive:false,mode:0o700});
   for(const [name,data]of files)await writeFile(join(resolve(output),name),data,{flag:'wx',mode:0o600});
  }
  console.log(JSON.stringify({verified:true,files:files.size,archive:basename(input)}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Backup operation failed. Check password, archive integrity, paths and permissions.');process.exitCode=1;});
