#!/usr/bin/env bash
# Поднимает отдельную БД velomarket_api для проверки запросов сайта через PostgREST
set -euo pipefail
cd "$(dirname "$0")/.."
DB=velomarket_api
sudo -u postgres dropdb --if-exists $DB; sudo -u postgres createdb $DB
run() { sudo -u postgres env PGOPTIONS="-c client_min_messages=warning" psql -q -v ON_ERROR_STOP=1 -d $DB "$@"; }
run -f tests/local_shim.sql
for f in supabase/migrations/*.sql; do run -f "$f"; done
run <<'SQL'
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then
  create role authenticator login password 'authpass' noinherit; end if; end $$;
grant anon, authenticated, service_role to authenticator;
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-00000000000a','tg1@x'),('bbbbbbbb-0000-0000-0000-00000000000b','tg2@x'),('99999999-0000-0000-0000-000000000099','tg3@x');
insert into public.profiles (id, tg_id, username, first_name, is_admin, phone) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 1001, 'seller_a', 'Алмас', false, '+7 701 111 22 33'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 1002, 'buyer_b', 'Бек', false, null),
  ('99999999-0000-0000-0000-000000000099', 1003, 'GrifRift555', 'Админ', true, null);
SQL
echo "api db ready"
