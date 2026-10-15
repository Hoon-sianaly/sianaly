// Shared financial view; company records, fiscal periods and currencies remain unchanged.
function initFinancialTabs(company, renderChart, renderSources) {
 const quarter = document.getElementById('company-quarterly');
 const annual = document.getElementById('company-annual');
 if (!quarter || !annual) return;
 const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const history=company.allQuarters.filter(row=>row.year>=2025).map(row=>({...row}));
 const annual2025=company.annual.find(row=>row.year===2025);
 const firstNine=history.filter(row=>row.year===2025&&row.quarter<=3);
 let derivedFourth=false;
 const samsungFinancials=company.key==='samsung'||company.financialCompanyName==='삼성전자';
 if(samsungFinancials&&!history.some(row=>row.year===2025&&row.quarter===4)&&annual2025&&firstNine.length===3&&[1,2,3].every(q=>firstNine.some(row=>row.quarter===q))){
  const raw=row=>row.dart?.rawKRW||row.reportedKRW;
  if([annual2025,...firstNine].every(row=>['sales','op'].every(field=>/^-?\d+$/.test(raw(row)?.[field]||'')))){
   const amounts=Object.fromEntries(['sales','op'].map(field=>[field,BigInt(raw(annual2025)[field])-firstNine.reduce((sum,row)=>sum+BigInt(raw(row)[field]),0n)]));
   history.push({year:2025,quarter:4,sales:Number(amounts.sales)/1e12,op:Number(amounts.op)/1e12,sourceIds:[...new Set([annual2025,...firstNine].flatMap(row=>row.sourceIds))]});
   derivedFourth=true;
  }
 }
 history.sort((a,b)=>a.year-b.year||a.quarter-b.quarter);
 for(const row of history)row.periodLabel ||=`${row.year}년 ${row.quarter}분기`;
 // Longer fiscal-period labels need more room than ordinary calendar quarter labels.
 const labelWidth=text=>[...String(text)].reduce((width,char)=>width+(/[^\x00-\x7f]/.test(char)?15:8),0);
 const slotWidth=Math.max(95,...history.map(row=>labelWidth(row.periodLabel)+18));
 const chartWidth=Math.max(370,history.length*slotWidth+90);
 const historyCharts=quarter.querySelector('.metric-charts');
 if(historyCharts&&history.length)historyCharts.outerHTML=renderChart(history,{width:chartWidth});
 for(const note of quarter.querySelectorAll('.chart-reading'))note.remove();
 const tableBody=quarter.querySelector('table tbody');
 if(tableBody)tableBody.innerHTML=history.map(row=>`<tr><td>${esc(row.periodLabel)}</td><td>${formatFinancialHighlight(row.sales,company.financialCurrency)}</td><td>${formatFinancialHighlight(row.op,company.financialCurrency)}</td></tr>`).join('');
 const sources=quarter.querySelector('.source-links');
 if(sources)sources.outerHTML=renderSources([...new Set(history.flatMap(row=>row.sourceIds))]);
 if(derivedFourth){const note=document.createElement('p');note.className='financial-basis';note.textContent='2025년 4분기는 공식 연간 실적에서 1~3분기 합계를 뺀 값입니다.';quarter.append(note);}
 quarter.style.setProperty('--history-chart-width',chartWidth+'px');
 const root = document.createElement('section');
 root.id = 'company-performance';
 root.innerHTML = `<div class="title">실적</div>
 <div class="performance-controls">
  <div class="performance-periods" role="tablist" aria-label="실적 기간">
   <button type="button" id="performance-quarter-tab" role="tab" aria-controls="company-quarterly" aria-selected="true" data-period="quarter">분기</button>
   <button type="button" id="performance-annual-tab" role="tab" aria-controls="company-annual" aria-selected="false" tabindex="-1" data-period="annual">연간</button>
  </div>
  <div class="performance-metrics" role="group" aria-label="실적 지표">
   <button type="button" data-metric="sales" aria-pressed="true">매출</button>
   <button type="button" data-metric="op" aria-pressed="false">영업이익</button>
  </div>
 </div><p class="performance-caption"></p>`;
 root.querySelector('[data-metric="sales"]').textContent=company.financialMetrics.sales.label;
 root.querySelector('[data-metric="op"]').textContent=company.financialMetrics.op.label;
 const halfYear=/반기|6개월/.test(company.quarterlyTerm)||history.some(row=>row.durationMonths===6);
 if(halfYear)root.querySelector('[data-period="quarter"]').textContent='반기';
 const shortAnnual=/(?:3|6)개월/.test(company.annualTerm);
 if(shortAnnual)root.querySelector('[data-period="annual"]').textContent=company.annualTerm;
 if(company.financialAvailability)root.querySelector('.performance-metrics').hidden=true;
 quarter.before(root);
 const panels = {quarter, annual};
 for (const [period, panel] of Object.entries(panels)) {
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `performance-${period}-tab`);
  panel.setAttribute('tabindex', '0');
  const title = panel.querySelector('.title');
  panel.dataset.heading = title?.textContent || '';
  title?.remove();
  const charts = panel.querySelector('.metric-charts');
  if(!charts){root.append(panel);continue;}
  const reading = panel.querySelector('.chart-reading');
  reading?.remove();
  const insights = panel.querySelector('.insight-grid');
  const insightNote = panel.querySelector('.insight-note');
  const more = document.createElement('details');
  more.className = 'performance-details';
  more.innerHTML = '<summary>실적표와 공식 자료 보기</summary>';
  for (const node of [...panel.childNodes]) {
   if (![charts, reading, insights, insightNote].includes(node)) more.append(node);
  }
  panel.replaceChildren(...[charts, insights, insightNote, more].filter(Boolean));
  root.append(panel);
 }
 let period = 'quarter', metric = 'sales';
 const periodButtons = [...root.querySelectorAll('[data-period]')];
 const metricButtons = [...root.querySelectorAll('[data-metric]')];
 function render() {
  for (const [name, panel] of Object.entries(panels)) {
   panel.hidden = name !== period;
   [...panel.querySelectorAll('.metric-panel')].forEach((figure, index) => {
    figure.hidden = index !== (metric === 'sales' ? 0 : 1);
   });
  }
  for (const button of periodButtons) {
   const active = button.dataset.period === period;
   button.setAttribute('aria-selected', String(active));
   button.tabIndex = active ? 0 : -1;
  }
  for (const button of metricButtons) button.setAttribute('aria-pressed', String(button.dataset.metric === metric));
  root.querySelector('.performance-caption').textContent = period === 'quarter'
   ? company.financialAvailability ? '첫 정기 실적 공시 대기' : `${history[0]?.periodLabel || ''} ~ ${history.at(-1)?.periodLabel || ''} · ${company.quarterlyBasisLabel || (halfYear?'6개월 실적':'각 분기 3개월 실적')} · ${company.financialBasis}`
   : company.financialAvailability ? '첫 정기 실적 공시 대기' : `${company.annualTerm || '연간'} 실적 · ${company.financialBasis}`;
 }
 root.addEventListener('click', event => {
  const periodButton = event.target.closest('[data-period]');
  const metricButton = event.target.closest('[data-metric]');
  if (periodButton) period = periodButton.dataset.period;
  if (metricButton) metric = metricButton.dataset.metric;
  if (periodButton || metricButton) render();
 });
 root.querySelector('[role="tablist"]').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  period = event.key === 'Home' ? 'quarter' : event.key === 'End' ? 'annual' : period === 'quarter' ? 'annual' : 'quarter';
  render();
  periodButtons.find(button => button.dataset.period === period).focus();
 });
 const toc = document.querySelector('.toc-links');
 const quarterLink = toc.querySelector('a[href="#company-quarterly"]');
 const annualLink = toc.querySelector('a[href="#company-annual"]');
 if (quarterLink) { quarterLink.href = '#company-performance'; quarterLink.textContent = '실적'; }
 annualLink?.remove();
 function followHash() {
  if (location.hash === '#company-annual' || location.hash === '#company-quarterly') {
   period = location.hash === '#company-annual' ? 'annual' : 'quarter';
   render();
   if (location.hash) root.scrollIntoView({block:'start'});
  }
 }
 render();
 followHash();
 window.addEventListener('hashchange', followHash);
}
