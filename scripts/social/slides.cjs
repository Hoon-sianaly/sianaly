// HTML for one card-news slide (1080×1350, 인스타 4:5). 같은 그림을 네이버 블로그 글에도 써요.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const {root, SITE} = require('./lib.cjs');

const FORMATS = {
  card: {width: 1080, height: 1350, pad: '96px 88px 88px'},
};
const symbol = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'sianaly-symbol.svg')).toString('base64');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const dirClass = c => c ? `chg ${c.dir}` : 'chg';

function barChart(series, width) {
  const values = series.rows.map(r => r.value), max = Math.max(...values.map(Math.abs), 1e-15);
  const hasNeg = values.some(v => v < 0), hasPos = values.some(v => v > 0);
  // 마이너스 막대는 숫자를 막대 아래에 쓰니까, 분기 이름과 겹치지 않게 아래 여백을 더 둬요.
  const bottom = hasNeg ? 92 : 50, H = 250 + (hasNeg ? 42 : 0), top = 44, plot = H - top - bottom;
  const zeroY = top + (hasNeg && hasPos ? plot * Math.max(...values) / (Math.max(...values) - Math.min(...values)) : hasNeg ? 0 : plot);
  const scale = hasNeg && hasPos ? plot / (Math.max(...values) - Math.min(...values)) : plot / max;
  const slot = width / values.length, bw = Math.min(96, slot * 0.56);
  const bars = series.rows.map((r, i) => {
    const x = slot * i + (slot - bw) / 2, h = Math.max(Math.abs(r.value) * scale, r.value === 0 ? 0 : 3);
    const y = r.value >= 0 ? zeroY - h : zeroY, last = i === values.length - 1;
    const fill = r.value < 0 ? (last ? '#ff6b6b' : '#a54b5a') : (last ? '#43a5f5' : '#3a5f8f');
    const ty = r.value >= 0 ? y - 12 : y + h + 30;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="8" fill="${fill}"/>`
      + `<text x="${x + bw / 2}" y="${ty}" class="v${last ? ' last' : ''}">${esc(r.text)}</text>`
      + `<text x="${x + bw / 2}" y="${H - 8}" class="p${last ? ' last' : ''}">${esc(r.short)}</text>`;
  }).join('');
  return `<div class="series"><div class="slabel">${esc(series.label)}</div><svg viewBox="0 -20 ${width} ${H + 20}" width="${width}" height="${H + 20}">`
    + `<line x1="0" x2="${width}" y1="${zeroY}" y2="${zeroY}" stroke="rgba(255,255,255,.28)" stroke-width="2"/>${bars}</svg></div>`;
}

function body(slide, format) {
  const chartWidth = 856; // 본문 폭에서 상자 안쪽 여백(24px×2)을 뺀 값
  switch (slide.type) {
    case 'cover': return `<div class="chip">${esc(slide.chip)}</div><h1 class="big">${esc(slide.title)}</h1>`
      + `<div class="meta">${esc(slide.meta)}</div><p class="lead">${esc(slide.subtitle)}</p>`;
    case 'list': return `<h2>${esc(slide.heading)}</h2><ol class="list">${slide.items.map((it, i) => `<li><span class="n">${i + 1}</span><div><b>${esc(it.name)}</b><p>${esc(it.desc)}</p></div></li>`).join('')}</ol>`;
    case 'numbers': return `<h2>${esc(slide.heading)}</h2><div class="period">${esc(slide.period)}</div>`
      + slide.items.map(it => `<div class="num"><div class="nl">${esc(it.label)}</div><div class="nv${it.negative ? ' neg' : ''}">${esc(it.value)}</div>`
        + (it.change ? `<div class="${dirClass(it.change)}">${esc(it.change.text)}</div>` : '') + `</div>`).join('')
      + (slide.note ? `<p class="note">${esc(slide.note)}</p>` : '');
    case 'chart': return `<h2>${esc(slide.heading)}</h2>` + slide.series.map(s => barChart(s, chartWidth)).join('') + (slide.note ? `<p class="note">${esc(slide.note)}</p>` : '');
    case 'message': return `<h2>${esc(slide.heading)}</h2><p class="msg">${esc(slide.body)}</p>`;
    case 'outro': return `<div class="chip">${esc(slide.chip)}</div><h2 class="out">${esc(slide.heading)}</h2><p class="lead">${esc(slide.body)}</p>`
      + `<div class="url">${esc(SITE)}</div><p class="note">${esc(slide.note)}</p>`;
    default: throw Error('알 수 없는 슬라이드 종류: ' + slide.type);
  }
}

function slideHTML(slide, format, index, total) {
  const f = FORMATS[format];
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${f.width}px;height:${f.height}px;overflow:hidden}
body{font-family:'Noto Sans CJK KR','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#fff;
 background:radial-gradient(circle at 85% 8%,rgba(67,165,245,.35),transparent 42%),linear-gradient(160deg,#0a2a5c 0%,#071f46 55%,#05162f 100%);
 padding:${f.pad};display:flex;flex-direction:column;letter-spacing:-.02em;word-break:keep-all}
header{display:flex;align-items:center;gap:16px;font-weight:800;font-size:34px;letter-spacing:.06em}
header img{width:58px;height:58px}header .pg{margin-left:auto;font-size:28px;font-weight:600;color:rgba(255,255,255,.55);letter-spacing:0}
main{flex:1;display:flex;flex-direction:column;justify-content:center;gap:26px}
footer{font-size:26px;color:rgba(255,255,255,.5);display:flex;justify-content:space-between}
.chip{align-self:flex-start;background:#43a5f5;color:#04203f;font-weight:800;font-size:36px;padding:12px 28px;border-radius:999px}
h1.big{font-size:104px;line-height:1.12;font-weight:900}
.meta{font-size:34px;color:#9cc9f5;font-weight:600}
.lead{font-size:44px;line-height:1.45;font-weight:600;color:rgba(255,255,255,.92)}
h2{font-size:64px;line-height:1.2;font-weight:900}
.period{font-size:36px;color:#9cc9f5;font-weight:700;margin-top:-8px}
.num{background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.12);border-radius:28px;padding:30px 36px}
.nl{font-size:34px;color:rgba(255,255,255,.7);font-weight:700}
.nv{font-size:92px;font-weight:900;line-height:1.15}.nv.neg{color:#ff8a8a}
.chg{font-size:36px;font-weight:700;margin-top:6px;color:#d8e6f5}.chg.up{color:#7cc4ff}.chg.down{color:#ff9b9b}
.list{list-style:none;display:flex;flex-direction:column;gap:24px}
.list li{display:flex;gap:24px;background:rgba(255,255,255,.07);border-radius:24px;padding:28px 30px}
.list .n{flex:none;width:58px;height:58px;border-radius:50%;background:#43a5f5;color:#04203f;font-weight:900;font-size:34px;display:flex;align-items:center;justify-content:center}
.list b{font-size:42px;font-weight:800}.list p{font-size:34px;line-height:1.45;color:rgba(255,255,255,.82);margin-top:6px}
.series{background:rgba(255,255,255,.06);border-radius:24px;padding:22px 24px 6px}
.slabel{font-size:34px;font-weight:800;color:#9cc9f5}
svg text{font-family:inherit;text-anchor:middle}svg .v{font-size:26px;font-weight:700;fill:rgba(255,255,255,.8)}svg .v.last{fill:#fff;font-size:28px;font-weight:900}
svg .p{font-size:25px;fill:rgba(255,255,255,.6)}svg .p.last{fill:#fff;font-weight:800}
.msg{font-size:58px;line-height:1.45;font-weight:800}
h2.out{font-size:76px;white-space:pre-line}.url{font-size:62px;font-weight:900;color:#43a5f5}
.note{font-size:28px;line-height:1.5;color:rgba(255,255,255,.55)}
</style></head><body>
<header><img src="${symbol}" alt=""><span>SIANALY</span><span class="pg">${index + 1} / ${total}</span></header>
<main>${body(slide, format)}</main>
<footer><span>자료: 전자공시(DART) · ${esc(SITE)}</span><span>투자 권유 아님</span></footer>
</body></html>`;
}

module.exports = {FORMATS, slideHTML};
