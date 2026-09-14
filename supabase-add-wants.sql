-- ============================================================
-- VALORG — the buy list
--
-- Run once, in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run twice.
-- ============================================================

create table if not exists wants (
  id         uuid primary key default gen_random_uuid(),

  user_id    uuid not null default auth.uid()
             references auth.users on delete cascade,

  url        text not null default '',
  title      text not null default '',
  site       text not null default '',
  image      text not null default '',

  -- Price is text, not a number: currencies, ranges and "about £40" are all
  -- things you'll want to write. Nothing here does arithmetic on it.
  price      text not null default '',

  note       text not null default '',

  -- Optional. Most things you want aren't for a project.
  project_id uuid references projects on delete set null,

  bought     boolean not null default false,
  bought_at  timestamptz,

  -- When the price was captured, so you know how stale it is.
  priced_at  timestamptz,

  created_at timestamptz not null default now()
);

alter table wants enable row level security;

drop policy if exists "own rows only" on wants;
create policy "own rows only" on wants
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists wants_user_created_idx
  on wants (user_id, created_at desc);
