import assert from 'node:assert/strict';
import {createAccountHandler,safeAccountReturn,memberNickname} from './account-handler.mjs';
const origin='https://dev.sianaly.com',now=Date.now();
const env={AUTH_SITE_URL:origin,AUTH_ENABLED:'true',AUTH_PROVIDERS:'google,custom:kakao,custom:naver',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-public',SUPABASE_SECRET_KEY:'test-server-only'};
const keys=new Set(['samsung','naver']);
for(const value of ['https://evil.test','//evil.test','javascript:alert(1)','/unknown','/company?company=missing'])assert.equal(safeAccountReturn(value,origin,keys),'/');
assert.equal(safeAccountReturn('/company?company=samsung&extra=1#x',origin,keys),'/company?company=samsung');
let user=null,options,insert,removed,deleted,adminCalls=0,exchanged,nicknameUpdate;
const handler=createAccountHandler({companyKeys:keys,clock:()=>now,serverClient:(url,key,opts)=>{
 assert.equal(key,env.SUPABASE_PUBLISHABLE_KEY);options=opts;
 return {auth:{getUser:async()=>({data:{user},error:null}),signInWithOAuth:async args=>{
  assert.equal(args.options.redirectTo,origin+'/api/account/callback?next=%2F');
  opts.cookies.setAll([{name:'__Host-sianaly-auth-code-verifier',value:'test-verifier',options:{domain:'.evil.test',httpOnly:false,secure:false,sameSite:'none'}}]);
  return {data:{url:env.SUPABASE_URL+'/auth/v1/authorize?provider='+args.provider}};
 },exchangeCodeForSession:async code=>{exchanged=code;return {};},signOut:async()=>({}),updateUser:async data=>{nicknameUpdate=data;return {}; }},from:table=>{
  assert.equal(table,'sianaly_favorites');return {
   select:()=>({order:()=>({limit:async()=>({data:[{company_key:'samsung',created_at:'today'},{company_key:'invalid',created_at:'today'}]})})}),
   upsert:async(row,settings)=>{insert={row,settings};return {};},
   delete:()=>({eq:(field,id)=>({eq:async(field2,key)=>{removed={field,id,field2,key};return {};}})})
  };
 }};
},adminClient:(url,key,opts)=>{adminCalls++;assert.equal(key,env.SUPABASE_SECRET_KEY);assert.equal(opts.auth.persistSession,false);return {auth:{admin:{deleteUser:async id=>{deleted=id;return {};}}}};}});
async function request(action,{method='GET',body,requestOrigin=origin,cookie,overrides={}}={}){
 const headers={};if(method!=='GET'){headers.Origin=requestOrigin;headers['Content-Type']='application/json';}if(cookie)headers.Cookie=cookie;
 const response=await handler({request:new Request(origin+'/api/account/'+action,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})}),env:{...env,...overrides},params:{action:action.split('?')[0]}});
 assert.match(response.headers.get('Cache-Control'),/no-store/);return response;
}
assert.equal((await request('config',{overrides:{AUTH_ENABLED:'false'}})).status,200);
assert.equal((await (await request('config')).json()).providers.length,3);
assert.equal((await request('session',{overrides:{AUTH_SITE_URL:'https://evil.test'}})).status,503);
assert.equal((await request('favorites')).status,401);
assert.equal((await request('nickname',{method:'POST',body:{nickname:'별명'}})).status,401);
assert.equal((await request('login',{method:'POST',body:{provider:'google'},requestOrigin:'https://evil.test'})).status,403);
assert.equal((await request('login',{method:'POST',body:{provider:'unknown'}})).status,400);
let response=await request('login',{method:'POST',body:{provider:'google',next:'https://evil.test'}});
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
// Exercise the official SDK's PKCE generation and cookie adapter without a live account or network request.
const realHandler=createAccountHandler({companyKeys:keys});
const realLogin=await realHandler({request:new Request(origin+'/api/account/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({provider:'google',next:'/'})}),env,params:{action:'login'}});
assert.equal(realLogin.status,200);const realURL=new URL((await realLogin.json()).url);
assert.equal(realURL.searchParams.get('code_challenge_method'),'s256');assert.ok(realURL.searchParams.get('code_challenge'));
const realCookie=realLogin.headers.get('Set-Cookie');assert.match(realCookie,/__Host-sianaly-auth-code-verifier=/);assert.match(realCookie,/HttpOnly/);assert.match(realCookie,/Secure/);assert.match(realCookie,/Max-Age=600/);
let upstreamCalls=0;
const naverHandler=createAccountHandler({companyKeys:keys,upstreamFetch:async(url,opts)=>{upstreamCalls++;assert.equal(url,'https://openapi.naver.com/v1/nid/me');assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer test-naver-token');return Response.json({resultcode:'00',response:{id:'app-scoped-id',email:'private@example.test',name:'Private',mobile:'not-forwarded'}});}});
const naverRequest=async(path,authorization)=>naverHandler({request:new Request(origin+'/api/account/'+path,{headers:authorization?{Authorization:authorization}:{}}),env,params:{action:'naver-userinfo'}});
assert.equal((await naverRequest('naver-userinfo')).status,401);
assert.equal((await naverRequest('naver-userinfo?token=forbidden','Bearer test-naver-token')).status,401);assert.equal(upstreamCalls,0);
assert.deepEqual(await (await naverRequest('naver-userinfo','Bearer test-naver-token')).json(),{sub:'app-scoped-id'});assert.equal(upstreamCalls,1);
console.log('Member API: provider gating, PKCE cookies, safe redirects, CSRF, verified identity, private responses and deletion checks passed.');
