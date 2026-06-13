-- =====================================================================
-- Phase B: 桌游租借服务 — 实体副本库存 + 借还记录
-- 幂等：可重复执行
-- =====================================================================
SET NAMES utf8mb4;

-- 1) 桌游实体副本（库存单元）
CREATE TABLE IF NOT EXISTS game_copies (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  barcode VARCHAR(64) NULL COMMENT '条码/编号',
  status ENUM('available','lent','maintenance','lost') NOT NULL DEFAULT 'available',
  condition_note VARCHAR(120) NULL COMMENT '品相说明',
  location VARCHAR(80) NULL COMMENT '存放位置',
  deposit_cents INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '建议押金（分）',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_copies_barcode (barcode),
  KEY ix_copies_game (game_id),
  KEY ix_copies_status (status),
  CONSTRAINT fk_copies_game FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='桌游实体副本';

-- 2) 借还记录
CREATE TABLE IF NOT EXISTS game_loans (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  copy_id INT UNSIGNED NOT NULL,
  game_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NULL,
  staff_id INT UNSIGNED NULL,
  borrowed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at DATETIME NULL COMMENT '应归还时间',
  returned_at DATETIME NULL,
  deposit_cents INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '实收押金（分）',
  status ENUM('active','returned','overdue','lost') NOT NULL DEFAULT 'active',
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_loans_copy (copy_id),
  KEY ix_loans_game (game_id),
  KEY ix_loans_player (player_id),
  KEY ix_loans_status (status),
  KEY ix_loans_due (due_at),
  CONSTRAINT fk_loans_copy FOREIGN KEY (copy_id) REFERENCES game_copies (id) ON DELETE CASCADE,
  CONSTRAINT fk_loans_game FOREIGN KEY (game_id) REFERENCES games (id),
  CONSTRAINT fk_loans_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='桌游借还记录';

SELECT 'Phase B rental migration done' AS status,
  (SELECT COUNT(*) FROM game_copies) AS copies,
  (SELECT COUNT(*) FROM game_loans) AS loans;
