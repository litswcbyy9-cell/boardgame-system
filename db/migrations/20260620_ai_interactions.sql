SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS ai_interactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_type ENUM('staff', 'customer', 'system') NOT NULL DEFAULT 'staff',
  user_id INT UNSIGNED NULL,
  scope VARCHAR(32) NULL,
  message_preview VARCHAR(300) NULL,
  tools_json JSON NULL,
  mock TINYINT(1) NOT NULL DEFAULT 0,
  duration_ms INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_ai_interactions_created (created_at),
  KEY ix_ai_interactions_user (user_type, user_id)
) ENGINE=InnoDB COMMENT='AI assistant interaction audit without secrets';
