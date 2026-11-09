// Runs real Auth + PostgREST against disposable restored PostgreSQL and SQLite.
// No production URL, credential, user deletion or email delivery is used.
import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {join,resolve,basename} from 'node:path';
import {randomBytes,createHmac,createHash} from 'node:crypto';
import {DatabaseSync,backup as sqliteBackup} from 'node:sqlite';
import {createClient} from '@supabase/supabase-js';
import {createAccountHandler} from './account-handler.mjs';
import {memberPolicy} from './member-legal.mjs';
const config=JSON.parse((await readFile(process.argv[2],'utf8')).replace(/^\uFEFF/,''));
if(!resolve(config.work).startsWith(resolve(config.root,'.secrets','backup')+'\\')&&!resolve(config.work).startsWith(resolve(config.root,'.secrets','backup')+'/'))throw Error('Only a private disposable restore directory is allowed.');
const authOrigin='http://127.0.0.1:55421',restOrigin='http://127.0.0.1:55423',gatewayOrigin='https://127.0.0.1:55420',site='https://127.0.0.1:55422';
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.hostname!=='127.0.0.1'||![55420,55421,55422,55423].includes(Number(url.port)))throw Error('External HTTP request blocked in restore test.');
 return nativeFetch(input,options);
};
const jwtSecret=randomBytes(48).toString('hex'),authPassword=randomBytes(24).toString('hex'),restPassword=randomBytes(24).toString('hex');
function token(role){const a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200})).toString('base64url');return a+'.'+b+'.'+createHmac('sha256',jwtSecret).update(a+'.'+b).digest('base64url');}
const anonKey=token('anon'),serviceKey=token('service_role');
const logs=[],children=new Set(),servers=[];let sqlite,siteEnv;
const proof={startedAt:new Date().toISOString(),productionModified:false,externalMailSent:false,auth:'Supabase Auth v2.197.0 (Windows socket-reuse adaptation only)',postgrest:'16.5',checks:[]};
const check=name=>{proof.checks.push(name);console.log('PASS '+name);};
function log(name){const stream=createWriteStream(join(config.work,name),{flags:'a'});logs.push(stream);return stream;}
async function command(executable,args,input='',extra={}){
 return new Promise((accept,reject)=>{
  const child=spawn(executable,args,{windowsHide:true,env:{...process.env,PGPASSWORD:config.pgPassword,...extra},stdio:['pipe','pipe','pipe']});children.add(child);let output='';const errors=log('private-command-errors.log');
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>10*1024*1024)child.kill();});child.stderr.pipe(errors,{end:false});child.on('error',reject);
  child.on('exit',code=>{children.delete(child);code===0?accept(output):reject(Error(`Local ${basename(executable)} exited with code ${code}. See private diagnostics.`));});child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
const connection=db=>['-h','127.0.0.1','-p','55439','-U','restore_admin','-d',db,'--no-password'];
const pg=(sql,db='postgres')=>command(join(config.pgBin,'psql.exe'),[...connection(db),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-f','-'],sql);
function start(executable,args,env,label){const child=spawn(executable,args,{windowsHide:true,cwd:config.work,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});children.add(child);const stream=log(label+'.log');child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});return child;}
async function stop(child){if(!child||child.exitCode!==null)return;const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;children.delete(child);}
async function waitReady(url,child){const deadline=Date.now()+30000;while(Date.now()<deadline){if(child?.exitCode!==null&&child?.exitCode!==undefined)throw Error('Local server exited before becoming ready (exit '+child.exitCode+').');try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Local server readiness timeout.');}
async function listen(server,port){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});servers.push(server);}
const messages=[];
async function startMailSink(){
 const smtp=net.createServer(socket=>{
  socket.setEncoding('utf8');socket.write('220 isolated.test ESMTP\r\n');let pending='',data=false,body='',recipients=[];
  socket.on('data',chunk=>{pending+=chunk;let index;while((index=pending.indexOf('\n'))>=0){let line=pending.slice(0,index).replace(/\r$/,'');pending=pending.slice(index+1);
   if(data){if(line==='.') {messages.push({recipients:[...recipients],body});body='';data=false;socket.write('250 captured locally\r\n');}else{body+=line+'\n';}continue;}
   if(/^(EHLO|HELO)/i.test(line))socket.write('250-isolated.test\r\n250 SIZE 1000000\r\n');
   else if(/^MAIL FROM/i.test(line)){recipients=[];socket.write('250 OK\r\n');}
   else if(/^RCPT TO/i.test(line)){const address=line.match(/<([^>]+)>/)?.[1]||'';if(!address.endsWith('@example.test')){socket.write('550 only synthetic recipients permitted\r\n');continue;}recipients.push(address);socket.write('250 OK\r\n');}
   else if(/^DATA/i.test(line)){if(!recipients.length){socket.write('554 recipient rejected\r\n');continue;}data=true;socket.write('354 end with dot\r\n');}
   else if(/^QUIT/i.test(line)){socket.end('221 bye\r\n');}else socket.write('250 OK\r\n');
  }});socket.on('error',()=>{});
 });await listen(smtp,55425);
}
const tls={cert:await readFile(config.certPath),key:await readFile(config.keyPath)};
async function startGateway(){
 const gateway=https.createServer(tls,(req,res)=>{
  const target=req.url.startsWith('/auth/v1/')?authOrigin:req.url.startsWith('/rest/v1/')?restOrigin:null;
  if(!target||![anonKey,serviceKey].includes(req.headers.apikey)){res.writeHead(403);res.end();return;}
  const path=req.url.replace(/^\/(auth|rest)\/v1/,'')||'/';
  const upstream=http.request(target+path,{method:req.method,headers:{...req.headers,host:new URL(target).host}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  upstream.on('error',()=>{res.writeHead(503);res.end();});req.pipe(upstream);
 });await listen(gateway,55420);
}
function dbAdapter(db){return {prepare(sql){const bound=(...values)=>({first:async()=>db.prepare(sql).get(...values),all:async()=>({results:db.prepare(sql).all(...values)}),run:async()=>{const result=db.prepare(sql).run(...values);return {meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};},_run:()=>db.prepare(sql).run(...values)});return {...bound(),bind:bound};},batch:async statements=>{db.exec('BEGIN');try{const result=[];for(const s of statements){const r=s._run();result.push({meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}});}db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};}
async function startSite(){
 const env={AUTH_SITE_URL:site,AUTH_ENABLED:'true',AUTH_SOCIAL_LOGIN_ENABLED:'false',AUTH_CAPTCHA_REQUIRED:'false',AUTH_PROVIDERS:'',SUPABASE_URL:gatewayOrigin,SUPABASE_PUBLISHABLE_KEY:anonKey,SUPABASE_SECRET_KEY:serviceKey,POPULAR_DB:dbAdapter(sqlite)};
 siteEnv=env;
 const handler=createAccountHandler({companyKeys:['samsung','naver'],clock:Date.now});
 const app=https.createServer(tls,async(req,res)=>{
  try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);headers.set('CF-Connecting-IP','192.0.2.42');
   const request=new Request(site+req.url,{method:req.method,headers,...(body.length?{body}:{})});const action=new URL(request.url).pathname.split('/').at(-1);
   const response=await handler({request,env,params:{action}});const out={};response.headers.forEach((v,k)=>{if(k!=='set-cookie')out[k]=v;});if(response.headers.getSetCookie().length)out['Set-Cookie']=response.headers.getSetCookie();res.writeHead(response.status,out);res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('{"code":"isolated_test_failure"}');}
 });await listen(app,55422);
}
function actor(){const jar=new Map();return {jar,async request(action,method='GET',body){const headers={};if(jar.size)headers.Cookie=[...jar].map(([k,v])=>k+'='+v).join('; ');if(method!=='GET'){headers.Origin=site;headers['Content-Type']='application/json';}
 const response=await fetch(site+'/api/account/'+action,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
 for(const cookie of response.headers.getSetCookie()){assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);const [entry]=cookie.split(';'),split=entry.indexOf('='),name=entry.slice(0,split),value=entry.slice(split+1);if(/Max-Age=0/i.test(cookie))jar.delete(name);else jar.set(name,value);}
 return {status:response.status,data:await response.json()};}};}
function expect(result,status,label){assert.equal(result.status,status,label+': '+JSON.stringify(result.data));return result.data;}
const accept={policyVersion:memberPolicy.version,age14:true,termsAccepted:true,privacyConsent:true};
const testPassword='Isolated-'+randomBytes(18).toString('hex');
let auth,rest;
async function startBackend(db){
 const authEnv={GOTRUE_API_HOST:'127.0.0.1',GOTRUE_API_PORT:'55421',PORT:'55421',API_EXTERNAL_URL:gatewayOrigin+'/auth/v1',GOTRUE_SITE_URL:site,GOTRUE_DB_DRIVER:'postgres',DATABASE_URL:`postgresql://supabase_auth_admin:${authPassword}@127.0.0.1:55439/${db}?sslmode=disable`,GOTRUE_DB_NAMESPACE:'auth',GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'false',GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:'55425',GOTRUE_SMTP_ADMIN_EMAIL:'noreply@example.test',GOTRUE_SMTP_SENDER_NAME:'Isolated restore test',GOTRUE_SMTP_MAX_FREQUENCY:'0s',GOTRUE_RATE_LIMIT_EMAIL_SENT:'100',GOTRUE_SECURITY_CAPTCHA_ENABLED:'false',OTEL_SDK_DISABLED:'true',GOTRUE_LOG_LEVEL:'error',GOTRUE_DISABLE_SIGNUP:'false'};
 auth=start(config.authBinary,['serve'],authEnv,'auth-'+db);await waitReady(authOrigin+'/health',auth);
 const restEnv={PATH:config.pgBin+';'+process.env.PATH,PGRST_DB_URI:`postgresql://authenticator:${restPassword}@127.0.0.1:55439/${db}?sslmode=disable`,PGRST_DB_SCHEMAS:'public',PGRST_DB_EXTRA_SEARCH_PATH:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:jwtSecret,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:'55423',PGRST_DB_POOL:'2',PGRST_LOG_LEVEL:'error'};
 rest=start(config.restBinary,[],restEnv,'rest-'+db);await waitReady(restOrigin+'/',rest);
}
async function register(a,email,nickname){
 const since=messages.length;const signup=expect(await a.request('email-signup','POST',{email,password:testPassword,nickname,...accept}),200,'Signup');assert.equal(signup.confirmationRequired,true);
 const deadline=Date.now()+5000;while(!messages.slice(since).some(m=>m.recipients.includes(email))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
 const mail=messages.slice(since).find(m=>m.recipients.includes(email));assert.ok(mail,'Confirmation message must reach only the local mail sink');
 const decoded=mail.body.replace(/=\r?\n/g,'').replace(/=([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
 const texts=[decoded];
 for(const part of mail.body.split(/\n--[^\n]+\n/)){
  const split=part.indexOf('\n\n');if(split>=0&&/Content-Transfer-Encoding:\s*base64/i.test(part.slice(0,split)))texts.push(Buffer.from(part.slice(split+2).replace(/\s/g,''),'base64').toString('utf8'));
 }
 let url;
 for(const text of texts)for(const match of text.matchAll(/https?:\/\/[^\s"<>]+/g)){try{const candidate=new URL(match[0].replaceAll('&amp;','&'));if(candidate.hostname==='127.0.0.1'&&(candidate.searchParams.has('token')||candidate.searchParams.has('token_hash')))url=candidate;}catch{}}
 if(!url){await writeFile(join(config.work,'synthetic-confirmation-message.eml'),mail.body);throw Error('Local confirmation URL missing (synthetic email retained privately).');}
 const tokenHash=url.searchParams.get('token')||url.searchParams.get('token_hash');assert.ok(tokenHash);
 expect(await a.request('email-confirm','POST',{tokenHash}),200,'Email confirmation');
 const state=expect(await a.request('session'),200,'Confirmed session');assert.equal(state.signedIn,true);assert.equal(state.legalRequired,false);
 return tokenHash;
}
try{
 // The hosted authenticator preloads Supabase's platform extension, absent on standalone Windows Postgres.
 // Remove only that platform preload in this disposable cluster; keep restored grants and RLS intact.
 await pg(`ALTER ROLE supabase_auth_admin WITH LOGIN PASSWORD '${authPassword}'; ALTER ROLE authenticator WITH LOGIN PASSWORD '${restPassword}'; ALTER ROLE authenticator RESET session_preload_libraries;`);
 sqlite=new DatabaseSync(':memory:');sqlite.exec((await readFile(join(config.work,'board-backup','community.sql'),'utf8')));
 check('Actual member and community backups loaded together');
 await startMailSink();await startGateway();await startSite();await startBackend('postgres');check('Real local Auth, PostgREST and production account handler ready');
 const a=actor(),b=actor(),admin=actor(),publicUser=actor();
 const tokenA=await register(a,'restore-a@example.test','복원시험가');await register(b,'restore-b@example.test','복원시험나');
 expect(await publicUser.request('email-confirm','POST',{tokenHash:tokenA}),400,'A confirmation link must be single-use');check('Signup, local email verification, signed cookies and consent linking');
 expect(await publicUser.request('email-login','POST',{email:'restore-a@example.test',password:'definitely-wrong'}),400,'Wrong password');
 const post=expect(await a.request('board','POST',{title:'격리 복원 시험 글',body:'실제 서비스와 분리된 백업 복원 시험입니다.'}),201,'Create restored-environment post');
 expect(await a.request('favorites','POST',{company:'samsung'}),200,'Save favorite');
 assert.deepEqual(expect(await b.request('favorites'),200,'Other member favorites').companies,[]);
 expect(await b.request('board?post='+post.id,'PATCH',{title:'다른 회원 수정',body:'허용되면 안 됩니다.'}),404,'Cross-owner edit blocked');
 expect(await b.request('board?post='+post.id,'PATCH',{hidden:true}),403,'Ordinary moderation blocked');
 expect(await b.request('board?post='+post.id,'POST',{body:'복원 확인 댓글'}),201,'Comment');
 expect(await b.request('board?post='+post.id+'&interaction=recommend','PATCH',{recommended:true}),200,'Recommend');
 const adminSdk=createClient(gatewayOrigin,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const created=await adminSdk.auth.admin.createUser({email:'restore-admin@example.test',password:testPassword,email_confirm:true,user_metadata:{sianaly_nickname:'복원운영자'},app_metadata:{sianaly_role:'admin'}});assert.ifError(created.error);
 expect(await admin.request('email-login','POST',{email:'restore-admin@example.test',password:testPassword}),200,'Operator login');
 assert.equal(expect(await admin.request('session'),200,'Operator session').isAdmin,true);
 expect(await admin.request('board?post='+post.id,'PATCH',{hidden:true}),200,'Operator hide');expect(await publicUser.request('board?post='+post.id),404,'Hidden post not public');
 expect(await admin.request('board?post='+post.id,'PATCH',{hidden:false}),200,'Operator restore');check('Writing, comments, recommendations, owner isolation and operator hide/restore');
 // Take a second disposable snapshot AFTER adding the synthetic login fixtures.
 const secondDump=join(config.work,'integrated-roundtrip.dump');
 await command(join(config.pgBin,'pg_dump.exe'),[...connection('postgres'),'--format=custom','--schema=auth','--schema=public','--schema=sianaly_internal','--file='+secondDump]);
 const secondSqlite=join(config.work,'integrated-board.sqlite');await sqliteBackup(sqlite,secondSqlite);await stop(auth);await stop(rest);
 await pg('CREATE DATABASE restore_verify;');await pg('DROP SCHEMA public;','restore_verify');
 await command(join(config.pgBin,'pg_restore.exe'),[...connection('restore_verify'),'--exit-on-error','--single-transaction',secondDump]);
 // Reopen a real SQLite backup file, not a mocked D1 response.
 sqlite.close();sqlite=new DatabaseSync(secondSqlite);siteEnv.POPULAR_DB=dbAdapter(sqlite);
 await startBackend('restore_verify');
 const recoveredA=actor(),recoveredB=actor();
 expect(await recoveredA.request('email-login','POST',{email:'restore-a@example.test',password:testPassword}),200,'Password login after full round trip');
 expect(await recoveredB.request('email-login','POST',{email:'restore-b@example.test',password:testPassword}),200,'Second member login after round trip');
 assert.equal(expect(await recoveredA.request('session'),200,'Restored consent').legalRequired,false);
 assert.equal(expect(await recoveredA.request('favorites'),200,'Restored favorite').companies[0].key,'samsung');
 const recovered=expect(await recoveredB.request('board?post='+post.id),200,'Restored post/comments');assert.equal(recovered.comments.length,1);assert.equal(recovered.post.recommendations,1);assert.equal(recovered.canManage,false);
 check('Real password login, consent, post, comments, vote and favorite survive another combined backup/restore');
 const staleA=actor();for(const [k,v]of recoveredA.jar)staleA.jar.set(k,v);
 expect(await recoveredA.request('delete','POST',{confirmation:'회원탈퇴'}),200,'Withdraw restored synthetic member');
 const after=expect(await recoveredB.request('board?post='+post.id),200,'Post preserved after withdrawal');assert.equal(after.post.author,'탈퇴한 회원');assert.equal(after.canManage,false);
 const status=JSON.parse((await pg("SELECT json_build_object('user_count',(SELECT count(*) FROM auth.users WHERE email='restore-a@example.test'),'favorites',(SELECT count(*) FROM public.sianaly_favorites WHERE user_id NOT IN (SELECT id FROM auth.users)),'queue',(SELECT count(*) FROM public.sianaly_member_departures))::text;",'restore_verify')).trim());
 assert.equal(status.user_count,0);assert.equal(status.favorites,0);assert.equal(status.queue,0);
 expect(await staleA.request('board','POST',{title:'삭제된 계정',body:'이전 쿠키로 작성 불가'}),401,'Deleted-user cookie rejected');
 assert.equal(sqlite.prepare("SELECT count(*) AS n FROM board_posts WHERE id=? AND owner='' AND author='탈퇴한 회원'").get(post.id).n,1);
 check('Auth deletion, favorite cascade, durable departure queue, D1 anonymization and stale-session denial');
 expect(await recoveredB.request('logout','POST',{}),200,'Logout');assert.equal(expect(await recoveredB.request('session'),200,'Logged out').signedIn,false);
 check('Logout clears restored account session');
 proof.completedAt=new Date().toISOString();proof.passed=true;proof.localCapturedEmails=messages.length;proof.limits=['Turnstile, OAuth and external SMTP delivery are outside this isolated test.','Cloud provider disaster migration and encryption-root configuration remain separate operational steps.'];
 const proofDirectory=join(config.root,'tmp','backup-verification');await mkdir(proofDirectory,{recursive:true});await writeFile(join(proofDirectory,'restored-service-integration.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
}catch(error){
 proof.passed=false;proof.failedAt=new Date().toISOString();proof.failure=error.message;await writeFile(join(config.work,'integration-failure.json'),JSON.stringify(proof,null,2));console.error('Restored-service integration failed: '+error.message);process.exitCode=1;
}finally{
 for(const child of [...children])await stop(child);
 sqlite?.close();for(const server of servers.reverse())await new Promise(r=>server.close(r));for(const stream of logs)stream.end();
}
