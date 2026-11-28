#!/usr/bin/env node
// Two independent checks before anything is uploaded. Both must pass, or nothing goes up.
//   1차 검토 (내용): 보여 주는 숫자를 원본 기업 파일에서 다시 찾아 하나하나 대조하고, 문장·제목 규칙을 확인해요.
//   2차 검토 (파일): 카드 그림의 크기·비율·용량이 인스타 규칙에 맞는지, 블로그 글의 그림이 다 있는지 확인해요.
// Usage: node scripts/social/review-posts.cjs <post folder> [--preview]   (--preview: PNG로 만든 미리보기)
'use strict';
const fs = require('node:fs'), path = require('node:path');
const L = require('./lib.cjs');

const dir = path.resolve(process.argv[2] || '');
const preview = process.argv.includes('--preview');
const m = L.readJSON(path.join(dir, 'manifest.json'));
const f = m.facts;

function checker(title) {
  const items = [];
  return {title, items, check(ok, what) { items.push({ok: !!ok, what}); }, get ok() { return items.every(i => i.ok); }};
}

// ---- 1차: 내용 ----
const one = checker('1차 검토 (내용)');
{
  // 원본 기업 파일과 과거 실적 파일을 사이트 코드와 따로 직접 읽어요.
  const entry = L.catalog().find(c => c.key === f.key);
  one.check(entry, `기업 목록에 ${f.name}(${f.key})이 있어요`);
  const raw = L.readJSON(path.join(L.root, 'data', 'companies', entry.file));
  one.check(raw.profile.name === f.name && raw.profile.ticker === f.ticker, `회사 이름·종목코드가 원본과 같아요 (${f.name} ${f.ticker})`);
  const extrasFile = path.join(L.root, 'data', 'extras', `${f.key}.json`);
  const extras = fs.existsSync(extrasFile) ? L.readJSON(extrasFile) : {};
  const sourceRows = [...raw.financials.quarterly, ...(extras.history?.companies?.[f.key]?.quarterly || []), ...(extras.periodReview?.companies?.[f.key]?.quarterly || [])];
  const same = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 1e-9);
  const currency = raw.financials.currency || 'KRW';
  for (const row of [...f.chart, f.previous].filter(Boolean)) {
    const found = sourceRows.filter(r => r.year === row.year && r.quarter === row.quarter);
    one.check(found.some(r => same(r.sales, row.sales)), `${row.label} ${f.labels.sales} ${row.salesText}이 원본 숫자와 같아요`);
    one.check(found.some(r => same(r.op, row.op)), `${row.label} ${f.labels.op} ${row.opText}이 원본 숫자와 같아요`);
    one.check(L.money(row.sales, currency) === row.salesText && L.money(row.op, currency) === row.opText, `${row.label} 금액 표기(억원·조원)가 사이트와 같아요`);
  }
  const last = f.chart.at(-1);
  one.check(last && last.year === f.latest.year && last.quarter === f.latest.quarter && same(last.sales, f.latest.sales) && same(last.op, f.latest.op), '큰 숫자 화면과 그래프의 마지막 분기가 같아요');
  const latestRaw = raw.financials.quarterly.filter(r => r.year === f.latest.year && r.quarter === f.latest.quarter);
  one.check(latestRaw.length === 1 || sourceRows.some(r => r.year === f.latest.year && r.quarter === f.latest.quarter), `가장 최근 분기(${f.latest.label})가 원본에 있어요`);
  one.check((latestRaw[0]?.disclosureStatus === 'preliminary') === f.latest.preliminary, `잠정 실적 여부 표시가 원본과 같아요`);
  // 증감 방향을 다른 방법(단순 비교)으로 다시 계산해요.
  if (f.change) {
    for (const k of ['sales', 'op']) {
      const cur = f.latest[k], prev = f.previous[k], c = f.change[k];
      const expected = cur > prev ? 'up' : cur < prev ? 'down' : 'flat';
      one.check(c.dir === expected || (c.dir === 'flat' && Math.abs(cur - prev) <= Math.abs(prev) * 0.005), `${f.labels[k]} 증감 방향(${c.short})이 맞아요`);
      if (Number.isFinite(c.pct)) one.check(Math.abs(c.pct - (cur - prev) / Math.abs(prev) * 100) < 0.01, `${f.labels[k]} 증감률 계산이 맞아요`);
      if (c.short === '흑자 전환') one.check(prev <= 0 && cur > 0, '흑자 전환 표현이 숫자와 맞아요');
      if (c.short === '적자 전환') one.check(prev > 0 && cur <= 0, '적자 전환 표현이 숫자와 맞아요');
    }
  }
  if (m.topic === 'earnings') {
    const updates = L.readJSON(path.join(L.root, 'data', 'dart-updates.json')).updates;
    one.check(updates.some(u => u.companies.some(c => c.key === f.key && c.periods.some(p => p.year === f.latest.year && p.quarter === f.latest.quarter))), '새 실적 공시 목록에 이 기업·분기가 실제로 있어요');
  }
  // 그림에 들어간 글자 확인 (그림을 만든 HTML을 그대로 다시 읽어요)
  const work = path.join(dir, 'work');
  const html = fs.readdirSync(work).filter(n => n.endsWith('.html')).map(n => fs.readFileSync(path.join(work, n), 'utf8')).join('\n');
  one.check(!/undefined|NaN|Infinity|\bnull\b|\[object/.test(html.replace(/<style[\s\S]*?<\/style>/g, '')), '그림 안에 깨진 글자(undefined, NaN 등)가 없어요');
  one.check(html.includes(f.name) && html.includes(f.latest.salesText) && html.includes(f.latest.opText), '그림에 회사 이름과 최신 숫자가 들어 있어요');
  one.check(/투자 권유/.test(html), '그림에 "투자 권유 아님" 안내가 있어요');
  const blog = m.text.blog, ig = m.text.instagram;
  const blogText = fs.readFileSync(path.join(dir, 'blog.txt'), 'utf8');
  one.check(blog.title.length <= 60 && blog.title.includes(f.name), `블로그 제목이 60자 이하이고 회사 이름이 있어요 (${blog.title.length}자)`);
  one.check(!/undefined|NaN|Infinity|\bnull\b|\[object/.test(blogText), '블로그 글에 깨진 글자가 없어요');
  one.check(f.chart.every(r => blogText.includes(`${r.label}: ${f.labels.sales} ${r.salesText} / ${f.labels.op} ${r.opText}`)), '블로그 글의 분기별 숫자가 그림과 같아요');
  one.check(blog.tags.length >= 3 && blog.tags.length <= 30, `블로그 태그 수가 알맞아요 (${blog.tags.length}개)`);
  one.check(ig.caption.length <= 2200, `인스타 글이 2200자 이하예요 (${ig.caption.length}자)`);
  one.check((ig.caption.match(/#\S+/g) || []).length <= 30, '인스타 해시태그가 30개 이하예요');
  for (const t of [blogText, ig.caption]) one.check(t.includes(f.latest.salesText) && t.includes(f.latest.opText) && /투자 권유가 아닙니다/.test(t), '글에 최신 숫자와 투자 권유 아님 안내가 있어요');
}

// ---- 2차: 파일 ----
const two = checker('2차 검토 (파일)');
{
  const cards = m.files.card;
  two.check(cards.length >= 2 && cards.length <= 10, `카드뉴스 장수가 인스타 규칙(2~10장)에 맞아요 (${cards.length}장)`);
  for (const name of cards) {
    const file = path.join(dir, name), size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    two.check(size > 30000, `${name} 파일이 있고 비어 있지 않아요 (${Math.round(size / 1024)}KB)`);
    two.check(size < 8 * 1024 * 1024, `${name} 용량이 8MB 이하예요`);
    if (name.endsWith('.jpg')) {
      const dim = L.jpegSize(file);
      two.check(dim && dim.width === 1080 && dim.height === 1350, `${name} 크기가 1080×1350(4:5)예요`);
    } else two.check(preview, `${name}은 미리보기용 PNG예요 (실제로 올릴 때는 JPG만 써요)`);
  }
  // 블로그 글에 넣는 그림이 실제 카드 파일과 맞는지
  for (const s of m.text.blog.sections.filter(s => s.type === 'image')) two.check(cards.includes(s.file), `블로그 글의 그림(${s.file})이 실제로 있어요`);
  two.check(fs.existsSync(path.join(dir, 'blog.html')) && fs.existsSync(path.join(dir, 'blog.txt')), '블로그 초안 파일(blog.html, blog.txt)이 있어요');
}

const result = {id: m.id, ok: one.ok && two.ok, reviewedAt: new Date().toISOString(), passes: [one, two].map(c => ({title: c.title, ok: c.ok, items: c.items}))};
fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify(result, null, 2));
const lines = [`## ${m.id} 검토 결과: ${result.ok ? '통과 ✅' : '불합격 ❌ (올리지 않아요)'}`, `${f.name} · ${m.topic === 'earnings' ? '새 실적' : '랜덤 기업'} · ${f.latest.label}`, ''];
for (const c of [one, two]) {
  lines.push(`### ${c.title}: ${c.ok ? '통과' : '불합격'} (${c.items.filter(i => i.ok).length}/${c.items.length})`);
  for (const i of c.items) if (!i.ok || process.env.REVIEW_VERBOSE) lines.push(`- ${i.ok ? '✅' : '❌'} ${i.what}`);
  lines.push('');
}
const text = lines.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
process.exit(result.ok ? 0 : 1);
