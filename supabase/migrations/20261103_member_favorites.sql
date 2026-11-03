begin;

create table if not exists public.sianaly_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_key text not null check (company_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, company_key)
);

alter table public.sianaly_favorites enable row level security;
alter table public.sianaly_favorites force row level security;
revoke all on public.sianaly_favorites from anon;
revoke all on public.sianaly_favorites from authenticated;
grant select, insert, delete on public.sianaly_favorites to authenticated;

create policy sianaly_favorites_read_own on public.sianaly_favorites for select to authenticated
  using ((select auth.uid()) = user_id);
create policy sianaly_favorites_insert_own on public.sianaly_favorites for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy sianaly_favorites_delete_own on public.sianaly_favorites for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
