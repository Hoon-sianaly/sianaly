// Home: 공시 요약 (latest DART updates, data/dart-updates.json) and 커뮤니티 (newest public board posts).
(function initHomeFeed(){
 'use strict';
 const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const dayKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
 const monthDay=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(new Date(value));
 const metricNames={sales:'매출',op:'영업이익',net:'순이익'};

 // 공시 요약: every update published on the latest update's day (KST), largest companies first.
 const notices=document.getElementById('homeNotices');
 if(notices&&typeof loadCompanyCatalog==='function'){
  const body=notices.querySelector('.feed-body'),badge=notices.querySelector('.feed-badge');
  const feed=fetch('data/dart-updates.json',{cache:'no-cache'}).then(response=>{if(!response.ok)throw Error('feed');return response.json();});
  const trends=typeof readCompanyJSON==='function'?readCompanyJSON('data/company-trends.json').then(data=>data.companies).catch(()=>({})):Promise.resolve({});
  Promise.all([feed,loadCompanyCatalog(),trends]).then(([data,catalog,trendByKey])=>{
   const updates=Array.isArray(data.updates)?data.updates:[],latest=updates[0];
   if(!latest){body.innerHTML='<p class="feed-empty">최근 반영된 공시가 없어요.</p>';return;}
   const day=dayKey(latest.publishedAt),today=day===dayKey(Date.now());
   const merged=new Map();
   for(const update of updates.filter(u=>dayKey(u.publishedAt)===day))for(const company of update.companies||[])if(!merged.has(company.key))merged.set(company.key,company);
   const order=new Map(catalog.companies.map((c,i)=>[c.key,i]));
   const companies=[...merged.values()].filter(c=>order.has(c.key)).sort((a,b)=>order.get(a.key)-order.get(b.key));
   const preliminary=companies.filter(c=>c.periods.some(p=>p.preliminary)).length;
   badge.textContent=today?'오늘':monthDay(latest.publishedAt);
   const period=p=>`${p.year}년 ${p.quarter?p.quarter+'분기':'연간'}${p.preliminary?' 잠정':''} · ${p.fields.map(f=>metricNames[f]).filter(Boolean).join('·')||'출처 갱신'}`;
   const side=company=>{
    const p=company.periods[0],t=trendByKey[company.key];
    if(!p||!t||t.year!==p.year||t.quarter!==p.quarter)return '';
    const tone=/^[+]|흑자|축소/.test(t.text)?'up':/^-|적자 전환|확대/.test(t.text)?'down':'';
    return `<span class="feed-side ${tone}">${esc(t.text)}<small>${esc(t.label)} 전년 대비</small></span>`;
   };
   body.innerHTML=`<p class="feed-sub"><b>${companies.length.toLocaleString('ko-KR')}개 기업</b>의 실적이 ${today?'오늘':esc(monthDay(latest.publishedAt))} 공시로 새로 반영됐어요${preliminary?` · 잠정실적 ${preliminary.toLocaleString('ko-KR')}곳`:''}</p>`+
    `<ul class="feed-list">${companies.slice(0,5).map(c=>`<li><a href="company.html?company=${encodeURIComponent(c.key)}"><span class="feed-main"><b>${esc(c.name)}</b><small>${esc(period(c.periods[0]))}</small></span>${side(c)}</a></li>`).join('')}</ul>`;
  }).catch(()=>{body.innerHTML='<p class="feed-empty">공시 요약을 불러오지 못했어요. <a href="/board#board-notices">공시 업데이트 보기</a></p>';});
 }

 // 커뮤니티: newest public posts. ?public=1 makes the server serve the anonymous list even for a signed-in visitor.
 const community=document.getElementById('homeCommunity');
 if(community){
  const body=community.querySelector('.feed-body');
  const ago=ms=>{const minutes=Math.floor((Date.now()-ms)/60000);if(minutes<1)return '방금';if(minutes<60)return minutes+'분 전';if(minutes<1440)return Math.floor(minutes/60)+'시간 전';return monthDay(ms);};
  const timeout=typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(10000):undefined;
  fetch('/api/account/board?public=1',{credentials:'same-origin',cache:'no-store',signal:timeout}).then(response=>{if(!response.ok)throw Error('board');return response.json();}).then(data=>{
   const posts=(Array.isArray(data.posts)?data.posts:[]).filter(p=>Number.isSafeInteger(p.id)&&typeof p.title==='string').slice(0,5);
   if(!posts.length){body.innerHTML='<p class="feed-empty">아직 글이 없어요. <a href="/board?write=1">첫 글 남기기</a></p>';return;}
   body.innerHTML=`<ul class="feed-list">${posts.map(p=>`<li><a href="/board?post=${p.id}"><span class="feed-main"><b>${esc(p.title)}</b><small>${esc(p.author||'회원')} · ${esc(ago(p.created_at))}${p.views?` · 조회 ${Number(p.views).toLocaleString('ko-KR')}`:''}</small></span>${p.recommendations?`<span class="feed-side">추천 ${Number(p.recommendations).toLocaleString('ko-KR')}</span>`:''}</a></li>`).join('')}</ul>`;
  }).catch(()=>{body.innerHTML='<p class="feed-empty">커뮤니티 글을 불러오지 못했어요. <a href="/board">커뮤니티로 가기</a></p>';});
 }
})();
