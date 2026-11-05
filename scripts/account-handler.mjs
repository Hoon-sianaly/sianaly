import {handleBoard} from './board-handler.mjs';
import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';

const providerNames={'custom:kakao':'카카오','custom:naver':'네이버'};
export function memberNickname(value){
 if(typeof value!=='string')return null;
 const nickname=value.normalize('NFKC').trim();
 return Array.from(nickname).length>=2&&Array.from(nickname).length<=20&&/^[\p{L}\p{N} _-]+$/u.test(nickname)?nickname:null;
}
export function safeAccountReturn(value,origin,companyKeys){
 try{const url=new URL(value||'/',origin);if(url.origin!==origin||url.username||url.password)return '/';
  if(['/','/index.html'].includes(url.pathname))return url.pathname;
  if(['/board','/board.html'].includes(url.pathname)){
   const post=url.searchParams.get('post');
   if(post && /^[1-9][0-9]{0,14}$/.test(post))return '/board.html?post='+post;
   return url.searchParams.get('write')==='1'?'/board.html?write=1':'/board.html';
  }
  if(['/company','/company.html'].includes(url.pathname)&&companyKeys.has(url.searchParams.get('company')))return url.pathname+'?company='+encodeURIComponent(url.searchParams.get('company'));
 }catch{}return '/';
}
async function bodyJSON(request,maxBytes=1024){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing body');let size=0,text='';const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw Error('Large body');}text+=decoder.decode(value,{stream:true});}
 const body=JSON.parse(text+decoder.decode());if(!body||Array.isArray(body)||typeof body!=='object')throw Error('Invalid body');return body;
}
async function allowEmailAttempt(db,request,secret,action,now){
 const signup=action==='email-signup',recovery=action==='password-forgot';
 const window=signup||recovery?3600000:900000,limit=signup?5:recovery?3:30;
 const bucket=Math.floor(now/window);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(request.headers.get('CF-Connecting-IP')||'unknown'));
 const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 await db.prepare('CREATE TABLE IF NOT EXISTS member_email_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL)').run();
 await db.prepare('DELETE FROM member_email_attempts WHERE expires_at < ?').bind(now).run();
 const result=await db.prepare('INSERT INTO member_email_attempts (key, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 WHERE attempts < ?').bind(action+':'+bucket+':'+hash,(bucket+1)*window,limit).run();
 return Boolean(result.meta.changes);
}
export function createAccountHandler({companyKeys,serverClient=createServerClient,adminClient=createClient,clock=Date.now,upstreamFetch=(...args)=>fetch(...args)}){
 const keys=new Set(companyKeys);
 return async function onRequest({request,env,params}){
  const url=new URL(request.url),action=String(params.action||''),headers=new Headers({'Cache-Control':'private, no-store','Pragma':'no-cache','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  const respond=(body,status=200)=>{headers.set('Content-Type','application/json; charset=utf-8');return new Response(JSON.stringify(body),{status,headers});};
  const redirect=(path)=>{headers.set('Location',path);return new Response(null,{status:303,headers});};
  let site;try{site=new URL(env.AUTH_SITE_URL);if(site.origin!==url.origin||site.pathname!=='/'||site.search||site.hash||site.username||site.password||(site.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(site.hostname)))throw Error('Invalid site');}catch{return respond({ready:false,code:'unavailable'},503);}
  const providers=(env.AUTH_PROVIDERS||'').split(',').map(s=>s.trim()).filter(p=>Object.hasOwn(providerNames,p));
  const ready=env.AUTH_ENABLED==='true'&&/^https:\/\//.test(env.SUPABASE_URL||'')&&Boolean(env.SUPABASE_PUBLISHABLE_KEY)&&Boolean(env.SUPABASE_SECRET_KEY);
  if(action==='config'&&request.method==='GET')return respond({ready,email:ready,providers:ready?providers.map(id=>({id,name:providerNames[id]})):[]});
  const secure=site.protocol==='https:',cookieName=secure?'__Host-sianaly-auth':'sianaly-auth';
  const boardRead=action==='board'&&request.method==='GET',mine=url.searchParams.get('mine')==='1';
  const hasSession=(request.headers.get('Cookie')||'').split(';').some(cookie=>{
   const name=cookie.trim().split('=',1)[0];
   return name===cookieName||name.startsWith(cookieName+'.');
  });
  if(boardRead&&!mine&&(!url.searchParams.has('post')||!ready||!hasSession)){
   try{return await handleBoard({db:env.POPULAR_DB,url,method:'GET',respond});}
   catch{return respond({code:'board_unavailable'},503);}
  }
  if(!ready)return respond({ready:false,code:'unavailable'},503);
  // Supabase custom OAuth expects top-level sub; Naver returns response.id.
  // Forward only to Naver's fixed HTTPS endpoint and return only the app-scoped ID.
  if(action==='naver-userinfo'){
   if(request.method!=='GET')return respond({code:'method_not_allowed'},405);
   const authorization=request.headers.get('Authorization')||'';
   if(!providers.includes('custom:naver')||url.search||authorization.length>4096||!/^Bearer [A-Za-z0-9+/_=.-]+$/i.test(authorization))return respond({code:'unauthorized'},401);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try{const response=await upstreamFetch('https://openapi.naver.com/v1/nid/me',{headers:{Authorization:authorization,Accept:'application/json'},redirect:'manual',signal:controller.signal});
    if(!response.ok)return respond({code:'unauthorized'},401);const profile=await response.json(),id=profile?.response?.id;
    if(profile.resultcode!=='00'||typeof id!=='string'||!id||id.length>255)return respond({code:'unauthorized'},401);
    return respond({sub:id});
   }catch(error){console.error('naver_userinfo_fetch_failed',error instanceof Error?error.name:'UnknownError');return respond({code:'userinfo_unavailable'},502);}finally{clearTimeout(timer);}
  }
  const methods={board:['GET','POST','PATCH','DELETE'],session:['GET'],login:['POST'],'email-signup':['POST'],'email-login':['POST'],'password-forgot':['POST'],'password-recovery':['POST'],'password-update':['POST'],callback:['GET'],logout:['POST'],favorites:['GET','POST','DELETE'],nickname:['POST'],delete:['POST']};
  if(!methods[action]?.includes(request.method))return respond({code:'method_not_allowed'},405);
  if(request.method!=='GET'&&(request.headers.get('Origin')!==site.origin||!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')))return respond({code:'forbidden'},403);
  let cookies;try{cookies=parseCookieHeader(request.headers.get('Cookie')||'');}catch{return respond({code:'invalid_session'},401);}
  const cookieOptions={path:'/',secure,httpOnly:true,sameSite:'lax',maxAge:60*60*24*30};
  function writeCookie(name,value,options={}){const final={...options,...cookieOptions};if(name.includes('code-verifier')||name===cookieName+'-recovery')final.maxAge=600;if(options.maxAge===0)final.maxAge=0;if(options.expires)final.expires=options.expires;delete final.domain;headers.append('Set-Cookie',serializeCookieHeader(name,value,final));cookies=cookies.filter(c=>c.name!==name);if(final.maxAge!==0)cookies.push({name,value});}
  function clearCookies(){for(const {name}of [...cookies])if(name===cookieName||name.startsWith(cookieName+'.')||name.startsWith(cookieName+'-'))writeCookie(name,'',{maxAge:0});}
  try{
   // A separate client per request; private cookies and API responses are never cached.
   const client=serverClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{...cookieOptions,name:cookieName},cookies:{getAll:()=>cookies,setAll:items=>{for(const c of items)writeCookie(c.name,c.value,c.options);}}});
   if(action==='password-forgot'||action==='password-recovery'){
    const body=await bodyJSON(request),forgot=action==='password-forgot';
    const email=typeof body.email==='string'?body.email.trim():'';
    if(forgot){
     if(Object.keys(body).some(key=>key!=='email')||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return respond({code:'invalid_email'},400);
    }else if(Object.keys(body).some(key=>key!=='tokenHash')||typeof body.tokenHash!=='string'||!/^[A-Za-z0-9_-]{20,256}$/.test(body.tokenHash)){
     return respond({code:'recovery_invalid'},400);
    }
    if(!env.POPULAR_DB)return respond({code:'unavailable'},503);
    if(!await allowEmailAttempt(env.POPULAR_DB,request,env.SUPABASE_SECRET_KEY,action,clock()))return respond({code:'too_many_attempts'},429);
    if(forgot){
     const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:site.origin});
     if(error)return respond({code:error.status===429?'too_many_attempts':'recovery_unavailable'},error.status===429?429:503);
     return respond({ok:true});
    }
    const {data,error}=await client.auth.verifyOtp({token_hash:body.tokenHash,type:'recovery'});
    if(error||!data?.session||!data.user?.id)return respond({code:'recovery_invalid'},400);
    const expiresAt=clock()+600000;
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SUPABASE_SECRET_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('password-recovery:'+data.user.id+':'+expiresAt));
    const proof=Array.from(new Uint8Array(signature),byte=>byte.toString(16).padStart(2,'0')).join('');
    writeCookie(cookieName+'-recovery',expiresAt+'.'+proof);
    return respond({ok:true});
   }
   if(action==='email-signup'||action==='email-login'){
    const body=await bodyJSON(request,4096),signingUp=action==='email-signup';
    const allowed=signingUp?['email','password','nickname']:['email','password'];
    const email=typeof body.email==='string'?body.email.trim():'',password=body.password;
    if(Object.keys(body).some(key=>!allowed.includes(key))||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return respond({code:'invalid_email'},400);
    if(typeof password!=='string'||password.length>128||password.length<(signingUp?10:1))return respond({code:'invalid_password'},400);
    const nickname=signingUp?memberNickname(body.nickname):null;
    if(signingUp&&!nickname)return respond({code:'invalid_nickname'},400);
    if(!env.POPULAR_DB)return respond({code:'unavailable'},503);
    if(!await allowEmailAttempt(env.POPULAR_DB,request,env.SUPABASE_SECRET_KEY,action,clock()))return respond({code:'too_many_attempts'},429);
    const result=signingUp
     ?await client.auth.signUp({email,password,options:{data:{sianaly_nickname:nickname}}})
     :await client.auth.signInWithPassword({email,password});
    if(result.error){
     if(result.error.status===429)return respond({code:'too_many_attempts'},429);
     return respond({code:signingUp?'email_signup_failed':'email_login_failed'},400);
    }
    if(!result.data?.session)return respond({code:'email_confirmation_required'},409);
    return respond({ok:true});
   }
   if(action==='login'){
    const body=await bodyJSON(request);if(Object.keys(body).some(k=>!['provider','next'].includes(k))||!providers.includes(body.provider))return respond({code:'invalid_provider'},400);
    const next=safeAccountReturn(body.next,site.origin,keys);
    const {data,error}=await client.auth.signInWithOAuth({provider:body.provider,options:{redirectTo:site.origin+'/api/account/callback?next='+encodeURIComponent(next)}});
    if(error||!data?.url)return respond({code:'login_failed'},502);
    const target=new URL(data.url);if(target.origin!==new URL(env.SUPABASE_URL).origin||target.pathname!=='/auth/v1/authorize')return respond({code:'login_failed'},502);
    return respond({url:data.url});
   }
   if(action==='callback'){
    const code=url.searchParams.get('code');if(!code||code.length>2048||url.searchParams.has('error'))return redirect('/?accountError=login_failed');
    const {error}=await client.auth.exchangeCodeForSession(code);if(error)return redirect('/?accountError=login_failed');
    return redirect(safeAccountReturn(url.searchParams.get('next'),site.origin,keys));
   }
   const {data,error}=await client.auth.getUser();const user=error?null:data?.user;
   const proof=cookies.find(cookie=>cookie.name===cookieName+'-recovery')?.value;
   const passwordReset=Boolean(user&&await validRecoveryProof(proof,env.SUPABASE_SECRET_KEY,user.id,clock()));
   if(action==='session')return respond({signedIn:Boolean(user),provider:user?({...providerNames,email:'이메일',google:'Google'})[user.app_metadata?.provider]||'소셜 계정':null,nickname:user?memberNickname(user.user_metadata?.sianaly_nickname)||'':null,...(passwordReset?{passwordReset:true}:{})});
   if(action==='logout'){
    await client.auth.signOut({scope:'local'});clearCookies();return respond({ok:true});
   }
   if(!user&&!(boardRead&&!mine))return respond({code:'login_required'},401);
   if(action==='password-update'){
    if(!passwordReset)return respond({code:'recovery_required'},409);
    const body=await bodyJSON(request);
    if(Object.keys(body).some(key=>key!=='password')||typeof body.password!=='string'||body.password.length<10||body.password.length>128)return respond({code:'invalid_password'},400);
    const {error}=await client.auth.updateUser({password:body.password});
    if(error)return respond({code:error.code==='same_password'?'password_reused':'password_update_failed'},400);
    let sessionWarning=false;
    try{const {error}=await client.auth.signOut({scope:'global'});sessionWarning=Boolean(error);}catch{sessionWarning=true;}
    clearCookies();
    return respond({ok:true,sessionWarning});
   }
   if(action==='board')return await handleBoard({db:env.POPULAR_DB,url,method:request.method,user,nickname:memberNickname(user?.user_metadata?.sianaly_nickname),readBody:()=>bodyJSON(request,16384),respond});
   if(action==='nickname'){
    const body=await bodyJSON(request),nickname=memberNickname(body.nickname);
    if(Object.keys(body).some(k=>k!=='nickname')||nickname===null)return respond({code:'invalid_nickname'},400);
    const {error}=await client.auth.updateUser({data:{sianaly_nickname:nickname}});
    return error?respond({code:'nickname_unavailable'},503):respond({nickname});
   }
   if(action==='favorites'){
    // Always use the user's client. Never use the admin key to read or write favorites.
    if(request.method==='GET'){
     const {data:rows,error}=await client.from('sianaly_favorites').select('company_key,created_at').order('created_at',{ascending:false}).limit(keys.size);
     if(error)return respond({code:'favorites_unavailable'},503);
     return respond({companies:(rows||[]).filter(row=>keys.has(row.company_key)).map(row=>({key:row.company_key,createdAt:row.created_at}))});
    }
    if(request.method==='POST'&&!memberNickname(user.user_metadata?.sianaly_nickname))return respond({code:'nickname_required'},409);
    const body=await bodyJSON(request);if(Object.keys(body).some(k=>k!=='company')||!keys.has(body.company))return respond({code:'invalid_company'},400);
    const result=request.method==='POST'?await client.from('sianaly_favorites').upsert({user_id:user.id,company_key:body.company},{onConflict:'user_id,company_key',ignoreDuplicates:true}):await client.from('sianaly_favorites').delete().eq('user_id',user.id).eq('company_key',body.company);
    return result.error?respond({code:'favorites_unavailable'},503):respond({ok:true});
   }
   if(action==='delete'){
    const body=await bodyJSON(request);if(Object.keys(body).some(k=>k!=='confirmation')||body.confirmation!=='회원탈퇴')return respond({code:'confirmation_required'},400);
    const signedInAt=Date.parse(user.last_sign_in_at);if(!Number.isFinite(signedInAt)||signedInAt<clock()-600000||signedInAt>clock()+60000)return respond({code:'reauth_required'},409);
    const admin=adminClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {error}=await admin.auth.admin.deleteUser(user.id);if(error)return respond({code:'delete_failed'},503);
    clearCookies();return respond({ok:true});
   }
  }catch{return action==='callback'?redirect('/?accountError=login_failed'):respond({code:'unavailable'},503);}
 };
}
async function validRecoveryProof(proof,secret,userId,now){
 if(typeof proof!=='string'||!/^\d{13}\.[a-f0-9]{64}$/.test(proof))return false;
 const [expires,signature]=proof.split('.'),expiresAt=Number(expires);
 if(expiresAt<=now||expiresAt>now+600000)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.match(/../g),byte=>parseInt(byte,16));
 return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode('password-recovery:'+userId+':'+expiresAt));
}
