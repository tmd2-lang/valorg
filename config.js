/* Supabase connection details.

   Both values below are meant to be public — the anon key is a project
   identifier, not a password. It is safe in this file and safe in git.
   What actually protects your data is the row-security rule in
   supabase-setup.sql, which says each person can only see their own rows.

   The key you must NEVER put here is the one labelled "service_role" in
   the Supabase dashboard. That one bypasses every rule. */

const SUPABASE_URL      = 'https://hpzyhduzkcvqzvonsmwx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwenloZHV6a2N2cXp2b25zbXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NjY1MDEsImV4cCI6MjEwNDU0MjUwMX0.7wgAcA0DQX5aaA19HQh_oO5KxcahttWLt16tMcoQu2k';
