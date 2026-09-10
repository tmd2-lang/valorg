-- Adds the project goal. Run once, in Supabase: SQL Editor -> New query -> Run.
-- Safe to run twice; the "if not exists" makes the second run do nothing.

alter table projects
  add column if not exists goal text not null default '';
