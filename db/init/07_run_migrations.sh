#!/bin/bash
# Auto-run migration SQL files in alphabetical order
# Mount ./db/migrations to /migrations in docker-compose.yml
MYSQL_CMD="mysql -u${MYSQL_USER:-boardgame} -p${MYSQL_PASSWORD:-boardgame} ${MYSQL_DATABASE:-boardgame}"
if [ -d /migrations ]; then
  echo "[migrations] running migration files..."
  for f in $(ls /migrations/*.sql 2>/dev/null | sort); do
    echo "[migrations] applying: $(basename $f)"
    $MYSQL_CMD < "$f" || echo "[migrations] WARN: $(basename $f) failed (may already be applied)"
  done
  echo "[migrations] done."
else
  echo "[migrations] no migrations directory found, skipping."
fi
