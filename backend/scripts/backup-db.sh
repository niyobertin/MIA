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

: "${DATABASE_URL:?DATABASE_URL is not set}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/mia-$stamp.dump"
tmp="$file.partial"

pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$tmp"
pg_restore --list "$tmp" > /dev/null
mv "$tmp" "$file"

find "$BACKUP_DIR" -name 'mia-*.dump' -type f -mtime "+$BACKUP_KEEP_DAYS" -delete

echo "Backup written: $file ($(du -h "$file" | cut -f1))"
