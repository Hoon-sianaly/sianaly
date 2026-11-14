(function(){
 'use strict';
 const root=document.getElementById('homePopular');if(!root)return;
 const list=root.querySelector('.popular-list'),status=root.querySelector('.popular-status'),period=root.querySelector('.popular-period');
 // Until a few companies have views, show the largest companies instead of an empty box, labelled as such.
 const MIN_RANKED=3,FALLBACK_LABEL='시가총액 상위',RANKING_LABEL='최근 24시간';
 let busy=false,hasRanking=false;
 function renderList(companies,labelFor){
  return companies.map((company,index)=>{
   const li=document.createElement('li'),link=document.createElement('a'),rank=document.createElement('span'),name=document.createElement('span');
   link.href='/company?company='+encodeURIComponent(company.key);link.setAttribute('aria-label',labelFor(index,company));
   rank.className='popular-rank';rank.textContent=index+1;rank.setAttribute('aria-hidden','true');name.textContent=company.name;
   link.append(rank,name);li.append(link);return li;
  });
 }
 function showFallback(catalog){
  // The catalog lists KOSPI by market-cap rank; preferred shares share their issuer's results, so skip them.
  const top=catalog.companies.filter(c=>c.market==='KOSPI'&&!/pref$/.test(c.key)).slice(0,5);
  if(!top.length)return false;
  list.replaceChildren(...renderList(top,(index,company)=>`시가총액 ${index+1}위 ${company.name}`));
  if(period)period.textContent=FALLBACK_LABEL;
  status.textContent='조회 기록이 쌓이기 전이라 시가총액 상위 기업을 보여드려요';status.hidden=false;
  return true;
 }
 async function refresh(){
  if(busy||document.visibilityState==='hidden')return;busy=true;
  let catalog;
  try{
   const timeout=typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(10000):undefined;
   const [loaded,response]=await Promise.all([loadCompanyCatalog(),fetch('/api/popular',{credentials:'omit',signal:timeout})]);
   catalog=loaded;
   if(!response.ok)throw Error('Unavailable');const data=await response.json();
   if(data.status!=='ready'||data.windowHours!==24||!Array.isArray(data.companies))throw Error('Invalid ranking');
   const byKey=new Map(catalog.companies.map(c=>[c.key,c])),seen=new Set();
   const ranking=data.companies.filter(r=>r&&byKey.has(r.key)&&Number.isSafeInteger(r.views)&&r.views>0&&!seen.has(r.key)&&seen.add(r.key)).slice(0,5);
   if(ranking.length>=MIN_RANKED){
    list.replaceChildren(...renderList(ranking.map(row=>byKey.get(row.key)),(index,company)=>`${index+1}위 ${company.name}`));
    if(period)period.textContent=RANKING_LABEL;
    hasRanking=true;status.hidden=true;
   }else if(!hasRanking&&!showFallback(catalog)){
    list.replaceChildren(...renderList(ranking.map(row=>byKey.get(row.key)),(index,company)=>`${index+1}위 ${company.name}`));
    status.textContent='조회수가 쌓이면 인기 기업 표시';status.hidden=Boolean(ranking.length);
   }
  }catch{
   if(!hasRanking){
    try{catalog??=await loadCompanyCatalog();}catch{}
    if(!catalog||!showFallback(catalog)){list.replaceChildren();status.textContent='인기 기업 집계 준비 중';status.hidden=false;}
   }
  }finally{busy=false;}
 }
 refresh();setInterval(refresh,300000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
})();
