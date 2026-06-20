#!/bin/bash
set -e

# Auto-run migration SQL files in alphabetical order.
# Mount ./db/migrations to /migrations in docker-compose.yml.
MYSQL_CMD="mysql -u${MYSQL_USER:-boardgame} -p${MYSQL_PASSWORD:-boardgame} ${MYSQL_DATABASE:-boardgame}"

$MYSQL_CMD <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  success TINYINT(1) NOT NULL DEFAULT 1,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  error_message TEXT NULL,
  PRIMARY KEY (filename)
) ENGINE=InnoDB COMMENT='Database migration execution records';
SQL

if [ ! -d /migrations ]; then
  echo "[migrations] no migrations directory found, skipping."
  exit 0
fi

echo "[migrations] running migration files..."
for f in $(ls /migrations/*.sql 2>/dev/null | sort); do
  base="$(basename "$f")"
  checksum="$(sha256sum "$f" | awk '{print $1}')"
  already_applied="$($MYSQL_CMD -N -B -e "SELECT COUNT(*) FROM schema_migrations WHERE filename='${base}' AND success=1")"
  if [ "$already_applied" = "1" ]; then
    echo "[migrations] skipping already applied: $base"
    continue
  fi

  echo "[migrations] applying: $base"
  if $MYSQL_CMD < "$f"; then
    $MYSQL_CMD -e "INSERT INTO schema_migrations (filename, checksum, success, error_message) VALUES ('${base}', '${checksum}', 1, NULL) ON DUPLICATE KEY UPDATE checksum=VALUES(checksum), success=1, applied_at=CURRENT_TIMESTAMP, error_message=NULL"
  else
    $MYSQL_CMD -e "INSERT INTO schema_migrations (filename, checksum, success, error_message) VALUES ('${base}', '${checksum}', 0, 'migration failed') ON DUPLICATE KEY UPDATE checksum=VALUES(checksum), success=0, applied_at=CURRENT_TIMESTAMP, error_message='migration failed'"
    echo "[migrations] ERROR: $base failed"
    exit 1
  fi
done
echo "[migrations] done."
