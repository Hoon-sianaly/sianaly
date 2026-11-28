#!/usr/bin/env node
// Sends the day's Naver blog draft as a GitHub issue, so the owner gets a notification (메일·GitHub 앱)
// with the title, body, pictures and tags ready to copy. 네이버 블로그는 자동 글쓰기 기능이 없어서
// 발행 버튼만 사람이 눌러요. 다 올린 뒤 이슈를 닫으면 돼요.
// Needs: GITHUB_TOKEN, GITHUB_REPOSITORY, IMAGE_BASE_URL (그림이 올라간 social-posts 주소), RUN_URL (선택)
// Usage: node scripts/social/post-blog-draft.cjs <post folder>
'use strict';
const fs = require('node:fs'), path = require('node:path');
const {blogMarkdown} = require('./blog.cjs');

const dir = path.resolve(process.argv[2] || '');
const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const save = result => { fs.writeFileSync(path.join(dir, 'blog-draft.json'), JSON.stringify({...result, at: new Date().toISOString()}, null, 2)); console.log(result.message); };
const {GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, IMAGE_BASE_URL: base, RUN_URL: runUrl} = process.env;

(async () => {
  const review = JSON.parse(fs.readFileSync(path.join(dir, 'review.json'), 'utf8'));
  if (!review.ok) { save({ok: false, skipped: true, message: '2번 검토를 통과하지 못해서 블로그 초안을 보내지 않았어요.'}); process.exit(1); }
  if (!token || !repo || !base) throw Error('GITHUB_TOKEN, GITHUB_REPOSITORY, IMAGE_BASE_URL이 필요해요.');
  const b = m.text.blog;
  const body = [
    `> **네이버 블로그 초안** · ${m.id} · 2번 검토 통과 ✅`,
    `> 순서: ① 아래 제목 복사 → ② "블로그 본문"을 드래그해서 복사 → 네이버 글쓰기에 붙여넣기 → 그림이 빠지면 [카드 그림 내려받기](${runUrl || base}) 후 넣기 → ③ 태그 넣고 발행 → 이 이슈 닫기`,
    '', '**① 제목**', '```', b.title, '```', '',
    '**③ 태그** (네이버 태그 칸에 하나씩)', '```', b.tags.join(' '), '```', '',
    '---', '**② 블로그 본문** (여기부터 끝까지)', '', blogMarkdown(m, base),
  ].join('\n');
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {method: 'POST',
    headers: {authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'sianaly-social'},
    body: JSON.stringify({title: `[블로그 초안] ${m.id} ${m.facts.name}`, body, labels: ['블로그 초안']})});
  const data = await res.json();
  if (!res.ok) throw Error(`GitHub 알림(이슈) 만들기 실패 (${res.status}): ${data.message}`);
  save({ok: true, url: data.html_url, message: `블로그 초안을 보냈어요: ${data.html_url}`});
})().catch(e => { save({ok: false, message: '블로그 초안 보내기 실패: ' + e.message}); process.exit(1); });
