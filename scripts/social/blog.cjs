// Naver blog draft in three shapes, all from manifest.text.blog:
//   blogPage     : 내 컴퓨터에서 열어 보는 미리보기 (제목·본문·태그 복사 버튼)
//   blogText     : 그냥 글자만 (그림 자리는 [그림: card-1.jpg]로 표시)
//   blogMarkdown : 매일 GitHub 알림(이슈)으로 보내는 초안 (그림은 인터넷 주소)
// 네이버 블로그는 자동 글쓰기 기능(API)이 2020년에 없어져서, 발행 버튼은 사람이 눌러요.
'use strict';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

function blogText(m) {
  const b = m.text.blog, out = [b.title, ''];
  for (const s of b.sections) {
    if (s.type === 'image') out.push(`[그림: ${s.file}]`, '');
    else if (s.type === 'heading') out.push(`■ ${s.text}`);
    else if (s.type === 'list') out.push(...s.items.map(i => `· ${i}`), '');
    else if (s.type === 'link') out.push(`${s.text}: ${s.url}`, '');
    else out.push(s.text, '');
  }
  out.push('태그: ' + b.tags.map(t => '#' + t).join(' '));
  return out.join('\n');
}

function blogMarkdown(m, imageBase) {
  const b = m.text.blog, out = [];
  for (const s of b.sections) {
    if (s.type === 'image') out.push(`![${s.file}](${imageBase}/${s.file})`, '');
    else if (s.type === 'heading') out.push(`### ${s.text}`, '');
    else if (s.type === 'list') out.push(...s.items.map(i => `- ${i}`), '');
    else if (s.type === 'link') out.push(`[${s.text}](${s.url})`, '');
    else out.push(s.text, '');
  }
  return out.join('\n');
}

function bodyHTML(m) {
  return m.text.blog.sections.map(s => {
    if (s.type === 'image') return `<p><img src="${esc(s.file)}" alt="${esc(m.facts.name)} 카드" width="540"></p>`;
    if (s.type === 'heading') return `<h3>${esc(s.text)}</h3>`;
    if (s.type === 'list') return `<ul>${s.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
    if (s.type === 'link') return `<p><a href="${esc(s.url)}">${esc(s.text)}</a></p>`;
    return `<p>${esc(s.text)}</p>`;
  }).join('\n');
}

function blogPage(m) {
  const b = m.text.blog, tags = b.tags.map(t => '#' + t).join(' ');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>블로그 초안 ${esc(m.id)}</title><style>
:root{--bg:#f4f6fa;--card:#fff;--ink:#14213a;--muted:#5b6b85;--line:#dfe5ef;--accent:#0b6fd3}
@media (prefers-color-scheme:dark){:root{--bg:#0b1424;--card:#121d31;--ink:#e8eef8;--muted:#9aabc4;--line:#22324d;--accent:#58a9f5}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif;line-height:1.7}
.wrap{max-width:760px;margin:0 auto;padding:24px 16px 64px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 16px}
button{font:inherit;border:0;border-radius:8px;padding:8px 14px;background:var(--accent);color:#fff;cursor:pointer}
.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px}
.hint{color:var(--muted);font-size:14px}h1{font-size:22px;margin:0}
#body img{max-width:100%;height:auto;border-radius:8px}#body h3{margin:28px 0 8px}
</style></head><body><div class="wrap">
<p class="hint">네이버 블로그 초안 · ${esc(m.id)} · 2번 검토를 통과한 숫자예요. 순서: ① 제목 복사 → ② 본문 복사 → 네이버 글쓰기에 붙여넣기 → 그림이 빠졌으면 같은 폴더의 card 그림을 끌어다 넣기 → ③ 태그 넣고 발행.</p>
<div class="bar"><button data-copy="title">① 제목 복사</button><button data-copy="body">② 본문 복사</button><button data-copy="tags">③ 태그 복사</button><span id="msg" class="hint"></span></div>
<div class="box"><h1 id="title">${esc(b.title)}</h1><hr><div id="body">${bodyHTML(m)}</div><hr><p id="tags" class="hint">${esc(tags)}</p></div>
</div><script>
const msg=document.getElementById('msg');
document.querySelectorAll('[data-copy]').forEach(btn=>btn.onclick=async()=>{
 const el=document.getElementById(btn.dataset.copy);
 try{
  if(btn.dataset.copy==='body'&&window.ClipboardItem){await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([el.innerHTML],{type:'text/html'}),'text/plain':new Blob([el.innerText],{type:'text/plain'})})]);}
  else await navigator.clipboard.writeText(el.innerText);
  msg.textContent='복사했어요';
 }catch{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);msg.textContent='선택해 뒀어요. Ctrl+C를 눌러 주세요';}
});
</script></body></html>`;
}

module.exports = {blogPage, blogText, blogMarkdown};
