(function(){
 'use strict';
 const root=document.getElementById('homePopular');if(!root)return;
 const list=root.querySelector('.popular-list'),status=root.querySelector('.popular-status');
 let busy=false,hasRanking=false;
 function message(text){if(!hasRanking){list.replaceChildren();status.textContent=text;status.hidden=false;}}
 async function refresh(){
  if(busy||document.visibilityState==='hidden')return;busy=true;
  try{
   const [catalog,response]=await Promise.all([loadCompanyCatalog(),fetch('/api/popular',{credentials:'omit',signal:AbortSignal.timeout(10000)})]);
   if(!response.ok)throw Error('Unavailable');const data=await response.json();
   if(data.status!=='ready'||data.windowHours!==24||!Array.isArray(data.companies))throw Error('Invalid ranking');
   const byKey=new Map(catalog.companies.map(c=>[c.key,c])),seen=new Set();
   const ranking=data.companies.filter(r=>r&&byKey.has(r.key)&&Number.isSafeInteger(r.views)&&r.views>0&&!seen.has(r.key)&&seen.add(r.key)).slice(0,5);
   const items=ranking.map((row,index)=>{
    const company=byKey.get(row.key),li=document.createElement('li'),link=document.createElement('a'),rank=document.createElement('span'),name=document.createElement('span');
    link.href='company.html?company='+encodeURIComponent(company.key);link.setAttribute('aria-label',`${index+1}위 ${company.name}`);
    rank.className='popular-rank';rank.textContent=index+1;rank.setAttribute('aria-hidden','true');name.textContent=company.name;
    link.append(rank,name);li.append(link);return li;
   });
   list.replaceChildren(...items);hasRanking=Boolean(items.length);status.hidden=hasRanking;
   if(!hasRanking)status.textContent='조회수가 쌓이면 인기 기업 표시';
  }catch{message('인기 기업 집계 준비 중');}finally{busy=false;}
 }
 refresh();setInterval(refresh,300000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
})();
