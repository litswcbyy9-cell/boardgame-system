-- Enterprise foundation migration: audit logs for production operations.
-- Safe to run against an existing boardgame database.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT UNSIGNED NULL COMMENT 'Reserved tenant id',
  user_id INT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(64) NULL,
  request_method VARCHAR(10) NOT NULL,
  request_path VARCHAR(255) NOT NULL,
  status_code SMALLINT UNSIGNED NOT NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  request_body_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_created (created_at),
  KEY ix_audit_user_created (user_id, created_at),
  KEY ix_audit_resource (resource_type, resource_id, created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Operation audit logs';
