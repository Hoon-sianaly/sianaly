// Shared helpers for the daily Instagram card news + Naver blog draft pipeline.
// The company numbers come from the same code the website uses (company-data.js),
// so a post can never show a number the site does not show.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), os = require('node:os');
const {execFileSync} = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const SITE = 'sianaly.com';
const TIMES = {morning: '06:30', evening: '18:30'}; // 한국 시간으로 올리는 시각

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

// Run company-data.js (the site's own loader) against local files instead of the network.
let siteCtx;
function site() {
  if (siteCtx) return siteCtx;
  const fetch = async url => {
    const file = path.join(root, String(url).split('?')[0]);
    try { const text = fs.readFileSync(file, 'utf8'); return {ok: true, status: 200, json: async () => JSON.parse(text)}; }
    catch { return {ok: false, status: 404, json: async () => null}; }
  };
  siteCtx = vm.createContext({console, fetch, AbortSignal, URL, setTimeout});
  vm.runInContext(fs.readFileSync(path.join(root, 'company-data.js'), 'utf8'), siteCtx);
  return siteCtx;
}

const catalog = () => readJSON(path.join(root, 'data', 'company-index.json')).companies;
const loadCompany = key => site().loadCompanyData(key);
const money = (value, currency) => site().formatFinancialHighlight(value, currency);

// Korean particle helpers: 매출은 / 매출액은, 회사는 ...
function hasFinalConsonant(word) {
  const ch = String(word).trim().slice(-1), code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return /[013678lmnLMN]$/.test(ch);
}
const eunNeun = word => word + (hasFinalConsonant(word) ? '은' : '는');
const plainLabel = label => String(label).replace(/\s*\(.*?\)\s*/g, '').trim();

const quarterLabel = row => row.periodLabel || `${row.year}년 ${row.quarter}분기`;
const quarterShort = row => row.periodLabel ? row.periodLabel.replace(/^20/, '') : `${String(row.year).slice(2)}년 ${row.quarter}분기`;

// How a number moved against the same quarter one year earlier, in plain words.
function describeChange(current, previous, kind) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (kind === 'op' || previous <= 0 || current < 0) {
    if (previous > 0 && current <= 0) return {dir: 'down', short: '적자 전환', text: '적자로 돌아섰어요'};
    if (previous <= 0 && current > 0) return {dir: 'up', short: '흑자 전환', text: '흑자로 돌아섰어요'};
    if (previous <= 0 && current <= 0) {
      if (current === previous) return {dir: 'flat', short: '적자 비슷', text: '적자 규모가 비슷해요'};
      return current > previous ? {dir: 'up', short: '적자 축소', text: '적자가 줄었어요'} : {dir: 'down', short: '적자 확대', text: '적자가 늘었어요'};
    }
  }
  const pct = (current - previous) / Math.abs(previous) * 100;
  if (Math.abs(pct) < 0.5) return {dir: 'flat', pct, short: '비슷', text: '작년과 거의 같아요'};
  const n = Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)).toLocaleString('ko-KR') : Math.abs(pct).toLocaleString('ko-KR', {maximumFractionDigits: 1});
  return pct > 0 ? {dir: 'up', pct, short: `+${n}%`, text: `작년보다 ${n}% 늘었어요`} : {dir: 'down', pct, short: `-${n}%`, text: `작년보다 ${n}% 줄었어요`};
}

// Everything a post shows about one company, with the raw values kept for the review step.
function buildFacts(company, period) {
  const currency = company.financialCurrency || 'KRW';
  const fmt = v => money(v, currency);
  const labels = {sales: plainLabel(company.financialMetrics.sales.label), op: plainLabel(company.financialMetrics.op.label)};
  const rows = company.allQuarters.filter(q => Number.isFinite(q.sales) && Number.isFinite(q.op));
  const latest = period ? rows.find(q => q.year === period.year && q.quarter === period.quarter) : rows.at(-1);
  if (!latest) return null;
  const prev = rows.find(q => q.year === latest.year - 1 && q.quarter === latest.quarter && !q.periodLabel === !latest.periodLabel);
  const at = rows.indexOf(latest), recent = rows.slice(Math.max(0, at - 4), at + 1);
  const pick = row => row && {year: row.year, quarter: row.quarter, label: quarterLabel(row), short: quarterShort(row), sales: row.sales, op: row.op, salesText: fmt(row.sales), opText: fmt(row.op), preliminary: row.disclosureStatus === 'preliminary'};
  const change = prev ? {sales: describeChange(latest.sales, prev.sales, 'sales'), op: describeChange(latest.op, prev.op, 'op')} : null;
  // "…늘었어요" + "…돌아섰어요" → "…늘었고, …돌아섰어요"
  const connective = text => text.replace(/었어요$/, '었고').replace(/같아요$/, '같고').replace(/비슷해요$/, '비슷하고');
  const sentence = change
    ? `${eunNeun(labels.sales)} ${connective(change.sales.text.replace('작년', '작년 같은 분기'))}, ${eunNeun(labels.op)} ${change.op.text}`
    : `${eunNeun(labels.sales)} ${fmt(latest.sales)}, ${eunNeun(labels.op)} ${fmt(latest.op)}이었어요`;
  return {
    key: company.key, name: company.name, ticker: company.ticker, type: company.type || '', rank: company.rank,
    short: company.short || '', summary: company.summary || '', currency, basis: company.financialBasis, labels,
    latest: pick(latest), previous: pick(prev), change, chart: recent.map(pick),
    business: (company.business || []).slice(0, 3).map(b => ({name: b.name, desc: b.desc})),
    drivers: (company.drivers || []).slice(0, 3).map(d => ({name: d.title, desc: d.desc})),
    sentence,
    url: `https://${SITE}/company?company=${encodeURIComponent(company.key)}`,
  };
}

// Seeded random so a re-run on the same day picks the same company.
function seededRandom(seedText) {
  let h = 2166136261;
  for (const ch of seedText) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e9) / 1e9; };
}

function kstNow(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600e3);
  return {date: k.toISOString().slice(0, 10), hour: k.getUTCHours(), minute: k.getUTCMinutes()};
}

// ---- external programs: a headless Chrome/Edge for pictures, ffmpeg for PNG → JPG ----
function findOnPath(names) {
  for (const name of names) {
    try { const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], {stdio: ['ignore', 'pipe', 'ignore']}).toString().split(/\r?\n/)[0].trim(); if (out) return out; } catch {}
  }
  return null;
}
function browserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const win = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
  const found = process.platform === 'win32' ? win.find(f => fs.existsSync(f)) : findOnPath(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']);
  if (!found) throw Error('그림을 만들 브라우저(Chrome/Edge)를 찾지 못했어요. CHROME_PATH를 지정해 주세요.');
  return found;
}
function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const found = findOnPath(['ffmpeg']);
  if (!found) throw Error('그림을 JPG로 바꿀 ffmpeg를 찾지 못했어요. FFMPEG_PATH를 지정해 주세요.');
  return found;
}

let profileDir;
function screenshot(htmlFile, pngFile, width, height) {
  profileDir ||= fs.mkdtempSync(path.join(os.tmpdir(), 'sianaly-shot-'));
  execFileSync(browserPath(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run', '--mute-audio',
    `--user-data-dir=${profileDir}`, '--force-device-scale-factor=1', `--window-size=${width},${height}`, '--virtual-time-budget=3000',
    `--screenshot=${pngFile}`, 'file:///' + htmlFile.replace(/\\/g, '/').replace(/^\//, '')], {stdio: 'ignore', timeout: 60000});
  if (!fs.existsSync(pngFile)) throw Error('그림 파일이 만들어지지 않았어요: ' + pngFile);
}

function ffmpeg(args) { return execFileSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000}); }

// Width/height straight from a JPEG's frame header.
function jpegSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i < b.length;) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return {height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7)};
    i += 2 + len;
  }
  return null;
}

module.exports = {root, SITE, TIMES, readJSON, catalog, loadCompany, money, buildFacts, describeChange, eunNeun, plainLabel, quarterLabel,
  seededRandom, kstNow, screenshot, ffmpeg, jpegSize};
