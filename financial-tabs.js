// Shared financial view; company records, fiscal periods and currencies remain unchanged.
function initFinancialTabs(company, renderChart, renderSources, renderInsights) {
 const quarter = document.getElementById('company-quarterly');
 const annual = document.getElementById('company-annual');
 if (!quarter || !annual) return;
 const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const fixed=standardFinancialRows(company),history=fixed.quarterly;
 const slotWidth=110,chartWidth=history.length*slotWidth+90;
 const originalTables={quarter:quarter.querySelector('table')?.cloneNode(true),annual:annual.querySelector('table')?.cloneNode(true)};
 const panelsForRows=[[quarter,history,chartWidth],[annual,fixed.annual,420]];
 for(const [panel,rows,width]of panelsForRows){
  let charts=panel.querySelector('.metric-charts');
  if(charts)charts.outerHTML=renderChart(rows,{width});else panel.insertAdjacentHTML('beforeend',renderChart(rows,{width}));
  for(const note of panel.querySelectorAll('.chart-reading'))note.remove();
  let table=panel.querySelector('table');
  if(!table){table=document.createElement('table');table.innerHTML='<thead><tr><th>기간</th><th></th><th></th></tr></thead><tbody></tbody>';table.querySelectorAll('th')[1].textContent=company.financialMetrics.sales.label;table.querySelectorAll('th')[2].textContent=company.financialMetrics.op.label;panel.append(table);}
  table.querySelector('tbody').innerHTML=rows.map(row=>'<tr><td>'+esc(row.periodLabel)+'</td><td>'+(row.missingReason?'<span class="missing-financial" title="'+esc(row.missingReason)+'">—</span>':formatFinancialHighlight(row.sales,company.financialCurrency))+'</td><td>'+(row.missingReason?esc(row.missingReason):formatFinancialHighlight(row.op,company.financialCurrency))+'</td></tr>').join('');
  const sourceIds=[...new Set(rows.flatMap(row=>row.sourceIds))],sources=panel.querySelector('.source-links');
  if(sources&&sourceIds.length)sources.outerHTML=renderSources(sourceIds);
  const insight=panel.querySelector('.insight-grid'),note=panel.querySelector('.insight-note');insight?.remove();note?.remove();
  const available=rows.filter(row=>!row.missingReason),latest=available.at(-1),previous=panel===quarter?rows.find(row=>row.year===latest?.year-1&&row.quarter===latest?.quarter):rows.find(row=>row.year===latest?.year-1);
  if(latest)panel.insertAdjacentHTML('beforeend',renderInsights(latest,previous&&!previous.missingReason?previous:undefined,panel===quarter?'전년 동기 대비':'전년 대비'));
 }
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
  let periodNotes;
  const notes=(period==='quarter'?fixed.quarterly:fixed.annual).filter(row=>row.missingStatus);
  if(notes.length){
   const groups=new Map();
   for(const row of notes){const group=groups.get(row.missingReason)||[];group.push(row.periodLabel);groups.set(row.missingReason,group);}
   periodNotes=document.createElement('div');periodNotes.className='period-availability-notes';
   periodNotes.setAttribute('aria-label','빈 기간 안내');
   for(const [reason,periods]of groups){const p=document.createElement('p'),b=document.createElement('b');b.textContent=periods.join(' · ');p.append(b,document.createElement('br'),document.createTextNode(reason));periodNotes.append(p);}
   const stamp=document.createElement('small');stamp.textContent='확인일 '+company.financialPeriodReviewAsOf;periodNotes.append(stamp);
  }
  const more = document.createElement('details');
  more.className = 'performance-details';
  more.innerHTML = '<summary>실적표와 공식 자료 보기</summary>';
  for (const node of [...panel.childNodes]) {
   if (![charts, reading, insights, insightNote].includes(node)) more.append(node);
  }
  panel.replaceChildren(...[charts, periodNotes, insights, insightNote, more].filter(Boolean));
  const original=originalTables[period];
  const originalRows=period==='quarter'?company.allQuarters:company.annual;
  const mismatched=originalRows.some(row=>{const d=financialDateRange(row);return row.partialPeriod||row.durationMonths===6||(d&&(period==='annual'?(d.start!==1||d.end!==12||d.year!==d.endYear):((d.end-d.start)!==2||d.year!==d.endYear||![1,4,7,10].includes(d.start))));});
  if(original&&mismatched){
   original.querySelector('tbody').innerHTML=originalRows.map(row=>'<tr><td>'+esc(row.reportPeriod||row.periodLabel||(row.quarter?`${row.year}년 ${row.quarter}분기`:String(row.year)))+'</td><td>'+formatFinancialHighlight(row.sales,company.financialCurrency)+'</td><td>'+formatFinancialHighlight(row.op,company.financialCurrency)+'</td></tr>').join('');
   const actual=document.createElement('details');actual.className='actual-periods';actual.innerHTML='<summary>다른 결산 기간의 공시 실적 보기</summary>';actual.append(original);actual.insertAdjacentHTML('beforeend',renderSources([...new Set(originalRows.flatMap(row=>row.sourceIds))]));more.append(actual);
  }
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
  root.querySelector('.performance-caption').textContent=period==='quarter'?'2025년 1분기 ~ 2026년 2분기 · 각 3개월 실적 · '+company.financialBasis:'2023·2024·2025년 · 각 1~12월 실적 · '+company.financialBasis;
 }
 const missing=document.createElement('p');missing.className='financial-basis fixed-period-note';missing.textContent='— 표시는 확인된 수치가 없는 기간입니다. 0원이나 이익이 없다는 뜻이 아닙니다. 결산 기간이 다른 기업의 실제 공시 자료는 아래에서 따로 볼 수 있습니다.';root.append(missing);
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
