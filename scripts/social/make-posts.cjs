#!/usr/bin/env node
// Makes one slot of daily posts: one Instagram card news (jpg set) and one Naver blog draft (같은 그림 + 설명 글).
//   morning (06:30 KST), evening (18:30 KST): 둘 다 랜덤으로 고른 기업 하나 (최근 90일에 올린 기업은 빼고 골라요)
//   --topic earnings 를 주면 공시로 새로 반영된 실적 하나를 골라요 (지금은 안 써요)
// Usage: node scripts/social/make-posts.cjs [--slot morning|evening|auto] [--topic random|earnings] [--out output/social] [--state state.json] [--date YYYY-MM-DD] [--preview]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const L = require('./lib.cjs');
const {FORMATS, slideHTML} = require('./slides.cjs');
const {blogPage, blogText} = require('./blog.cjs');

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => { const [k, ...v] = s.trim().split(/\s+/); return [k, v.join(' ') || true]; }));
const now = L.kstNow();
const slot = !args.slot || args.slot === 'auto' ? (now.hour < 12 ? 'morning' : 'evening') : args.slot;
if (!L.TIMES[slot]) throw Error('slot은 morning 또는 evening이어야 해요.');
const date = args.date || now.date;
const outRoot = path.resolve(args.out || path.join(L.root, 'output', 'social'));
const state = args.state && fs.existsSync(args.state) ? L.readJSON(args.state) : {posted: []};
const posted = state.posted || [];
const preview = !!args.preview; // 미리보기 전용: ffmpeg 없이 PNG로만 만들어요 (실제로 올릴 때는 JPG)

async function usable(key) {
  const entry = L.catalog().find(c => c.key === key);
  if (!entry) return null;
  const raw = L.readJSON(path.join(L.root, 'data', 'companies', entry.file));
  if (raw.financials?.companyRef || /[0-9]?우B?$/.test(entry.name) || /우선주/.test(entry.alias || '')) return null; // 우선주는 본주와 실적이 같아서 뺌
  return L.loadCompany(key);
}

async function pickRandom() {
  const recent = new Set(posted.filter(p => p.date >= addDays(date, -90)).map(p => p.key));
  const pool = L.catalog().filter(c => !recent.has(c.key));
  const rand = L.seededRandom(`${date}-${slot}-random`);
  for (let tries = 0; tries < 400 && pool.length; tries++) {
    const [entry] = pool.splice(Math.floor(rand() * pool.length), 1);
    const company = await usable(entry.key).catch(() => null);
    if (!company || !company.short) continue;
    const facts = L.buildFacts(company);
    if (facts && facts.chart.length >= 4 && facts.previous && facts.business.length >= 2) return {topic: 'random', facts, company};
  }
  throw Error('조건에 맞는 기업을 찾지 못했어요.');
}

async function pickEarnings() {
  const updates = L.readJSON(path.join(L.root, 'data', 'dart-updates.json')).updates
    .slice().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const done = new Set(posted.filter(p => p.topic === 'earnings').map(p => `${p.key}:${p.year}:${p.quarter}`));
  const since = Date.now() - 26 * 3600e3;
  // 오늘(최근 26시간) 반영분을 먼저 보고, 없으면 아직 안 다룬 가장 최근 반영분으로 넘어가요.
  for (const fresh of [true, false]) {
    const batches = updates.filter(u => fresh ? Date.parse(u.publishedAt) >= since : true);
    for (const batch of batches) {
      const candidates = [];
      for (const c of batch.companies) for (const p of c.periods) {
        if (done.has(`${c.key}:${p.year}:${p.quarter}`) || !p.fields.includes('sales')) continue;
        const company = await usable(c.key).catch(() => null);
        if (!company) continue;
        const facts = L.buildFacts(company, {year: p.year, quarter: p.quarter});
        if (facts && facts.chart.length >= 3) candidates.push({topic: 'earnings', facts, company, update: {publishedAt: batch.publishedAt, receipt: p.receipt, preliminary: p.preliminary}, fresh});
      }
      // 같은 날 여러 곳이 나오면 시가총액 순위가 가장 높은(숫자가 작은) 기업
      candidates.sort((a, b) => (a.facts.rank || 1e9) - (b.facts.rank || 1e9));
      if (candidates.length) return candidates[0];
    }
  }
  return null;
}

function addDays(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

function slidesFor(pick) {
  const f = pick.facts, l = f.latest, isEarn = pick.topic === 'earnings';
  const prelim = l.preliminary ? ' (잠정)' : '';
  const cover = isEarn
    ? {type: 'cover', chip: pick.fresh ? '새 실적 발표' : '최근 실적 발표', title: f.name, meta: `${f.ticker} · ${f.type}`, subtitle: `${l.label} 실적${prelim}이 공시됐어요. 숫자로 바로 정리해 볼게요.`}
    : {type: 'cover', chip: '오늘의 기업', title: f.name, meta: `${f.ticker} · ${f.type}`, subtitle: f.short + (/[.다요]$/.test(f.short) ? '' : '예요.')};
  const numbers = {type: 'numbers', heading: isEarn ? '이번 분기 성적표' : '최근 분기 실적', period: `${l.label}${prelim} · 작년 같은 분기와 비교`,
    items: [
      {label: f.labels.sales, value: l.salesText, negative: l.sales < 0, change: f.change?.sales},
      {label: f.labels.op, value: l.opText, negative: l.op < 0, change: f.change?.op},
    ], note: `${f.basis} · 3개월 실적`};
  const chart = {type: 'chart', heading: `최근 ${f.chart.length}개 분기 흐름`, series: [
    {label: f.labels.sales, rows: f.chart.map(r => ({short: r.short, value: r.sales, text: r.salesText}))},
    {label: f.labels.op, rows: f.chart.map(r => ({short: r.short, value: r.op, text: r.opText}))},
  ]};
  const business = {type: 'list', heading: '이 회사는 뭘 할까?', items: f.business};
  const summary = {type: 'message', heading: '한 줄 정리', body: f.sentence + '.'};
  const drivers = f.drivers.length >= 2 ? {type: 'list', heading: '앞으로 볼 점', items: f.drivers} : null;
  const outro = {type: 'outro', chip: '더 보기', heading: `${f.name} 실적,\n더 자세히 보려면`, body: `사이트 검색창에 '${f.name}'만 입력하면 돼요.`,
    note: '공시 자료를 쉽게 정리한 정보예요. 투자 판단은 스스로 해 주세요.'};
  const list = isEarn ? [cover, numbers, chart, summary, business, outro] : [cover, business, numbers, chart, drivers || summary, outro];
  return list.filter(Boolean);
}

// 제목용 짧은 표현: +25.4% → 25.4% 증가, 흑자 전환 그대로
const titleChange = c => /^\+/.test(c.short) ? c.short.slice(1) + ' 증가' : /^-/.test(c.short) ? c.short.slice(1) + ' 감소' : c.short === '비슷' ? '작년과 비슷' : c.short;

function captions(pick, slides, cards) {
  const f = pick.facts, l = f.latest, isEarn = pick.topic === 'earnings', prelim = l.preliminary ? ' 잠정' : '';
  const tagName = f.name.replace(/[^0-9A-Za-z가-힣]/g, '');
  const tags = [tagName, `${tagName}실적`, '실적', '기업분석', '주식공부', '공시', isEarn ? '실적발표' : '오늘의기업', '재테크', '시애널리'];
  const lines = [
    `${f.labels.sales} ${l.salesText}${f.change ? ` (${f.change.sales.text.replace('작년', '작년 같은 분기')})` : ''}`,
    `${f.labels.op} ${l.opText}${f.change ? ` (${f.change.op.text})` : ''}`,
  ];
  const head = isEarn ? `[새 실적] ${f.name} ${l.label}${prelim} 실적` : `[오늘의 기업] ${f.name}`;
  const disclaimer = '※ 전자공시(DART) 자료를 쉽게 정리한 정보이며, 투자 권유가 아닙니다. 투자 판단은 스스로 해 주세요.';
  const card = type => cards[slides.findIndex(sl => sl.type === type)];
  // 네이버 블로그 글: 그림(카드) + 쉬운 설명. 순서대로 붙여넣으면 돼요.
  const blog = [
    {type: 'image', file: cards[0]},
    {type: 'p', text: isEarn
      ? `안녕하세요, 시애널리예요. 오늘은 공시로 새로 나온 ${f.name}(${f.ticker})의 ${l.label}${prelim} 실적을 쉽게 정리해 볼게요.`
      : `안녕하세요, 시애널리예요. 오늘 소개할 기업은 ${f.name}(${f.ticker})이에요. ${f.short}${/[.다요]$/.test(f.short) ? '' : '예요.'}`},
    {type: 'heading', text: '한눈에 보기'},
    {type: 'list', items: lines.map(x => `${l.label}${prelim} ${x}`)},
    {type: 'p', text: f.sentence + '.'},
    {type: 'image', file: card('numbers')},
    {type: 'heading', text: `최근 ${f.chart.length}개 분기 흐름`},
    {type: 'image', file: card('chart')},
    {type: 'list', items: f.chart.map(r => `${r.label}: ${f.labels.sales} ${r.salesText} / ${f.labels.op} ${r.opText}`)},
    {type: 'p', text: `모두 ${f.basis}이고, 각 분기 3개월 동안의 실적이에요.`},
    {type: 'heading', text: '이 회사는 무슨 일을 하나요?'},
    ...(f.summary ? [{type: 'p', text: f.summary}] : []),
    {type: 'list', items: f.business.map(x => `${x.name}: ${x.desc}`)},
    ...(f.drivers.length ? [{type: 'heading', text: '앞으로 눈여겨볼 점'}, {type: 'list', items: f.drivers.map(x => `${x.name}: ${x.desc}`)}] : []),
    {type: 'heading', text: '마무리'},
    {type: 'p', text: `${f.name}의 연간 실적과 더 긴 흐름은 시애널리에서 볼 수 있어요.`},
    {type: 'link', text: `${f.name} 실적 자세히 보기`, url: f.url},
    {type: 'p', text: disclaimer},
  ];
  const blogTitle = isEarn
    ? `${f.name} ${l.label}${prelim} 실적 정리${f.change ? ` | ${f.labels.op} ${titleChange(f.change.op)}` : ''}`
    : `${L.eunNeun(f.name)} 어떤 회사? 하는 일과 ${l.label} 실적 쉽게 정리`;
  return {
    blog: {title: blogTitle, sections: blog, tags},
    instagram: {caption: [head, f.short, '', `📊 ${l.label}${prelim} (${f.basis})`, ...lines.map(x => '• ' + x), '', f.sentence + '.', '',
      `더 자세한 실적은 ${L.SITE} 에서 '${f.name}' 검색`, '', disclaimer, '', tags.map(t => '#' + t).join(' ')].join('\n')},
  };
}

async function render(pick, dir) {
  const slides = slidesFor(pick), work = path.join(dir, 'work'), {width, height} = FORMATS.card, card = [];
  fs.mkdirSync(work, {recursive: true});
  slides.forEach((slide, i) => {
    const html = path.join(work, `card-${i + 1}.html`), png = path.join(work, `card-${i + 1}.png`);
    fs.writeFileSync(html, slideHTML(slide, 'card', i, slides.length));
    L.screenshot(html, png, width, height);
    if (preview) { fs.copyFileSync(png, path.join(dir, `card-${i + 1}.png`)); card.push(`card-${i + 1}.png`); return; }
    L.ffmpeg(['-i', png, '-q:v', '2', path.join(dir, `card-${i + 1}.jpg`)]);
    card.push(`card-${i + 1}.jpg`);
  });
  return {slides, card};
}

(async () => {
  if (posted.some(p => p.id === `${date}-${slot}` && p.uploaded) && !args.force) {
    console.log(`${date}-${slot}은 이미 올렸어요. 다시 만들지 않아요 (--force로 강제 가능).`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'skip=true\n');
    return;
  }
  let pick = args.topic === 'earnings' ? await pickEarnings() : await pickRandom();
  if (!pick) { console.log('새로 반영된 실적이 없어 랜덤 기업으로 대신 만들어요.'); pick = await pickRandom(); }
  const id = `${date}-${slot}`, dir = path.join(outRoot, id);
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  const made = await render(pick, dir);
  const manifest = {id, date, slot, uploadAt: `${date}T${L.TIMES[slot]}:00+09:00`, topic: pick.topic, update: pick.update || null,
    facts: pick.facts, slides: made.slides, files: {card: made.card, blog: 'blog.html'},
    text: captions(pick, made.slides, made.card), createdAt: new Date().toISOString()};
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(dir, 'blog.html'), blogPage(manifest));
  fs.writeFileSync(path.join(dir, 'blog.txt'), blogText(manifest));
  console.log(`만들었어요: ${id} · ${pick.facts.name} (${pick.topic === 'earnings' ? '새 실적' : '랜덤 기업'}) · 카드 ${made.card.length}장 · 블로그 글 1개`);
  console.log(dir);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `dir=${dir}\nid=${id}\nslot=${slot}\n`);
})().catch(e => { console.error('만들기 실패:', e.message); process.exit(1); });
