-- Version matches the hosted migration applied through Supabase.
create schema if not exists sianaly_internal;
revoke all on schema sianaly_internal from public, anon, authenticated;

create table public.sianaly_member_departures (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.sianaly_member_departures enable row level security;
alter table public.sianaly_member_departures force row level security;
revoke all on public.sianaly_member_departures from public, anon, authenticated;
grant select, delete on public.sianaly_member_departures to service_role;
create index sianaly_member_departures_created on public.sianaly_member_departures (created_at);

create function sianaly_internal.queue_member_departure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sianaly_member_departures (user_id)
  values (old.id)
  on conflict (user_id) do nothing;
  return old;
end;
$$;
revoke all on function sianaly_internal.queue_member_departure() from public, anon, authenticated;

create trigger sianaly_queue_member_departure
after delete on auth.users
for each row execute function sianaly_internal.queue_member_departure();
