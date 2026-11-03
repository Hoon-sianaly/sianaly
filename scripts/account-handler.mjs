import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';

const providerNames={google:'Google',kakao:'카카오','custom:kakao':'카카오','custom:naver':'네이버'};
export function memberNickname(value){
 if(typeof value!=='string')return null;
 const nickname=value.normalize('NFKC').trim();
 return Array.from(nickname).length>=2&&Array.from(nickname).length<=20&&/^[\p{L}\p{N} _-]+$/u.test(nickname)?nickname:null;
}
export function safeAccountReturn(value,origin,companyKeys){
 try{const url=new URL(value||'/',origin);if(url.origin!==origin||url.username||url.password)return '/';
  if(['/','/index.html'].includes(url.pathname))return url.pathname;
  if(['/company','/company.html'].includes(url.pathname)&&companyKeys.has(url.searchParams.get('company')))return url.pathname+'?company='+encodeURIComponent(url.searchParams.get('company'));
 }catch{}return '/';
}
async function bodyJSON(request){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing body');let size=0,text='';const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();throw Error('Large body');}text+=decoder.decode(value,{stream:true});}
 const body=JSON.parse(text+decoder.decode());if(!body||Array.isArray(body)||typeof body!=='object')throw Error('Invalid body');return body;
}
export function createAccountHandler({companyKeys,serverClient=createServerClient,adminClient=createClient,clock=Date.now,upstreamFetch=(...args)=>fetch(...args)}){
 const keys=new Set(companyKeys);
 return async function onRequest({request,env,params}){
  const url=new URL(request.url),action=String(params.action||''),headers=new Headers({'Cache-Control':'private, no-store','Pragma':'no-cache','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  const respond=(body,status=200)=>{headers.set('Content-Type','application/json; charset=utf-8');return new Response(JSON.stringify(body),{status,headers});};
  const redirect=(path)=>{headers.set('Location',path);return new Response(null,{status:303,headers});};
  let site;try{site=new URL(env.AUTH_SITE_URL);if(site.origin!==url.origin||site.pathname!=='/'||site.search||site.hash||site.username||site.password||(site.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(site.hostname)))throw Error('Invalid site');}catch{return respond({ready:false,code:'unavailable'},503);}
  const providers=(env.AUTH_PROVIDERS||'').split(',').map(s=>s.trim()).filter(p=>Object.hasOwn(providerNames,p));
  const ready=env.AUTH_ENABLED==='true'&&/^https:\/\//.test(env.SUPABASE_URL||'')&&Boolean(env.SUPABASE_PUBLISHABLE_KEY)&&Boolean(env.SUPABASE_SECRET_KEY)&&providers.length>0;
  if(action==='config'&&request.method==='GET')return respond({ready,providers:ready?providers.map(id=>({id,name:providerNames[id]})):[]});
  if(!ready)return respond({ready:false,code:'unavailable'},503);
  // Supabase custom OAuth expects top-level sub; Naver returns response.id.
  // Forward only to Naver's fixed HTTPS endpoint and return only the app-scoped ID.
  if(action==='naver-userinfo'){
   if(request.method!=='GET')return respond({code:'method_not_allowed'},405);
   const authorization=request.headers.get('Authorization')||'';
   if(!providers.includes('custom:naver')||url.search||authorization.length>4096||!/^Bearer [A-Za-z0-9+/_=.-]+$/i.test(authorization))return respond({code:'unauthorized'},401);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try{const response=await upstreamFetch('https://openapi.naver.com/v1/nid/me',{headers:{Authorization:authorization,Accept:'application/json'},redirect:'error',signal:controller.signal});
    if(!response.ok)return respond({code:'unauthorized'},401);const profile=await response.json(),id=profile?.response?.id;
    if(profile.resultcode!=='00'||typeof id!=='string'||!id||id.length>255)return respond({code:'unauthorized'},401);
    return respond({sub:id});
   }catch(error){console.error('naver_userinfo_fetch_failed',error instanceof Error?error.name:'UnknownError');return respond({code:'userinfo_unavailable'},502);}finally{clearTimeout(timer);}
  }
  const methods={session:['GET'],login:['POST'],callback:['GET'],logout:['POST'],favorites:['GET','POST','DELETE'],nickname:['POST'],delete:['POST']};
  if(!methods[action]?.includes(request.method))return respond({code:'method_not_allowed'},405);
  if(request.method!=='GET'&&(request.headers.get('Origin')!==site.origin||!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')))return respond({code:'forbidden'},403);
  const secure=site.protocol==='https:',cookieName=secure?'__Host-sianaly-auth':'sianaly-auth';
  let cookies;try{cookies=parseCookieHeader(request.headers.get('Cookie')||'');}catch{return respond({code:'invalid_session'},401);}
  const cookieOptions={path:'/',secure,httpOnly:true,sameSite:'lax',maxAge:60*60*24*30};
  function writeCookie(name,value,options={}){const final={...options,...cookieOptions};if(name.includes('code-verifier'))final.maxAge=600;if(options.maxAge===0)final.maxAge=0;if(options.expires)final.expires=options.expires;delete final.domain;headers.append('Set-Cookie',serializeCookieHeader(name,value,final));cookies=cookies.filter(c=>c.name!==name);if(final.maxAge!==0)cookies.push({name,value});}
  function clearCookies(){for(const {name}of [...cookies])if(name===cookieName||name.startsWith(cookieName+'.')||name.startsWith(cookieName+'-'))writeCookie(name,'',{maxAge:0});}
  try{
   // A separate client per request; private cookies and API responses are never cached.
   const client=serverClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{...cookieOptions,name:cookieName},cookies:{getAll:()=>cookies,setAll:items=>{for(const c of items)writeCookie(c.name,c.value,c.options);}}});
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
   if(action==='session')return respond({signedIn:Boolean(user),provider:user?providerNames[user.app_metadata?.provider]||'소셜 계정':null,nickname:user?memberNickname(user.user_metadata?.sianaly_nickname)||'':null});
   if(action==='logout'){
    await client.auth.signOut({scope:'local'});clearCookies();return respond({ok:true});
   }
   if(!user)return respond({code:'login_required'},401);
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
