#!/usr/bin/env node
// Small helpers the daily workflow calls between steps.
//   wait <post folder>            : 정해진 시각(06:30 / 18:30 KST)까지 기다려요 (이미 지났으면 바로 넘어가요)
//   record <post folder> <state>  : 무엇을 올렸는지 state.json에 적어서 같은 기업·실적을 또 올리지 않게 해요
'use strict';
const fs = require('node:fs'), path = require('node:path');
const [cmd, dirArg, stateArg] = process.argv.slice(2);
const dir = path.resolve(dirArg || '');
const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const read = name => { try { return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch { return null; } };

if (cmd === 'wait') {
  const ms = Date.parse(m.uploadAt) - Date.now();
  if (ms > 0 && ms < 3 * 3600e3) {
    console.log(`${m.uploadAt}까지 ${Math.ceil(ms / 60000)}분 기다렸다가 올려요.`);
    setTimeout(() => console.log('올릴 시간이에요.'), ms);
  } else console.log(ms <= 0 ? '정해진 시각이 지나서 바로 올려요.' : '기다릴 시간이 너무 길어서 바로 올려요.');
} else if (cmd === 'record') {
  const state = fs.existsSync(stateArg) ? JSON.parse(fs.readFileSync(stateArg, 'utf8')) : {posted: []};
  const draft = read('blog-draft.json'), ig = read('upload-instagram.json'), review = read('review.json');
  state.posted = (state.posted || []).filter(p => p.id !== m.id);
  state.posted.push({id: m.id, date: m.date, slot: m.slot, topic: m.topic, key: m.facts.key, name: m.facts.name, year: m.facts.latest.year, quarter: m.facts.latest.quarter,
    reviewOk: !!review?.ok, blogDraft: draft?.url || null, instagram: ig?.url || null, uploaded: !!(draft?.url || ig?.url)});
  state.posted = state.posted.slice(-500);
  fs.mkdirSync(path.dirname(path.resolve(stateArg)), {recursive: true});
  fs.writeFileSync(stateArg, JSON.stringify(state, null, 2));
  const lines = [`### 올리기 결과 (${m.id})`, `- 네이버 블로그 초안: ${draft?.message || '실행 안 함'}`, `- 인스타: ${ig?.message || '실행 안 함'}`];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
} else { console.error('사용법: finish.cjs wait|record <post folder> [state.json]'); process.exit(2); }
