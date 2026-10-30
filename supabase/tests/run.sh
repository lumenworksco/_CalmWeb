#!/usr/bin/env bash
# Runs the migration + tests on a throwaway local Postgres cluster.
set -euo pipefail
cd "$(dirname "$0")/.."
for d in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql*/bin /usr/local/opt/postgresql*/bin; do [ -x "$d/initdb" ] && PATH="$d:$PATH"; done
command -v initdb >/dev/null || { echo "initdb not found: install PostgreSQL 14+"; exit 1; }
D=$(mktemp -d); trap 'pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
PORT=${PGTESTPORT:-54329}
initdb -D "$D/data" -A trust -U postgres >/dev/null
pg_ctl -D "$D/data" -o "-p $PORT -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P="psql -h $D -p $PORT -U postgres -q -v ON_ERROR_STOP=1"
$P -c 'create database t' && P="$P -d t"
$P -f tests/stub_auth.sql
for m in migrations/*.sql; do $P -f "$m"; done
$P -f tests/forms.test.sql
