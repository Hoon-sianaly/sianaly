import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
try{
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 insert into auth.users values ('${a}'),('${b}');`);
 const migration=await readFile(new URL('../supabase/migrations/20261103_member_favorites.sql',import.meta.url),'utf8');
 await db.exec(migration);
 const asUser=async id=>db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);
 await asUser(a);await db.exec(`insert into public.sianaly_favorites(user_id,company_key) values ('${a}','samsung');`);
 await assert.rejects(db.exec(`insert into public.sianaly_favorites(user_id,company_key) values ('${b}','naver');`),/row-level security/);
 await asUser(b);assert.equal((await db.query('select * from public.sianaly_favorites')).rows.length,0);
 await db.exec(`insert into public.sianaly_favorites(user_id,company_key) values ('${b}','kakao');`);
 await db.exec(`delete from public.sianaly_favorites where user_id='${a}';`);
 await assert.rejects(db.exec(`update public.sianaly_favorites set company_key='naver';`),/permission denied/);
 await asUser(a);assert.deepEqual((await db.query('select company_key from public.sianaly_favorites')).rows,[{company_key:'samsung'}]);
 await db.exec('reset role; set role anon;');await assert.rejects(db.query('select * from public.sianaly_favorites'),/permission denied/);
 await db.exec(`reset role; delete from auth.users where id='${a}';`);
 assert.deepEqual((await db.query('select user_id,company_key from public.sianaly_favorites')).rows,[{user_id:b,company_key:'kakao'}]);
 console.log('Member RLS: owner isolation, anonymous denial, update denial and cascade passed.');
}finally{await db.close();}
