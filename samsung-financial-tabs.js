// Trial layout for Samsung only. Financial records and other company pages stay intact.
function initSamsungFinancialTabs(company) {
 if (company.key !== 'samsung') return;
 const quarter = document.getElementById('company-quarterly');
 const annual = document.getElementById('company-annual');
 if (!quarter || !annual) return;
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
   ? `${company.quarterlyYear}년 · 각 분기 3개월 실적 · ${company.financialBasis}`
   : `연도별 12개월 실적 · ${company.financialBasis}`;
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
