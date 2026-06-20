SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  success TINYINT(1) NOT NULL DEFAULT 1,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  error_message TEXT NULL,
  PRIMARY KEY (filename)
) ENGINE=InnoDB COMMENT='Database migration execution records';
