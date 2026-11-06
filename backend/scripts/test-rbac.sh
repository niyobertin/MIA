#!/usr/bin/env bash
set -u
BASE_URL="${TEST_DATABASE_BASE_URL:-$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's#/[^/]*$##')}"
DB="mia_rbac_test"
dropdb --if-exists "$DB" >/dev/null 2>&1
createdb "$DB" || exit 1
DATABASE_URL="$BASE_URL/$DB" NODE_ENV=development SMTP_HOST= npx tsx tests/rbac.integration.ts
status=$?
dropdb --if-exists "$DB"
exit $status
