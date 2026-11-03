// Anonymous page views, not unique users. A session counts a company at most once per 30 minutes.
(function(scope){
 'use strict';
 const inFlight=new Set();
 async function recordCompanyView(key){
  if(typeof key!=='string'||inFlight.has(key)||typeof globalThis.crypto?.randomUUID!=='function')return;
  const storageKey='sianalyPopular:'+key,now=Date.now();let previous;
  try{previous=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
  if(previous?.recordedAt>now-1800000)return;
  inFlight.add(key);
  const eventId=previous?.eventId&&!previous.recordedAt&&previous.createdAt>now-1800000?previous.eventId:crypto.randomUUID();
  try{sessionStorage.setItem(storageKey,JSON.stringify({eventId,createdAt:now}));}catch{}
  try{
   for(let attempt=0;attempt<2;attempt++){
    try{
     const response=await fetch('/api/popular',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({company:key,eventId}),signal:AbortSignal.timeout(10000)});
     if(response.ok){try{sessionStorage.setItem(storageKey,JSON.stringify({recordedAt:Date.now()}));}catch{}return;}
     if(response.status<500)return;
    }catch{}
   }
  }finally{inFlight.delete(key);}
 }
 function scheduleCompanyView(key){
  function schedule(){setTimeout(()=>{if(document.visibilityState==='visible')recordCompanyView(key);},1500);}
  if(document.visibilityState==='visible')schedule();
  else{const visible=()=>{if(document.visibilityState==='visible'){document.removeEventListener('visibilitychange',visible);schedule();}};document.addEventListener('visibilitychange',visible);}
 }
 Object.assign(scope,{scheduleCompanyView});
})(globalThis);
