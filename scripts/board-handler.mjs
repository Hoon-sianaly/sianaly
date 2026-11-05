export async function handleBoard({db, url, method, user, nickname, readBody, respond}) {
 if (!db) return respond({code:'board_unavailable'},503);
 const postId = Number(url.searchParams.get('post') || 0);
 const before = Number(url.searchParams.get('before') || Number.MAX_SAFE_INTEGER);
 const mine = url.searchParams.get('mine') === '1';
 if (!Number.isSafeInteger(postId) || postId < 0 || !Number.isSafeInteger(before) || before < 1) {
  return respond({code:'invalid_post'},400);
 }
 // Use separate tables in the site's existing D1 database.
 await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS board_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, author TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS board_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE, owner TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)'),
  db.prepare('CREATE INDEX IF NOT EXISTS board_comments_post ON board_comments (post_id, id)'),
  db.prepare('CREATE INDEX IF NOT EXISTS board_posts_owner_time ON board_posts (owner, created_at)'),
  db.prepare('CREATE INDEX IF NOT EXISTS board_comments_owner_time ON board_comments (owner, created_at)')
 ]);
 if (method === 'GET') {
  if (mine) {
   if (!user) return respond({code:'login_required'},401);
   const {results} = await db.prepare('SELECT id, title, author, created_at FROM board_posts WHERE owner = ? AND id < ? ORDER BY id DESC LIMIT 21').bind(user.id,before).all();
   return respond({posts:results.slice(0,20), next:results.length > 20 ? results[19].id : null});
  }
  if (postId) {
   const post = await db.prepare('SELECT id, title, body, author, created_at, owner FROM board_posts WHERE id = ?').bind(postId).first();
   if (!post) return respond({code:'post_not_found'},404);
   const {results} = await db.prepare('SELECT id, body, author, created_at FROM board_comments WHERE post_id = ? AND id < ? ORDER BY id DESC LIMIT 21').bind(postId,before).all();
   const {owner,...publicPost} = post;
   return respond({post:publicPost, canManage:user?.id===owner, comments:results.slice(0,20), next:results.length > 20 ? results[19].id : null});
  }
  const {results} = await db.prepare('SELECT id, title, author, created_at FROM board_posts WHERE id < ? ORDER BY id DESC LIMIT 21').bind(before).all();
  return respond({posts:results.slice(0,20), next:results.length > 20 ? results[19].id : null});
 }
 if (!user) return respond({code:'login_required'},401);
 if (method === 'PATCH' || method === 'DELETE') {
  if (!postId) return respond({code:'invalid_post'},400);
  let result;
  if (method === 'DELETE') {
   result = await db.prepare('DELETE FROM board_posts WHERE id = ? AND owner = ?').bind(postId,user.id).run();
  } else {
   const input = await readPostInput(readBody);
   if (!validPost(input)) return respond({code:'invalid_post'},400);
   result = await db.prepare('UPDATE board_posts SET title = ?, body = ? WHERE id = ? AND owner = ?').bind(input.title,input.body,postId,user.id).run();
  }
  return result.meta.changes ? respond({id:postId}) : respond({code:'post_not_found'},404);
 }
 if (!nickname) return respond({code:'nickname_required'},409);
 const input = await readPostInput(readBody);
 if (!input) return respond({code:'invalid_post'},400);
 const {body,title} = input;
 const now = Date.now();
 if (postId) {
  if (!body || body.length > 500) return respond({code:'invalid_post'},400);
  const result = await db.prepare('INSERT INTO board_comments (post_id, owner, author, body, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM board_posts WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM board_comments WHERE owner = ? AND created_at > ?)').bind(postId,user.id,nickname,body,now,postId,user.id,now-5000).run();
  if (!result.meta.changes) {
   const exists = await db.prepare('SELECT id FROM board_posts WHERE id = ?').bind(postId).first();
   return exists ? respond({code:'slow_down'},429) : respond({code:'post_not_found'},404);
  }
  return respond({id:postId},201);
 }
 if (!validPost(input)) return respond({code:'invalid_post'},400);
 const result = await db.prepare('INSERT INTO board_posts (owner, author, title, body, created_at) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM board_posts WHERE owner = ? AND created_at > ?)').bind(user.id,nickname,title,body,now,user.id,now-15000).run();
 return result.meta.changes ? respond({id:result.meta.last_row_id},201) : respond({code:'slow_down'},429);
}
async function readPostInput(readBody) {
 try {
  const input = await readBody();
  return {
   body:typeof input.body === 'string' ? input.body.trim() : '',
   title:typeof input.title === 'string' ? input.title.trim() : ''
  };
 } catch { return null; }
}
function validPost(input) {
 return input?.title && input.title.length <= 100 && input.body && input.body.length <= 4000;
}
