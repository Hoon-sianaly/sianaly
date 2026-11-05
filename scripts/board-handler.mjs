export async function initializeBoard(db) {
 if (!db) throw new Error('Board database required');
 await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS board_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, author TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS board_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE, owner TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)'),
  db.prepare('CREATE INDEX IF NOT EXISTS board_comments_post ON board_comments (post_id, id)'),
  db.prepare('CREATE INDEX IF NOT EXISTS board_posts_owner_time ON board_posts (owner, created_at)'),
  db.prepare('CREATE INDEX IF NOT EXISTS board_comments_owner_time ON board_comments (owner, created_at)'),
  db.prepare('CREATE TABLE IF NOT EXISTS board_hidden_posts (post_id INTEGER PRIMARY KEY REFERENCES board_posts(id) ON DELETE CASCADE, hidden_at INTEGER NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS board_departed_members (owner_hash TEXT PRIMARY KEY)')
 ]);
}
async function ownerHash(id) {
 const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));
 return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function syncBoardDepartures(db, admin) {
 // Auth deletion records the event in the same transaction. Acknowledge only after D1 commits.
 for (let batch=0; batch<5; batch++) {
  const {data,error} = await admin.from('sianaly_member_departures').select('user_id').order('created_at',{ascending:true}).limit(100);
  if (error) throw new Error('Departure queue unavailable');
  if (!data.length) return;
  const ids = data.map(row=>row.user_id);
  const hashes = await Promise.all(ids.map(ownerHash));
  const placeholders = ids.map(()=>'?').join(',');
  await db.batch([
   db.prepare('INSERT OR IGNORE INTO board_departed_members (owner_hash) VALUES '+ids.map(()=>'(?)').join(',')).bind(...hashes),
   db.prepare("UPDATE board_posts SET owner = '', author = '탈퇴한 회원' WHERE owner IN ("+placeholders+')').bind(...ids),
   db.prepare("UPDATE board_comments SET owner = '', author = '탈퇴한 회원' WHERE owner IN ("+placeholders+')').bind(...ids)
  ]);
  const acknowledged = await admin.from('sianaly_member_departures').delete().in('user_id',ids);
  if (acknowledged.error) throw new Error('Departure acknowledgment failed');
  if (data.length<100) return;
 }
 throw new Error('Departure synchronization pending');
}
export async function handleBoard({db, url, method, user, nickname, readBody, respond, syncDepartures}) {
 if (!db) return respond({code:'board_unavailable'},503);
 const postId = Number(url.searchParams.get('post') || 0);
 const before = Number(url.searchParams.get('before') || Number.MAX_SAFE_INTEGER);
 const mine = url.searchParams.get('mine') === '1';
 const moderation = url.searchParams.get('moderation') === '1';
 const canModerate = user?.app_metadata?.sianaly_role === 'admin';
 if (!Number.isSafeInteger(postId) || postId < 0 || !Number.isSafeInteger(before) || before < 1) {
  return respond({code:'invalid_post'},400);
 }
 if (moderation && !canModerate) return respond({code:'forbidden'},403);
 await initializeBoard(db);
 if (syncDepartures) await syncDepartures();
 if (method === 'GET') {
  if (mine) {
   if (!user) return respond({code:'login_required'},401);
   const {results} = await db.prepare('SELECT p.id, p.title, p.author, p.created_at, h.post_id IS NOT NULL AS hidden FROM board_posts p LEFT JOIN board_hidden_posts h ON h.post_id = p.id WHERE p.owner = ? AND p.id < ? ORDER BY p.id DESC LIMIT 21').bind(user.id,before).all();
   return respond({posts:results.slice(0,20), next:results.length > 20 ? results[19].id : null});
  }
  if (postId) {
   const post = await db.prepare('SELECT p.id, p.title, p.body, p.author, p.created_at, p.owner, h.post_id IS NOT NULL AS hidden FROM board_posts p LEFT JOIN board_hidden_posts h ON h.post_id = p.id WHERE p.id = ?').bind(postId).first();
   if (!post || post.hidden && !canModerate && user?.id!==post.owner) return respond({code:'post_not_found'},404);
   const {results} = await db.prepare('SELECT id, body, author, created_at FROM board_comments WHERE post_id = ? AND id < ? ORDER BY id DESC LIMIT 21').bind(postId,before).all();
   const {owner,...publicPost} = post;
   return respond({post:publicPost, canManage:user?.id===owner, canModerate, comments:results.slice(0,20), next:results.length > 20 ? results[19].id : null});
  }
  const {results} = await db.prepare('SELECT p.id, p.title, p.author, p.created_at, h.post_id IS NOT NULL AS hidden FROM board_posts p LEFT JOIN board_hidden_posts h ON h.post_id = p.id WHERE p.id < ? AND (h.post_id IS NOT NULL) = ? ORDER BY p.id DESC LIMIT 21').bind(before,moderation?1:0).all();
  return respond({posts:results.slice(0,20), canModerate, next:results.length > 20 ? results[19].id : null});
 }
 if (!user) return respond({code:'login_required'},401);
 const memberHash = await ownerHash(user.id);
 if (await db.prepare('SELECT owner_hash FROM board_departed_members WHERE owner_hash = ?').bind(memberHash).first()) return respond({code:'login_required'},401);
 if (method === 'PATCH' || method === 'DELETE') {
  if (!postId) return respond({code:'invalid_post'},400);
  let result;
  if (method === 'DELETE') {
   result = await db.prepare('DELETE FROM board_posts WHERE id = ? AND (owner = ? OR ? = 1) AND NOT EXISTS (SELECT 1 FROM board_departed_members WHERE owner_hash = ?)').bind(postId,user.id,canModerate?1:0,memberHash).run();
  } else {
   let raw;
   try { raw = await readBody(); } catch { return respond({code:'invalid_post'},400); }
   if (Object.hasOwn(raw,'hidden')) {
    if (!canModerate) return respond({code:'forbidden'},403);
    if (typeof raw.hidden!=='boolean' || Object.keys(raw).some(key=>key!=='hidden')) return respond({code:'invalid_post'},400);
    if (!await db.prepare('SELECT id FROM board_posts WHERE id = ?').bind(postId).first()) return respond({code:'post_not_found'},404);
    if (raw.hidden) {
     await db.prepare('INSERT INTO board_hidden_posts (post_id, hidden_at) SELECT id, ? FROM board_posts WHERE id = ? AND NOT EXISTS (SELECT 1 FROM board_departed_members WHERE owner_hash = ?) ON CONFLICT(post_id) DO UPDATE SET hidden_at = excluded.hidden_at').bind(Date.now(),postId,memberHash).run();
    } else {
     await db.prepare('DELETE FROM board_hidden_posts WHERE post_id = ? AND NOT EXISTS (SELECT 1 FROM board_departed_members WHERE owner_hash = ?)').bind(postId,memberHash).run();
    }
    return respond({id:postId});
   }
   const input = normalizePostInput(raw);
   if (!validPost(input)) return respond({code:'invalid_post'},400);
   result = await db.prepare('UPDATE board_posts SET title = ?, body = ? WHERE id = ? AND owner = ? AND NOT EXISTS (SELECT 1 FROM board_departed_members WHERE owner_hash = ?)').bind(input.title,input.body,postId,user.id,memberHash).run();
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
  const result = await db.prepare('INSERT INTO board_comments (post_id, owner, author, body, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM board_posts WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM board_hidden_posts WHERE post_id = ?) AND NOT EXISTS (SELECT 1 FROM board_departed_members WHERE owner_hash = ?) AND NOT EXISTS (SELECT 1 FROM board_comments WHERE owner = ? AND created_at > ?)').bind(postId,user.id,nickname,body,now,postId,postId,memberHash,user.id,now-5000).run();
  if (!result.meta.changes) {
   const exists = await db.prepare('SELECT id FROM board_posts WHERE id = ? AND NOT EXISTS (SELECT 1 FROM board_hidden_posts WHERE post_id = ?)').bind(postId,postId).first();
   return exists ? respond({code:'slow_down'},429) : respond({code:'post_not_found'},404);
  }
  return respond({id:postId},201);
 }
 if (!validPost(input)) return respond({code:'invalid_post'},400);
 const result = await db.prepare('INSERT INTO board_posts (owner, author, title, body, created_at) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM board_departed_members WHERE owner_hash = ?) AND NOT EXISTS (SELECT 1 FROM board_posts WHERE owner = ? AND created_at > ?)').bind(user.id,nickname,title,body,now,memberHash,user.id,now-15000).run();
 return result.meta.changes ? respond({id:result.meta.last_row_id},201) : respond({code:'slow_down'},429);
}
async function readPostInput(readBody) {
 try {
  return normalizePostInput(await readBody());
 } catch { return null; }
}
function normalizePostInput(input) {
 return {body:typeof input.body === 'string' ? input.body.trim() : '',title:typeof input.title === 'string' ? input.title.trim() : ''};
}
function validPost(input) {
 return input?.title && input.title.length <= 100 && input.body && input.body.length <= 4000;
}
