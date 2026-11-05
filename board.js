(() => {
 const content = document.getElementById('board-content');
 const status = document.getElementById('board-status');
 const writeLink = document.getElementById('board-write');
 const query = new URLSearchParams(location.search);
 const postId = query.get('post');
 const writing = query.get('write') === '1';
 const api = '/api/account/board';
 const errors = {
  login_required:'로그인한 뒤 작성할 수 있어요.',
  nickname_required:'먼저 내 계정에서 별명을 설정해 주세요.',
  invalid_post:'입력 내용을 확인해 주세요.',
  slow_down:'잠시 기다렸다 다시 등록해 주세요.',
  post_not_found:'글을 찾을 수 없어요.'
 };
 function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  if (className) node.className = className;
  return node;
 }
 function link(label, url, className) {
  const node = element('a',label,className);
  node.href = url;
  return node;
 }
 function metadata(item) {
  const time = new Date(item.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'});
  return element('small',item.author + ' · ' + time,'board-meta');
 }
 async function request(url, options) {
  const response = await fetch(url,options);
  const data = await response.json();
  if (!response.ok) throw new Error(errors[data.code] || '게시판을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  return data;
 }
 function renderMore(parent, next, load) {
  if (!next) return;
  const button = element('button','더 보기','board-secondary');
  button.type = 'button';
  parent.append(button);
  button.onclick = async () => {
   button.disabled = true;
   try { await load(next); button.remove(); }
   catch (error) { status.textContent = error.message; button.disabled = false; }
  };
 }
 async function addForm(parent, comment) {
  let member;
  try { member = await request('/api/account/session'); } catch { member = null; }
  if (!member?.signedIn || !member.nickname) {
   parent.append(element('p',member?.signedIn ? '내 계정에서 별명을 설정한 뒤 작성할 수 있어요.' : '상단에서 로그인한 뒤 작성할 수 있어요.'));
   return;
  }
  const form = element('form');
  const fields = comment ? [['body','댓글',500,'textarea']] : [['title','제목',100,'input'],['body','내용',4000,'textarea']];
  for (const [name,label,limit,tag] of fields) {
   const input = element(tag);
   input.id = 'board-' + name;
   input.name = name;
   input.maxLength = limit;
   input.required = true;
   const caption = element('label',label);
   caption.htmlFor = input.id;
   form.append(caption,input);
  }
  const submit = element('button',comment ? '댓글 등록' : '글 등록','board-primary');
  submit.type = 'submit';
  const feedback = element('p');
  feedback.setAttribute('role','alert');
  form.append(submit,feedback);
  parent.append(form);
  form.onsubmit = async event => {
   event.preventDefault();
   submit.disabled = true;
   feedback.textContent = '';
   try {
    const body = Object.fromEntries(new FormData(form));
    const result = await request(comment ? api + '?post=' + encodeURIComponent(postId) : api,{
     method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    location.assign('board.html?post=' + encodeURIComponent(result.id));
   } catch (error) {
    feedback.textContent = error.message;
    submit.disabled = false;
   }
  };
 }
 async function main() {
  if (writing || postId) {
   document.getElementById('board-toolbar').hidden = true;
   document.querySelector('.board-hero').classList.add('board-hero-compact');
   content.append(link('← 목록으로','board.html','board-secondary'));
  }
  if (writing) {
   const card = element('div',null,'board-card');
   card.append(element('h2','새 글'));
   content.append(card);
   await addForm(card,false);
   return;
  }
  status.textContent = '불러오는 중…';
  if (postId) {
   const url = api + '?post=' + encodeURIComponent(postId);
   const {post,comments,next} = await request(url);
   const article = element('article',null,'board-card');
   article.append(element('h2',post.title),metadata(post),element('p',post.body,'board-body'));
   content.append(article);
   const section = element('section',null,'board-card');
   section.append(element('h2','댓글'));
   const list = element('div');
   section.append(list);
   const appendComments = rows => {
    for (const comment of rows) {
     const entry = element('div');
     entry.append(metadata(comment),element('p',comment.body,'board-body'));
     list.append(entry);
    }
   };
   const loadComments = async before => {
    const page = await request(url + '&before=' + before);
    appendComments(page.comments);
    renderMore(list,page.next,loadComments);
   };
   appendComments(comments);
   if (!comments.length) list.append(element('p','아직 댓글이 없어요.'));
   renderMore(list,next,loadComments);
   content.append(section);
   await addForm(section,true);
  } else {
   const card = element('div',null,'board-card board-feed');
   const list = element('ul',null,'board-list');
   card.append(list);
   content.append(card);
   const loadPosts = async before => {
    const {posts,next} = await request(before ? api + '?before=' + before : api);
    for (const post of posts) {
     const item = element('li');
     const title = link(post.title,'board.html?post=' + encodeURIComponent(post.id));
     title.append(metadata(post));
     item.append(title);
     list.append(item);
    }
    if (!before && !posts.length) {
     const empty = element('div',null,'board-empty');
     const icon = element('span',null,'board-empty-icon');
     icon.setAttribute('aria-hidden','true');
     empty.append(icon,element('h3','아직 올라온 글이 없어요'),
      element('p','요즘 눈여겨보는 기업이나 궁금한 점을 남겨보세요.'),
      link('첫 글 쓰기',writeLink.href,'board-secondary'));
     card.append(empty);
    }
    renderMore(card,next,loadPosts);
   };
   await loadPosts();
  }
  status.textContent = '';
 }
 main().catch(error => { status.textContent = error.message; });
})();
