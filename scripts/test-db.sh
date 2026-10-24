#!/usr/bin/env bash
# Rebuilds a throwaway local database and runs the rule tests. LOCAL ONLY.
set -euo pipefail
cd "$(dirname "$0")/.."
export PGHOST=${PGHOST:-/tmp} PGPORT=${PGPORT:-54322} PGUSER=${PGUSER:-postgres} PGOPTIONS="-c client_min_messages=warning"
psql -q -d postgres -c "drop database if exists pt_test with (force)" -c "create database pt_test"
psql -q -X -v ON_ERROR_STOP=1 -d pt_test -f supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do psql -q -X -v ON_ERROR_STOP=1 -d pt_test -f "$f"; done
PGDATABASE=pt_test node --test supabase/tests/*.test.mjs
