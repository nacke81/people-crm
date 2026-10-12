-- People CRM: one table, every row owned by exactly one login. Row-level security is the whole privacy story.
create table public.people (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  relationship text,
  last_touched date,
  cadence_days int check (cadence_days between 1 and 730),
  follow_up    date,
  birthday     text check (birthday ~ '^(\d{4}-)?\d{2}-\d{2}$'),
  gifts        text[] not null default '{}',
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

alter table public.people enable row level security;
alter table public.people force row level security;

-- Logged-out visitors get nothing, not even an empty-table answer from a policy.
revoke all on public.people from anon;
grant select, insert, update, delete on public.people to authenticated;

create policy "own rows: read"   on public.people for select to authenticated using (owner = auth.uid());
create policy "own rows: add"    on public.people for insert to authenticated with check (owner = auth.uid());
create policy "own rows: change" on public.people for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "own rows: delete" on public.people for delete to authenticated using (owner = auth.uid());

create index people_owner on public.people(owner);
