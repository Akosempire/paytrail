-- A read-only login for the QA agent (.claude/agents/usetally-qa.md).
-- Run once in Supabase → SQL Editor. Replace CHANGE-ME with a long random
-- password first (letters and numbers only). It can only read, never write,
-- and every query stops after 15 seconds.
-- Connection string for .env.qa (Supabase → Connect → Session pooler, with
-- the user changed to usetally_readonly.<project-ref>):
--   QA_DATABASE_URL=postgresql://usetally_readonly.<project-ref>:<password>@<pooler-host>:5432/postgres

do $$ begin
  create role usetally_readonly login password 'CHANGE-ME' bypassrls;
exception when duplicate_object then
  alter role usetally_readonly login password 'CHANGE-ME' bypassrls;
end $$;

alter role usetally_readonly set default_transaction_read_only = on;
alter role usetally_readonly set statement_timeout = '15s';
alter role usetally_readonly set idle_in_transaction_session_timeout = '30s';

grant usage on schema public to usetally_readonly;
grant select on all tables in schema public to usetally_readonly;
alter default privileges in schema public grant select on tables to usetally_readonly;

-- no access to auth (passwords, sessions) or storage internals
revoke all on schema auth from usetally_readonly;
