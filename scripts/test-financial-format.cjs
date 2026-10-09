const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'company-data.js'),'utf8'),ctx);
for(const [value,expected] of [[.05,'500억원'],[.0001,'1억원'],[.9999,'9,999억원'],[1,'1조원'],[1.23,'1.23조원'],[-.05,'-500억원'],[.00004,'4,000만원'],[-.00004,'-4,000만원'],[1e-12,'1원'],[0,'0원'],[null,'-']])assert.equal(ctx.formatFinancialHighlight(value),expected);
const html=fs.readFileSync(path.join(root,'company.html'),'utf8');ctx.c={financialMetrics:{sales:{label:'매출',help:''},op:{label:'영업이익',help:''}}};ctx.salesLabel='매출';ctx.opLabel='영업이익';ctx.esc=String;
vm.runInContext(html.slice(html.indexOf('function comparisonChart('),html.indexOf('function chart(')),ctx);
const rows=[{period:'2024',sales:1.23,op:.05},{period:'2025',sales:2,op:-.00004}],chart=ctx.comparisonChart(rows);
assert(!chart.includes('단위:'));
assert(!chart.includes('조</text>')&&!chart.includes('억</text>'));
assert(chart.includes('500억원')&&chart.includes('-4,000만원')&&chart.includes('fill="#dc2626"'));
assert(!chart.includes('>0.0</text>'));
// Even with a trillion-scale comparison, small profits keep their own readable label.
assert(ctx.comparisonChart([{period:'2024',sales:2,op:1},{period:'2025',sales:1,op:.0001}]).includes('1억원'));
console.log('Financial formatting passed: unit thresholds, 500억 regression, small amounts, zero, losses and per-chart scales.');

assert.equal(ctx.formatFinancialHighlight(17.984761/1e6,'USD'),'1,798만달러');assert.equal(ctx.formatFinancialHighlight(-64.575387/1e6,'USD'),'-6,458만달러');assert.equal(ctx.formatFinancialHighlight(0,'USD'),'0달러');ctx.c.financialCurrency='USD';const dollars=ctx.comparisonChart([{period:'2026',sales:17.984761/1e6,op:-64.575387/1e6}]);assert(dollars.includes('만달러')&&!dollars.includes('조원·억원'));
