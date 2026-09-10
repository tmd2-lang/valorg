-- ============================================================
-- VALORG — database setup
--
-- Run this once, in the Supabase dashboard:
--   SQL Editor -> New query -> paste this -> Run
--
-- It creates one table and locks it down so each account can only
-- ever see its own rows.
-- ============================================================

create table if not exists projects (
  id         uuid primary key default gen_random_uuid(),

  -- Who owns this row. Filled in automatically from whoever is logged in.
  user_id    uuid not null default auth.uid()
             references auth.users on delete cascade,

  name       text not null,

  -- The one line that says where this is going. Shown prominently, on
  -- purpose — it is meant to be hard to ignore.
  goal       text not null default '',

  note       text not null default '',
  status     text not null default 'active',

  -- The task list, stored as JSON on the project itself. Simple, and it
  -- matches how the app already thinks about tasks. If tasks ever need
  -- their own dates, owners, or sorting, they can move to their own table.
  tasks      jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

-- Turn on row security. Until a policy exists, this denies everything —
-- which is the safe default.
alter table projects enable row level security;

-- The rule: you may read and write rows where user_id is you, and nothing else.
drop policy if exists "own rows only" on projects;
create policy "own rows only" on projects
  for all
  using      (auth.uid() = user_id)   -- which rows you can see
  with check (auth.uid() = user_id);  -- which rows you may write

-- Makes loading your own projects fast once there are a lot of them.
create index if not exists projects_user_created_idx
  on projects (user_id, created_at desc);
