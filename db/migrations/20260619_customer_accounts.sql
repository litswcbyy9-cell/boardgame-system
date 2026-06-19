SET NAMES utf8mb4;

SET @has_player_password := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'players' AND COLUMN_NAME = 'password_hash'
);
SET @sql := IF(@has_player_password = 0,
  'ALTER TABLE players ADD COLUMN password_hash VARCHAR(180) NULL COMMENT ''顾客登录密码哈希'' AFTER phone',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_player_last_login := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'players' AND COLUMN_NAME = 'last_login_at'
);
SET @sql := IF(@has_player_last_login = 0,
  'ALTER TABLE players ADD COLUMN last_login_at DATETIME NULL COMMENT ''顾客最近登录时间'' AFTER password_hash',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_players_phone_index := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'players' AND INDEX_NAME = 'ix_players_phone'
);
SET @sql := IF(@has_players_phone_index = 0,
  'ALTER TABLE players ADD KEY ix_players_phone (phone)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS player_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_player_sessions_token_hash (token_hash),
  KEY ix_player_sessions_player (player_id),
  KEY ix_player_sessions_expires (expires_at),
  CONSTRAINT fk_player_sessions_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='顾客登录会话';
