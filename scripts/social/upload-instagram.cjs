#!/usr/bin/env node
// Posts the card images as one Instagram carousel with the Instagram API (Instagram 로그인 방식, free).
// Instagram fetches each image from a public web address, so the workflow first puts the JPGs on the
// public "social-posts" branch and passes that address in IMAGE_BASE_URL.
// Needs GitHub Secrets: IG_ACCESS_TOKEN (and optionally IG_USER_ID)   (scripts/SOCIAL-AUTOPOST.md 참고)
// Usage: IMAGE_BASE_URL=https://raw.githubusercontent.com/<repo>/social-posts/posts/<id> node scripts/social/upload-instagram.cjs <post folder>
'use strict';
const fs = require('node:fs'), path = require('node:path');

const dir = path.resolve(process.argv[2] || '');
const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const save = result => { fs.writeFileSync(path.join(dir, 'upload-instagram.json'), JSON.stringify({...result, at: new Date().toISOString()}, null, 2)); console.log(result.message); };
const token = process.env.IG_ACCESS_TOKEN, base = (process.env.IMAGE_BASE_URL || '').replace(/\/$/, '');
const api = `https://graph.instagram.com/${process.env.IG_API_VERSION || 'v23.0'}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(method, endpoint, params = {}) {
  const url = new URL(api + endpoint);
  const body = new URLSearchParams({...params, access_token: token});
  const res = method === 'GET' ? await fetch(url + '?' + body) : await fetch(url, {method, body});
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    if (e.code === 190) throw Error('인스타 키(IG_ACCESS_TOKEN)가 만료됐거나 틀렸어요. 안내서의 "인스타 키 다시 받기"를 따라 바꿔 주세요.');
    throw Error(`${endpoint} 실패 (${res.status}): ${e.message || JSON.stringify(data)}`);
  }
  return data;
}

(async () => {
  const review = JSON.parse(fs.readFileSync(path.join(dir, 'review.json'), 'utf8'));
  if (!review.ok) { save({ok: false, skipped: true, message: '2번 검토를 통과하지 못해서 인스타에 올리지 않았어요.'}); process.exit(1); }
  if (!token) return save({ok: true, skipped: true, message: '인스타 키가 아직 없어서 올리지 않았어요. 만든 카드는 작업 결과(Artifacts)에서 내려받을 수 있어요.'});
  if (!base) throw Error('IMAGE_BASE_URL이 없어요.');

  const userId = process.env.IG_USER_ID || (await call('GET', '/me', {fields: 'user_id,username'})).user_id;
  const limit = await call('GET', `/${userId}/content_publishing_limit`, {fields: 'config,quota_usage'}).catch(() => null);
  const used = limit?.data?.[0]?.quota_usage, total = limit?.data?.[0]?.config?.quota_total;
  if (used != null && total != null && used >= total) throw Error(`인스타 하루 올리기 한도(${total}개)를 다 썼어요.`);

  // 그림 주소가 실제로 열리는지 먼저 확인 (방금 올린 그림은 몇십 초 늦게 보일 수 있어요)
  const urls = m.files.card.map(name => `${base}/${name}`);
  for (const url of urls) {
    let ok = false;
    for (let i = 0; i < 12 && !ok; i++) { const r = await fetch(url, {method: 'HEAD'}).catch(() => null); ok = r?.ok && /image\/jpeg/.test(r.headers.get('content-type') || ''); if (!ok) await sleep(10000); }
    if (!ok) throw Error('인스타가 가져갈 그림 주소가 열리지 않아요: ' + url);
  }

  const children = [];
  for (const image_url of urls) children.push((await call('POST', `/${userId}/media`, {image_url, is_carousel_item: 'true'})).id);
  const carousel = await call('POST', `/${userId}/media`, {media_type: 'CAROUSEL', children: children.join(','), caption: m.text.instagram.caption});
  for (let i = 0; i < 30; i++) { // 인스타가 그림을 다 받아 갈 때까지 기다려요 (최대 5분)
    const s = await call('GET', `/${carousel.id}`, {fields: 'status_code'});
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw Error('인스타가 카드뉴스를 처리하지 못했어요: ' + s.status_code);
    await sleep(10000);
  }
  const published = await call('POST', `/${userId}/media_publish`, {creation_id: carousel.id});
  const info = await call('GET', `/${published.id}`, {fields: 'permalink'}).catch(() => ({}));
  save({ok: true, mediaId: published.id, url: info.permalink || null, message: `인스타에 올렸어요: ${info.permalink || published.id}` + (used != null ? ` (오늘 ${used + 1}/${total}개 사용)` : '')});
})().catch(e => { save({ok: false, message: '인스타 올리기 실패: ' + e.message}); process.exit(1); });
