import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAccountHandler,safeAccountReturn,memberNickname} from './account-handler.mjs';
const origin='https://dev.sianaly.com',now=Date.now();
const env={AUTH_SITE_URL:origin,AUTH_ENABLED:'true',AUTH_PROVIDERS:'google,custom:kakao,custom:naver',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-public',SUPABASE_SECRET_KEY:'test-server-only'};
const sqlite=new DatabaseSync(':memory:');
let failDepartureBatch=false;
const departures=new Set();
const db={
 prepare(sql){
  function bind(...params){
   return {
    sql,
    first:async()=>sqlite.prepare(sql).get(...params),
    all:async()=>({results:sqlite.prepare(sql).all(...params)}),
    run:async()=>{const {changes,lastInsertRowid}=sqlite.prepare(sql).run(...params);return {meta:{changes,last_row_id:lastInsertRowid}};}
   };
  }
  return {...bind(),bind};
 },
 batch:async statements=>{
  if(failDepartureBatch&&statements.some(statement=>statement.sql.startsWith('UPDATE board_posts SET owner')))throw Error('Temporary D1 failure');
  return Promise.all(statements.map(statement=>statement.run()));
 }
};
env.POPULAR_DB=db;
const keys=new Set(['samsung','naver']);
for(const value of ['https://evil.test','//evil.test','javascript:alert(1)','/unknown','/company?company=missing'])assert.equal(safeAccountReturn(value,origin,keys),'/');
assert.equal(safeAccountReturn('/company?company=samsung&extra=1#x',origin,keys),'/company?company=samsung');
let user=null,options,insert,removed,deleted,adminCalls=0,exchanged,nicknameUpdate,emailCall,emailError=null,emailHasSession=true;
let handlerNow=now,recoveryUsed=false,recoveryRequest,passwordUpdate,passwordError=null,signOutScope;
const handler=createAccountHandler({companyKeys:keys,clock:()=>handlerNow,serverClient:(url,key,opts)=>{
 assert.equal(key,env.SUPABASE_PUBLISHABLE_KEY);options=opts;
 return {auth:{getUser:async()=>({data:{user},error:null}),signInWithOAuth:async args=>{
  assert.equal(args.options.redirectTo,origin+'/api/account/callback?next=%2F');
  opts.cookies.setAll([{name:'__Host-sianaly-auth-code-verifier',value:'test-verifier',options:{domain:'.evil.test',httpOnly:false,secure:false,sameSite:'none'}}]);
  return {data:{url:env.SUPABASE_URL+'/auth/v1/authorize?provider='+args.provider}};
 },signUp:async input=>{
  emailCall={action:'signup',input};
  if(!emailError&&emailHasSession)opts.cookies.setAll([{name:'__Host-sianaly-auth',value:'test-email-session',options:{httpOnly:false}}]);
  return {data:{session:emailHasSession?{access_token:'never-return-this-token'}:null},error:emailError};
 },signInWithPassword:async input=>{
  emailCall={action:'login',input};
  if(!emailError)opts.cookies.setAll([{name:'__Host-sianaly-auth',value:'test-email-session',options:{}}]);
  return {data:{session:{access_token:'never-return-this-token'}},error:emailError};
 },resetPasswordForEmail:async(...args)=>{recoveryRequest=args;return {};},
 verifyOtp:async input=>{
  if(input.type!=='recovery'||input.token_hash!=='A'.repeat(64)||recoveryUsed)return {error:{code:'otp_expired'}};
  recoveryUsed=true;user={id:'recovery-user',app_metadata:{provider:'email'},user_metadata:{sianaly_nickname:'복구회원'}};
  opts.cookies.setAll([{name:'__Host-sianaly-auth',value:'recovered-session',options:{}}]);
  return {data:{user,session:{access_token:'never-return-recovery-token'}}};
 },exchangeCodeForSession:async code=>{exchanged=code;return {};},
 signOut:async args=>{signOutScope=args.scope;return {};},
 updateUser:async data=>{if(data.password){passwordUpdate=data;return {error:passwordError};}nicknameUpdate=data;return {}; }},from:table=>{
  assert.equal(table,'sianaly_favorites');return {
   select:()=>({order:()=>({limit:async()=>({data:[{company_key:'samsung',created_at:'today'},{company_key:'invalid',created_at:'today'}]})})}),
   upsert:async(row,settings)=>{insert={row,settings};return {};},
   delete:()=>({eq:(field,id)=>({eq:async(field2,key)=>{removed={field,id,field2,key};return {};}})})
  };
 }};
},adminClient:(url,key,opts)=>{
 adminCalls++;assert.equal(key,env.SUPABASE_SECRET_KEY);assert.equal(opts.auth.persistSession,false);
 return {
  auth:{admin:{deleteUser:async id=>{deleted=id;departures.add(id);return {};}}},
  from:table=>{
   assert.equal(table,'sianaly_member_departures');
   return {
    select:()=>({order:()=>({limit:async()=>({data:[...departures].map(user_id=>({user_id}))})})}),
    delete:()=>({in:async(field,ids)=>{assert.equal(field,'user_id');for(const id of ids)departures.delete(id);return {};}})
   };
  }
 };
}});
async function request(action,{method='GET',body,requestOrigin=origin,cookie,overrides={},ip='192.0.2.1'}={}){
 const headers={'CF-Connecting-IP':ip};if(method!=='GET'){headers.Origin=requestOrigin;headers['Content-Type']='application/json';}if(cookie)headers.Cookie=cookie;
 const response=await handler({request:new Request(origin+'/api/account/'+action,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})}),env:{...env,...overrides},params:{action:action.split('?')[0]}});
 assert.match(response.headers.get('Cache-Control'),/no-store/);return response;
}
assert.equal((await request('config',{overrides:{AUTH_ENABLED:'false'}})).status,200);
assert.deepEqual(await (await request('config')).json(),{ready:true,email:true,providers:[{id:'custom:kakao',name:'카카오'},{id:'custom:naver',name:'네이버'}]});
assert.equal((await request('session',{overrides:{AUTH_SITE_URL:'https://evil.test'}})).status,503);
assert.equal((await request('favorites')).status,401);
assert.equal((await request('nickname',{method:'POST',body:{nickname:'별명'}})).status,401);
assert.equal((await request('login',{method:'POST',body:{provider:'google'},requestOrigin:'https://evil.test'})).status,403);
assert.equal((await request('login',{method:'POST',body:{provider:'unknown'}})).status,400);
assert.equal((await request('login',{method:'POST',body:{provider:'google'}})).status,400);
let response=await request('login',{method:'POST',body:{provider:'custom:naver',next:'https://evil.test'}});
assert.equal(response.status,200);const cookie=response.headers.get('Set-Cookie');
for(const flag of ['HttpOnly','Secure','SameSite=Lax','Path=/','Max-Age=600'])assert.ok(cookie.includes(flag),flag);
assert.ok(!cookie.toLowerCase().includes('domain='));assert.equal(options.cookieOptions.name,'__Host-sianaly-auth');
response=await request('callback?code=test&next=https://evil.test');assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'/');assert.equal(exchanged,'test');
user={id:'verified-user',last_sign_in_at:new Date(now).toISOString(),email:'private@example.test',app_metadata:{provider:'google'}};
const session=await (await request('session')).json();assert.deepEqual(session,{signedIn:true,provider:'Google',nickname:''});
assert.equal((await request('favorites',{method:'POST',body:{company:'samsung'}})).status,409);
assert.equal(memberNickname('<script>'),null);assert.equal(memberNickname('a\nb'),null);assert.equal(memberNickname('가'.repeat(21)),null);
assert.equal((await request('nickname',{method:'POST',body:{nickname:'별명'},requestOrigin:'https://evil.test'})).status,403);
assert.equal((await request('nickname',{method:'POST',body:{nickname:'별명',user_id:'victim'}})).status,400);
assert.equal((await request('nickname',{method:'POST',body:{nickname:'<img>'}})).status,400);
assert.deepEqual(await (await request('nickname',{method:'POST',body:{nickname:'  별명  '}})).json(),{nickname:'별명'});
assert.deepEqual(nicknameUpdate,{data:{sianaly_nickname:'별명'}});assert.equal(adminCalls,0);
user.user_metadata={sianaly_nickname:'별명'};assert.equal((await (await request('session')).json()).nickname,'별명');
assert.equal((await request('nickname',{method:'POST',body:{nickname:''}})).status,400);
assert.deepEqual(await (await request('favorites')).json(),{companies:[{key:'samsung',createdAt:'today'}]});
assert.equal((await request('favorites',{method:'POST',body:{company:'samsung',user_id:'victim'}})).status,400);
assert.equal((await request('favorites',{method:'POST',body:{company:'samsung'}})).status,200);assert.equal(insert.row.user_id,user.id);assert.equal(insert.settings.ignoreDuplicates,true);
await request('favorites',{method:'DELETE',body:{company:'samsung'}});assert.equal(removed.id,user.id);assert.equal(removed.key,'samsung');assert.equal(adminCalls,0);
assert.equal((await request('delete',{method:'POST',body:{confirmation:'wrong'}})).status,400);
user.last_sign_in_at=new Date(now-601000).toISOString();assert.equal((await request('delete',{method:'POST',body:{confirmation:'회원탈퇴'}})).status,409);assert.equal(adminCalls,0);
user.last_sign_in_at=new Date(now).toISOString();response=await request('delete',{method:'POST',body:{confirmation:'회원탈퇴'},cookie:'__Host-sianaly-auth.0=test; unrelated=keep'});
assert.equal(response.status,200);assert.equal(deleted,user.id);assert.match(response.headers.get('Set-Cookie'),/Max-Age=0/);assert.ok(!response.headers.get('Set-Cookie').includes('unrelated'));
assert.equal((await request('favorites',{method:'PUT',body:{}})).status,405);
assert.equal((await request('favorites',{method:'POST',body:{company:'x'.repeat(1500)}})).status,503);
const board=(query='',options={})=>request('board'+query,{...options,overrides:{POPULAR_DB:db}});
const memberCookie='__Host-sianaly-auth.0=test';
user={id:'author',user_metadata:{sianaly_nickname:'작성자'}};
const created=await board('',{method:'POST',body:{title:'원래 제목',body:'본문'}});
assert.equal(created.status,201);
const {id}=await created.json(), detail='?post='+id;
assert.equal((await board(detail,{method:'POST',body:{body:'댓글'}})).status,201);
assert.equal((await (await board(detail,{cookie:memberCookie})).json()).canManage,true);
const publicDetail=await (await board(detail)).json();
assert.equal(publicDetail.canManage,false);
assert.ok(!Object.hasOwn(publicDetail.post,'owner'));
assert.deepEqual((await (await board('?mine=1',{cookie:memberCookie})).json()).posts.map(post=>post.id),[id]);
user={id:'other',user_metadata:{sianaly_nickname:'작성자'}};
assert.equal((await (await board(detail,{cookie:memberCookie})).json()).canManage,false);
assert.deepEqual((await (await board('?mine=1',{cookie:memberCookie})).json()).posts,[]);
assert.equal((await board(detail,{method:'PATCH',body:{title:'다른 제목',body:'다른 본문'}})).status,404);
assert.equal((await board(detail,{method:'DELETE'})).status,404);
user={id:'other',user_metadata:{sianaly_nickname:'운영자',sianaly_role:'admin'}};
assert.equal((await board(detail,{method:'PATCH',body:{hidden:true}})).status,403);
assert.equal((await board('?moderation=1',{cookie:memberCookie})).status,403);
user={id:'moderator',app_metadata:{sianaly_role:'admin'}};
assert.equal((await (await request('session')).json()).isAdmin,true);
assert.equal((await board(detail,{method:'PATCH',body:{title:'운영자 수정',body:'본문'}})).status,404);
assert.equal((await board(detail,{method:'PATCH',body:{hidden:true}})).status,200);
assert.equal((await board(detail,{method:'PATCH',body:{hidden:true}})).status,200);
assert.equal((await (await board('?moderation=1',{cookie:memberCookie})).json()).posts[0].id,id);
user=null;
assert.equal((await board(detail)).status,404);
assert.equal((await board('?moderation=1')).status,401);
assert.deepEqual((await (await board()).json()).posts,[]);
user={id:'other',user_metadata:{sianaly_nickname:'일반회원'}};
assert.equal((await board(detail,{cookie:memberCookie})).status,404);
assert.equal((await board(detail,{method:'POST',body:{body:'숨긴 글 댓글'}})).status,404);
user={id:'author'};
assert.equal((await (await board(detail,{cookie:memberCookie})).json()).post.hidden,1);
assert.equal((await (await board('?mine=1',{cookie:memberCookie})).json()).posts[0].hidden,1);
user={id:'moderator',app_metadata:{sianaly_role:'admin'}};
assert.equal((await board(detail,{method:'PATCH',body:{hidden:false}})).status,200);
assert.equal((await board(detail)).status,200);
user=null;
assert.equal((await board('?mine=1')).status,401);
assert.equal((await board(detail,{method:'DELETE'})).status,401);
assert.equal((await (await board(detail,{cookie:memberCookie})).json()).canManage,false);
user={id:'author'};
assert.equal((await board(detail,{method:'DELETE',requestOrigin:'https://evil.test'})).status,403);
assert.equal((await board(detail,{method:'PATCH',body:{title:'',body:'새 본문'}})).status,400);
assert.equal((await board(detail,{method:'PATCH',body:{title:'수정 제목',body:'새 본문'}})).status,200);
assert.equal((await (await board(detail)).json()).post.title,'수정 제목');
assert.equal((await board(detail,{method:'DELETE'})).status,200);
assert.equal((await board(detail)).status,404);
assert.equal(sqlite.prepare('SELECT count(*) AS total FROM board_comments').get().total,0);
const retainedId=Number(sqlite.prepare('INSERT INTO board_posts (owner,author,title,body,created_at) VALUES (?,?,?,?,?)').run('retiring-member','예전별명','남길 글','남길 본문',now).lastInsertRowid);
sqlite.prepare('INSERT INTO board_comments (post_id,owner,author,body,created_at) VALUES (?,?,?,?,?)').run(retainedId,'retiring-member','예전별명','남길 댓글',now);
user={id:'retiring-member',last_sign_in_at:new Date(now).toISOString()};
failDepartureBatch=true;
const previousConsoleError=console.error;let queuedMessage;
console.error=message=>{queuedMessage=message;};
assert.equal((await request('delete',{method:'POST',body:{confirmation:'회원탈퇴'}})).status,200);
console.error=previousConsoleError;
assert.equal(queuedMessage,'board_departure_sync_pending');
assert.ok(departures.has('retiring-member'));
user=null;
assert.equal((await board('?post='+retainedId)).status,503);
failDepartureBatch=false;
const retained=await (await board('?post='+retainedId)).json();
assert.equal(retained.post.author,'탈퇴한 회원');
assert.equal(retained.post.body,'남길 본문');
assert.equal(retained.comments[0].author,'탈퇴한 회원');
assert.equal(retained.comments[0].body,'남길 댓글');
assert.equal(sqlite.prepare('SELECT owner FROM board_posts WHERE id = ?').get(retainedId).owner,'');
assert.equal(departures.size,0);
user={id:'retiring-member',user_metadata:{sianaly_nickname:'옛 세션'}};
assert.equal((await board('',{method:'POST',body:{title:'늦은 요청',body:'본문'}})).status,401);
user={id:'another-user',user_metadata:{sianaly_nickname:'예전별명'}};
assert.equal((await (await board('?post='+retainedId,{cookie:memberCookie})).json()).canManage,false);
user={id:'moderator',app_metadata:{sianaly_role:'admin'}};
assert.equal((await board('?post='+retainedId,{method:'DELETE'})).status,200);
assert.equal(sqlite.prepare('SELECT count(*) AS total FROM board_comments WHERE post_id = ?').get(retainedId).total,0);
const adminCallsBeforeEmail=adminCalls;
user=null;
const emailRequest=(action,body,options={})=>request(action,{method:'POST',body,overrides:{POPULAR_DB:db},...options});
const signupBody={email:' member@example.test ',password:'test-password-123',nickname:'  별명  '};
assert.equal((await emailRequest('email-signup',signupBody,{requestOrigin:'https://evil.test'})).status,403);
assert.equal((await emailRequest('email-signup',{...signupBody,email:'invalid'})).status,400);
assert.equal((await emailRequest('email-signup',{...signupBody,password:'short'})).status,400);
assert.equal((await emailRequest('email-signup',{...signupBody,nickname:'<script>'})).status,400);
assert.equal((await emailRequest('email-signup',{...signupBody,user_id:'victim'})).status,400);
const emailResponse=await emailRequest('email-signup',signupBody);
assert.equal(emailResponse.status,200);
assert.deepEqual(await emailResponse.json(),{ok:true});
assert.deepEqual(emailCall,{action:'signup',input:{email:'member@example.test',password:'test-password-123',options:{data:{sianaly_nickname:'별명'}}}});
for(const flag of ['HttpOnly','Secure','SameSite=Lax','Path=/','Max-Age=2592000'])assert.ok(emailResponse.headers.get('Set-Cookie').includes(flag),flag);
assert.equal(adminCalls,adminCallsBeforeEmail);
emailError={status:400};
assert.equal((await emailRequest('email-login',{email:'member@example.test',password:'wrong'})).status,400);
emailError=null;
assert.deepEqual(await (await emailRequest('email-login',{email:'member@example.test',password:'test-password-123'})).json(),{ok:true});
assert.equal(emailCall.action,'login');
emailHasSession=false;
assert.equal((await emailRequest('email-signup',signupBody)).status,409);
emailHasSession=true;
const attempts=await Promise.all(Array.from({length:8},()=>emailRequest('email-signup',signupBody,{ip:'192.0.2.2'})));
assert.equal(attempts.filter(r=>r.status===200).length,5);
assert.equal(attempts.filter(r=>r.status===429).length,3);
assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM member_email_attempts').all()).includes('192.0.2.'));
assert.equal((await emailRequest('email-signup',signupBody,{overrides:{POPULAR_DB:null}})).status,503);
assert.equal((await emailRequest('password-forgot',{email:'invalid'})).status,400);
assert.equal((await emailRequest('password-forgot',{email:'member@example.test',redirectTo:'https://evil.test'})).status,400);
assert.equal((await emailRequest('password-forgot',{email:'member@example.test'},{requestOrigin:'https://evil.test'})).status,403);
assert.deepEqual(await (await emailRequest('password-forgot',{email:'member@example.test'})).json(),{ok:true});
assert.deepEqual(recoveryRequest,['member@example.test',{redirectTo:origin}]);
assert.deepEqual(await (await emailRequest('password-forgot',{email:'unknown@example.test'})).json(),{ok:true});
assert.equal((await emailRequest('password-forgot',{email:'member@example.test'})).status,200);
assert.equal((await emailRequest('password-forgot',{email:'member@example.test'})).status,429);
assert.equal((await emailRequest('password-recovery',{tokenHash:'invalid'})).status,400);
assert.equal((await emailRequest('password-recovery',{tokenHash:'B'.repeat(64)})).status,400);
const verified=await emailRequest('password-recovery',{tokenHash:'A'.repeat(64)});
assert.equal(verified.status,200);assert.deepEqual(await verified.json(),{ok:true});
const recoverySetCookie=verified.headers.getSetCookie().find(cookie=>cookie.startsWith('__Host-sianaly-auth-recovery='));
for(const flag of ['HttpOnly','Secure','SameSite=Lax','Path=/','Max-Age=600'])assert.ok(recoverySetCookie.includes(flag),flag);
const recoveryCookie=recoverySetCookie.split(';',1)[0],resetBody={password:'new-test-password-123'};
assert.equal((await emailRequest('password-recovery',{tokenHash:'A'.repeat(64)})).status,400);
assert.equal((await emailRequest('password-update',resetBody)).status,409);
assert.equal((await emailRequest('password-update',resetBody,{cookie:recoveryCookie,requestOrigin:'https://evil.test'})).status,403);
assert.equal((await (await request('session',{cookie:recoveryCookie})).json()).passwordReset,true);
const recoveredUser=user;
user={...recoveredUser,id:'another-user'};
assert.equal((await emailRequest('password-update',resetBody,{cookie:recoveryCookie})).status,409);
user=recoveredUser;
assert.equal((await emailRequest('password-update',resetBody,{cookie:recoveryCookie.slice(0,-4)+'ffff'})).status,409);
handlerNow=now+600001;
assert.equal((await emailRequest('password-update',resetBody,{cookie:recoveryCookie})).status,409);
handlerNow=now;
assert.equal((await emailRequest('password-update',{password:'short'},{cookie:recoveryCookie})).status,400);
passwordError={code:'same_password'};
assert.equal((await (await emailRequest('password-update',resetBody,{cookie:recoveryCookie})).json()).code,'password_reused');
passwordError=null;
const resetResponse=await emailRequest('password-update',resetBody,{cookie:recoveryCookie});
assert.equal(resetResponse.status,200);assert.deepEqual(await resetResponse.json(),{ok:true,sessionWarning:false});
assert.deepEqual(passwordUpdate,resetBody);assert.equal(signOutScope,'global');
assert.ok(resetResponse.headers.getSetCookie().some(cookie=>cookie.startsWith('__Host-sianaly-auth-recovery=')&&cookie.includes('Max-Age=0')));
// Public signup protection: reject missing configuration/tokens before calling Auth,
// and forward valid tokens to the provider for authoritative verification.
user=null;
const captchaEnv={AUTH_CAPTCHA_REQUIRED:'true',AUTH_CAPTCHA_SITE_KEY:'public-test-site-key'};
const captchaToken='test-captcha-token',captchaEmail={email:'captcha@example.test',password:'safe-password-123',nickname:'보안테스트'};
const captchaRequest=(action,body,overrides={})=>request(action,{method:'POST',body,overrides:{...captchaEnv,...overrides},ip:'192.0.2.90'});
assert.deepEqual((await (await request('config',{overrides:captchaEnv})).json()).captcha,{required:true,siteKey:'public-test-site-key'});
for(const action of ['email-signup','email-login','password-forgot']){
 const body=action==='email-signup'?captchaEmail:action==='email-login'?{email:captchaEmail.email,password:captchaEmail.password}:{email:captchaEmail.email};
 const beforeEmail=emailCall,beforeRecovery=recoveryRequest;
 assert.equal((await captchaRequest(action,body,{AUTH_CAPTCHA_SITE_KEY:''})).status,503);
 for(const token of [undefined,'short','contains whitespace','x'.repeat(4097)]){
  assert.equal((await captchaRequest(action,{...body,...(token===undefined?{}:{captchaToken:token})})).status,400);
 }
 assert.equal(emailCall,beforeEmail);assert.equal(recoveryRequest,beforeRecovery);
 assert.equal((await captchaRequest(action,{...body,captchaToken})).status,200);
 if(action==='password-forgot')assert.deepEqual(recoveryRequest,[captchaEmail.email,{redirectTo:origin,captchaToken}]);
 else assert.equal(emailCall.input.options.captchaToken,captchaToken);
}
emailError={code:'captcha_failed'};
assert.equal((await (await captchaRequest('email-login',{email:captchaEmail.email,password:captchaEmail.password,captchaToken})).json()).code,'captcha_invalid');
emailError=null;
sqlite.close();
// Exercise the official SDK's PKCE generation and cookie adapter without a live account or network request.
const realHandler=createAccountHandler({companyKeys:keys});
const realLogin=await realHandler({request:new Request(origin+'/api/account/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({provider:'custom:naver',next:'/'})}),env,params:{action:'login'}});
assert.equal(realLogin.status,200);const realURL=new URL((await realLogin.json()).url);
assert.equal(realURL.searchParams.get('code_challenge_method'),'s256');assert.ok(realURL.searchParams.get('code_challenge'));
const realCookie=realLogin.headers.get('Set-Cookie');assert.match(realCookie,/__Host-sianaly-auth-code-verifier=/);assert.match(realCookie,/HttpOnly/);assert.match(realCookie,/Secure/);assert.match(realCookie,/Max-Age=600/);
let upstreamCalls=0;
const naverHandler=createAccountHandler({companyKeys:keys,upstreamFetch:async(url,opts)=>{upstreamCalls++;assert.equal(url,'https://openapi.naver.com/v1/nid/me');assert.equal(opts.redirect,'manual');assert.equal(opts.headers.Authorization,'Bearer test-naver-token');return Response.json({resultcode:'00',response:{id:'app-scoped-id',email:'private@example.test',name:'Private',mobile:'not-forwarded'}});}});
const naverRequest=async(path,authorization)=>naverHandler({request:new Request(origin+'/api/account/'+path,{headers:authorization?{Authorization:authorization}:{}}),env,params:{action:'naver-userinfo'}});
assert.equal((await naverRequest('naver-userinfo')).status,401);
assert.equal((await naverRequest('naver-userinfo?token=forbidden','Bearer test-naver-token')).status,401);assert.equal(upstreamCalls,0);
assert.deepEqual(await (await naverRequest('naver-userinfo','Bearer test-naver-token')).json(),{sub:'app-scoped-id'});assert.equal(upstreamCalls,1);
const redirectHandler=createAccountHandler({companyKeys:keys,upstreamFetch:async(url,opts)=>{assert.equal(opts.redirect,'manual');return Response.redirect('https://untrusted.test/',302);}});
const redirectResponse=await redirectHandler({request:new Request(origin+'/api/account/naver-userinfo',{headers:{Authorization:'Bearer test-naver-token'}}),env,params:{action:'naver-userinfo'}});
assert.equal(redirectResponse.status,401);
console.log('Member API: provider gating, PKCE cookies, safe redirects, CSRF, verified identity, private responses and deletion checks passed.');
