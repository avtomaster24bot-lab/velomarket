#!/usr/bin/env bash
# Локальная проверка миграций и RLS на чистом PostgreSQL (без Supabase)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=velomarket_test
sudo -u postgres dropdb --if-exists $DB
sudo -u postgres createdb $DB
run() { sudo -u postgres env PGOPTIONS="-c client_min_messages=warning" psql -q -v ON_ERROR_STOP=1 -d $DB -f "$1"; }
run tests/local_shim.sql
for f in supabase/migrations/*.sql; do echo "== $f"; run "$f"; done
# повторное применение должно быть безопасным (идемпотентность)
for f in supabase/migrations/*.sql; do run "$f" >/dev/null; done
echo "== migrations re-applied OK"
sudo -u postgres psql -q -t -A -v ON_ERROR_STOP=1 -d $DB -f tests/rls_test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /' | grep -vE '^$|^[0-9a-f-]{36}$|^ *$'
