#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
given_url="${DATABASE_URL:-}"
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
if [ -n "$given_url" ]; then
  DATABASE_URL="$given_url"
fi

file="${1:?Usage: npm run db:restore -- <backup.dump> [target DATABASE_URL]}"
target="${2:-${DATABASE_URL:?DATABASE_URL is not set}}"

pg_restore --list "$file" > /dev/null
echo "This replaces every MIA table in: $(printf %s "$target" | sed -E 's#//[^@/]*@#//#; s#\?.*##')"
read -r -p "Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$target" "$file"
echo "Restore finished from $file"
