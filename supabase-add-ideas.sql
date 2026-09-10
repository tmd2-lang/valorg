-- ============================================================
-- VALORG — the idea box
--
-- Run once, in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run twice.
--
-- Ideas deliberately have no project. An idea turns up before you know
-- where it belongs; making you file it on the way in is how ideas end up
-- not written down at all. Filing happens later, when it becomes a task.
-- ============================================================

create table if not exists ideas (
  id         uuid primary key default gen_random_uuid(),

  user_id    uuid not null default auth.uid()
             references auth.users on delete cascade,

  text       text not null,
  created_at timestamptz not null default now()
);

-- Same lock as the projects table: on by default, denying everything
-- until a policy says otherwise.
alter table ideas enable row level security;

drop policy if exists "own rows only" on ideas;
create policy "own rows only" on ideas
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists ideas_user_created_idx
  on ideas (user_id, created_at desc);
