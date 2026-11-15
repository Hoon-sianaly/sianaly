// Side-by-side view of two companies' official figures: /compare?a=<key>&b=<key>.
// buildComparison() is pure (no DOM) so scripts/test-compare.cjs can run it for every company.
const COMPARE_PAGE=(()=>{
 const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const marketName=market=>market==='KOSDAQ'?'코스닥':'코스피';
 const industryOf=key=>(typeof COMPANY_INDUSTRIES!=='undefined'&&COMPANY_INDUSTRIES[key])||'기타';
 const periodName=row=>row.periodLabel||(row.quarter?`${row.year}년 ${row.quarter}분기`:`${row.year}년`)+(row.disclosureStatus==='preliminary'?' (잠정)':'');

 // Same wording as metricChange() in company.html.
 function metricChange(current,previous,profit){
  if(!Number.isFinite(current)||!Number.isFinite(previous))return null;
  if(profit){
   if(previous<0&&current>0)return '흑자 전환';
   if(previous>0&&current<0)return '적자 전환';
   if(previous<0&&current<0)return current>previous?'적자 축소':current<previous?'적자 확대':'적자 동일';
   if(previous<0&&current===0)return '손익분기';
  }
  if(previous===0)return null;
  const rounded=Math.round((current-previous)/Math.abs(previous)*1000)/10;
  return `${rounded>0?'+':''}${rounded.toFixed(1)}%`;
 }
 const tone=text=>/^\+|흑자|축소/.test(text)?'up':/^-|적자 전환|확대/.test(text)?'down':'flat';

 // The figures one company contributes to the table.
 function summarize(c){
  const awaiting=c.financialAvailability?.status==='awaiting-first-report';
  const labels={sales:c.financialMetrics.sales.label,op:c.financialMetrics.op.label};
  const profit=/이익|손익/.test(labels.op);
  const annual=c.annual.filter(row=>Number.isFinite(row.sales)||Number.isFinite(row.op));
  const latestAnnual=awaiting?null:annual.at(-1)||null;
  const previousAnnual=latestAnnual?annual.find(row=>row.year===latestAnnual.year-1)||null:null;
  const latestQuarter=awaiting?null:c.latestQuarter||null;
  const priorQuarter=latestQuarter?c.allQuarters.find(row=>row.year===latestQuarter.year-1&&row.quarter===latestQuarter.quarter)||null:null;
  const ordinary=labels.sales==='매출'&&labels.op==='영업이익';
  return {c,awaiting,labels,profit,ordinary,latestAnnual,previousAnnual,latestQuarter,priorQuarter,
   comparableAnnual:latestAnnual?.comparableToPrevious!==false,comparableQuarter:latestQuarter?.comparableToPrevious!==false};
 }

 function money(s,value){return Number.isFinite(value)?formatFinancialHighlight(value,s.c.financialCurrency):'-';}
 function cell(s,field,row,extra=''){
  const label=s.labels[field],standard=field==='sales'?'매출':'영업이익';
  return `<strong>${row?money(s,row[field]):'-'}</strong>${label!==standard?`<small class="cmp-metric">${esc(label)}</small>`:''}${extra}`;
 }
 function changeCell(s,field,current,previous,comparable){
  const text=comparable?metricChange(current?.[field],previous?.[field],field==='op'&&s.profit):null;
  return text?`<span class="cmp-change cmp-${tone(text)}">${esc(text)}</span>`:'<span class="cmp-change cmp-none">비교 자료 없음</span>';
 }
 // Bars only when both numbers share a currency and metric, so lengths mean the same thing.
 function bars(sa,sb,field,ra,rb){
  const va=ra?.[field],vb=rb?.[field];
  if(sa.c.financialCurrency!==sb.c.financialCurrency||sa.labels[field]!==sb.labels[field]||!(va>0)||!(vb>0))return ['',''];
  const max=Math.max(va,vb);
  return [va,vb].map(v=>`<span class="cmp-bar" aria-hidden="true"><i style="width:${Math.max(2,Math.round(v/max*100))}%"></i></span>`);
 }
 const row=(label,a,b,note='')=>`<div class="cmp-row"><div class="cmp-label">${label}${note?`<small>${note}</small>`:''}</div><div class="cmp-cell">${a}</div><div class="cmp-cell">${b}</div></div>`;

 function head(s){
  const c=s.c;
  return `<div class="cmp-company"><span class="cmp-tag">${esc(c.ticker)} · ${esc(marketName(c.market))} · ${esc(industryOf(c.key))}</span><h2>${esc(c.name)}</h2><p>${esc(c.short||'')}</p><a href="/company?company=${encodeURIComponent(c.key)}">기업 분석 보기 ›</a></div>`;
 }

 function buildComparison(a,b){
  const sa=summarize(a),sb=summarize(b),parts=[];
  parts.push(`<div class="cmp-row cmp-heads"><div class="cmp-label"></div><div class="cmp-cell">${head(sa)}</div><div class="cmp-cell">${head(sb)}</div></div>`);
  const awaitingCell=s=>`<span class="cmp-none">${esc(s.c.financialAvailability?.reason||'첫 정기 실적 공시 대기')}</span>`;

  // Latest annual figures.
  const annualPeriod=s=>s.latestAnnual?`${esc(s.c.annualPeriodLabel||s.latestAnnual.year)}${s.c.annualTerm&&s.c.annualTerm!=='연간'?` ${esc(s.c.annualTerm)}`:''}`:'-';
  parts.push('<h3 class="cmp-section">최근 연간 실적</h3>');
  parts.push(row('기간',sa.awaiting?awaitingCell(sa):annualPeriod(sa),sb.awaiting?awaitingCell(sb):annualPeriod(sb)));
  for(const field of ['sales','op']){
   const [ba,bb]=bars(sa,sb,field,sa.latestAnnual,sb.latestAnnual);
   parts.push(row(field==='sales'?'매출':'영업이익',cell(sa,field,sa.latestAnnual,ba),cell(sb,field,sb.latestAnnual,bb)));
   parts.push(row(`${field==='sales'?'매출':'영업이익'} 증감`,changeCell(sa,field,sa.latestAnnual,sa.previousAnnual,sa.comparableAnnual),changeCell(sb,field,sb.latestAnnual,sb.previousAnnual,sb.comparableAnnual),'전년 대비'));
  }
  const margin=s=>s.ordinary&&s.latestAnnual?.sales>0&&Number.isFinite(s.latestAnnual?.op)?`<strong>${(s.latestAnnual.op/s.latestAnnual.sales*100).toFixed(1)}%</strong>`:'<span class="cmp-none">산출하지 않음</span>';
  parts.push(row('영업이익률',margin(sa),margin(sb),'영업이익 ÷ 매출'));

  // Latest quarter.
  parts.push('<h3 class="cmp-section">최근 분기 실적</h3>');
  const quarterPeriod=s=>s.latestQuarter?esc(periodName(s.latestQuarter)):'<span class="cmp-none">분기 자료 없음</span>';
  parts.push(row('기간',sa.awaiting?awaitingCell(sa):quarterPeriod(sa),sb.awaiting?awaitingCell(sb):quarterPeriod(sb)));
  for(const field of ['sales','op']){
   const [ba,bb]=bars(sa,sb,field,sa.latestQuarter,sb.latestQuarter);
   parts.push(row(field==='sales'?'매출':'영업이익',cell(sa,field,sa.latestQuarter,ba),cell(sb,field,sb.latestQuarter,bb)));
   parts.push(row(`${field==='sales'?'매출':'영업이익'} 증감`,changeCell(sa,field,sa.latestQuarter,sa.priorQuarter,sa.comparableQuarter),changeCell(sb,field,sb.latestQuarter,sb.priorQuarter,sb.comparableQuarter),'전년 같은 분기 대비'));
  }

  // Yearly trend over the years either company reports.
  const years=[...new Set([...a.annual,...b.annual].map(r=>r.year))].sort((x,y)=>x-y).slice(-3);
  if(years.length&&!(sa.awaiting&&sb.awaiting)){
   parts.push('<h3 class="cmp-section">연도별 영업이익</h3>');
   for(const year of years){
    const ra=a.annual.find(r=>r.year===year),rb=b.annual.find(r=>r.year===year);
    const [ba,bb]=bars(sa,sb,'op',ra,rb);
    parts.push(row(`${year}년`,cell(sa,'op',ra,ba),cell(sb,'op',rb,bb)));
   }
  }

  // Why the numbers may not line up one to one.
  const notes=[];
  if(sa.labels.sales!==sb.labels.sales||sa.labels.op!==sb.labels.op)notes.push('두 기업은 업종이 달라 실적 지표의 이름과 구성이 다릅니다. 숫자 크기를 그대로 비교하기 어렵습니다.');
  if(a.financialCurrency!==b.financialCurrency)notes.push('두 기업의 실적 통화가 다릅니다. 환율을 반영하지 않은 각 통화 기준 수치입니다.');
  if(a.financialBasis!==b.financialBasis)notes.push(`재무 기준이 다릅니다 (${esc(a.name)}: ${esc(a.financialBasis)}, ${esc(b.name)}: ${esc(b.financialBasis)}).`);
  if(sa.latestQuarter&&sb.latestQuarter&&periodName(sa.latestQuarter)!==periodName(sb.latestQuarter))notes.push('두 기업의 최근 분기가 다릅니다. 같은 시점의 비교가 아닙니다.');
  if(a.annualPeriodLabel&&b.annualPeriodLabel&&a.annualPeriodLabel!==b.annualPeriodLabel)notes.push('두 기업의 회계연도 기간이 다릅니다.');
  notes.push('각 기업 페이지에 실린 공식 공시 수치를 그대로 옮겼습니다. 출처와 자세한 설명은 각 기업 페이지에서 확인할 수 있습니다.');
  parts.push(`<ul class="cmp-notes">${notes.map(n=>`<li>${n}</li>`).join('')}</ul>`);
  return parts.join('');
 }

 return {buildComparison,summarize,metricChange,esc,marketName,industryOf};
})();

if(typeof document!=='undefined'&&document.getElementById('compareApp'))(function initComparePage(){
 const {buildComparison,esc,marketName,industryOf}=COMPARE_PAGE;
 const app=document.getElementById('compareApp'),pickers=[...document.querySelectorAll('[data-compare-slot]')];
 const params=new URLSearchParams(location.search),keys=[params.get('a')||'',params.get('b')||''];
 const isPref=key=>key.includes('pref');
 let companies=[];
 const normalize=value=>value.toLowerCase().replace(/\s+/g,'');
 const CHOSUNG='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ',toChosung=v=>[...v].map(ch=>{const code=ch.charCodeAt(0)-44032;return code>=0&&code<11172?CHOSUNG[Math.floor(code/588)]:ch}).join('');
 const find=query=>{const q=normalize(query);if(!q)return [];const chosung=/^[ㄱ-ㅎ]+$/.test(q);return companies.filter(c=>chosung?[c.name,c.alias||''].some(v=>toChosung(normalize(v)).includes(q)):[c.name,c.ticker,c.alias||''].some(v=>normalize(v).includes(q))).slice(0,8);};
 const byKey=key=>companies.find(c=>c.key===key);

 function updateURL(){
  const next=new URLSearchParams();if(keys[0])next.set('a',keys[0]);if(keys[1])next.set('b',keys[1]);
  history.replaceState(null,'',`${location.pathname}${next.toString()?'?'+next:''}`);
 }
 function choose(slot,key){keys[slot]=key;updateURL();renderPickers();renderComparison();}

 function renderPickers(){
  pickers.forEach((picker,slot)=>{
   const company=byKey(keys[slot]),input=picker.querySelector('input'),chosen=picker.querySelector('.cmp-chosen');
   chosen.hidden=!company;input.hidden=!!company;
   chosen.innerHTML=company?`<b>${esc(company.name)}</b><span>${esc(company.ticker)} · ${esc(marketName(company.market))}</span><button type="button" data-change>바꾸기</button>`:'';
   if(!company){input.value='';}
  });
 }
 for(const [slot,picker] of pickers.entries()){
  const input=picker.querySelector('input'),list=picker.querySelector('.cmp-results');
  const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');};
  input.addEventListener('input',()=>{
   const matches=find(input.value);
   list.innerHTML=matches.length?matches.map(c=>`<button type="button" role="option" data-key="${esc(c.key)}"><b>${esc(c.name)}</b><span>${esc(c.ticker)} · ${esc(marketName(c.market))}</span></button>`).join(''):(input.value.trim()?'<p>검색 결과가 없습니다.</p>':'');
   list.hidden=!input.value.trim();input.setAttribute('aria-expanded',String(!list.hidden));
  });
  input.addEventListener('keydown',event=>{if(event.key==='Escape')close();if(event.key==='Enter'){const first=find(input.value)[0];if(first){event.preventDefault();close();choose(slot,first.key);}}});
  list.addEventListener('click',event=>{const button=event.target.closest('[data-key]');if(!button)return;close();choose(slot,button.dataset.key);});
  picker.addEventListener('click',event=>{if(!event.target.closest('[data-change]'))return;keys[slot]='';updateURL();renderPickers();renderComparison();picker.querySelector('input').focus();});
  document.addEventListener('click',event=>{if(!picker.contains(event.target))close();});
 }

 // With one company chosen, offer nearby companies from the same industry.
 function suggestions(){
  const chosenSlot=keys[0]?0:1,chosen=byKey(keys[chosenSlot]);
  if(!chosen){app.innerHTML='<p class="cmp-empty">위에서 비교할 두 기업을 골라 주세요. 기업명이나 종목코드로 찾을 수 있어요.</p>';return;}
  const at=companies.indexOf(chosen),industry=industryOf(chosen.key);
  const peers=companies.map((c,i)=>({c,i})).filter(({c})=>c.key!==chosen.key&&!isPref(c.key)&&c.market===chosen.market&&industryOf(c.key)===industry).sort((x,y)=>Math.abs(x.i-at)-Math.abs(y.i-at)).slice(0,8).map(({c})=>c);
  app.innerHTML=`<p class="cmp-empty"><b>${esc(chosen.name)}</b> 옆에 놓고 볼 기업을 골라 주세요.</p>${peers.length?`<p class="cmp-suggest-title">같은 업종 (${esc(industry)})</p><div class="cmp-suggest">${peers.map(c=>`<button type="button" data-suggest="${esc(c.key)}">${esc(c.name)}</button>`).join('')}</div>`:''}`;
  app.querySelector('.cmp-suggest')?.addEventListener('click',event=>{const button=event.target.closest('[data-suggest]');if(button)choose(1-chosenSlot,button.dataset.suggest);});
 }

 let request=0;
 async function renderComparison(){
  const ticket=++request;
  if(!keys[0]||!keys[1]){document.title='기업 비교 | SIANALY';suggestions();return;}
  if(keys[0]===keys[1]){app.innerHTML='<p class="cmp-empty">서로 다른 두 기업을 골라 주세요.</p>';return;}
  app.innerHTML='<p class="cmp-empty" role="status">실적을 불러오는 중입니다.</p>';
  try{
   const [a,b]=await Promise.all(keys.map(key=>loadCompanyData(key)));
   if(ticket!==request)return;
   if(!a||!b){app.innerHTML='<p class="cmp-empty" role="alert">기업 정보를 찾을 수 없습니다. 다른 기업을 골라 주세요.</p>';return;}
   document.title=`${a.name} vs ${b.name} 비교 | SIANALY`;
   app.innerHTML=`<div class="cmp-table">${buildComparison({...a,market:byKey(a.key)?.market},{...b,market:byKey(b.key)?.market})}</div><div class="cmp-actions"><button type="button" id="swapCompare">좌우 바꾸기</button><button type="button" id="shareCompare">비교 링크 복사</button></div>`;
   document.getElementById('swapCompare').addEventListener('click',()=>{keys.reverse();updateURL();renderPickers();renderComparison();});
   const share=document.getElementById('shareCompare');
   share.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);share.textContent='링크를 복사했어요';}catch{share.textContent='복사하지 못했어요';}setTimeout(()=>{share.textContent='비교 링크 복사';},2000);});
  }catch(error){
   if(ticket!==request)return;
   console.error(error);
   app.innerHTML='<p class="cmp-empty" role="alert">실적을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
  }
 }

 loadCompanyCatalog().then(catalog=>{
  companies=catalog.companies;
  for(const slot of [0,1])if(keys[slot]&&!byKey(keys[slot]))keys[slot]='';
  updateURL();renderPickers();renderComparison();
 }).catch(()=>{app.innerHTML='<p class="cmp-empty" role="alert">기업 목록을 불러오지 못했습니다. 새로고침해 다시 시도해 주세요.</p>';});
})();
