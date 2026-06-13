-- =====================================================================
-- Phase A: ELO 计分系统 / 多人对局参与者
-- 幂等：可重复执行
-- =====================================================================
SET NAMES utf8mb4;

-- 1) player_stats 增加 elo_rating 和 losses 列（先查后加，MySQL 8 不支持 ADD COLUMN IF NOT EXISTS 的旧版兼容写法）
SET @has_elo := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_stats' AND COLUMN_NAME = 'elo_rating');
SET @sql := IF(@has_elo = 0,
  'ALTER TABLE player_stats ADD COLUMN elo_rating INT NOT NULL DEFAULT 1200 COMMENT ''ELO 评分''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_losses := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_stats' AND COLUMN_NAME = 'losses');
SET @sql := IF(@has_losses = 0,
  'ALTER TABLE player_stats ADD COLUMN losses INT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''败场数''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) 多人对局参与者表：每局每个参与者一行，ELO 才能算
CREATE TABLE IF NOT EXISTS game_record_participants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  record_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  is_winner TINYINT(1) NOT NULL DEFAULT 0,
  rank_no SMALLINT UNSIGNED NULL COMMENT '名次 1=第一',
  score INT NULL COMMENT '得分（可空）',
  elo_before INT NULL,
  elo_after INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_grp_record (record_id),
  KEY ix_grp_player (player_id),
  CONSTRAINT fk_grp_record FOREIGN KEY (record_id) REFERENCES game_records (id) ON DELETE CASCADE,
  CONSTRAINT fk_grp_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='单局参与者明细';

-- 3) 兜底：确保每个 player 在 player_stats 有一行
INSERT INTO player_stats (player_id, wins, games, elo_rating, losses)
SELECT p.id, 0, 0, 1200, 0 FROM players p
ON DUPLICATE KEY UPDATE player_stats.player_id = player_stats.player_id;

-- 4) 兜底：从现有 game_records 回填 wins/last_win_at（解决重置后排行榜空的老问题）
UPDATE player_stats ps
JOIN (
  SELECT winner_player_id AS pid, COUNT(*) AS w, MAX(played_at) AS last_win
  FROM game_records WHERE winner_player_id IS NOT NULL
  GROUP BY winner_player_id
) g ON g.pid = ps.player_id
SET ps.wins = g.w, ps.last_win_at = g.last_win
WHERE ps.wins = 0;

-- games = 总参与局数近似（沿用种子算法），仅在仍为 0 时填
UPDATE player_stats SET games = wins + 4 + (player_id MOD 9) WHERE games = 0 AND wins > 0;
UPDATE player_stats SET games = 2 + (player_id MOD 6) WHERE games = 0 AND wins = 0 AND player_id <= 30;

SELECT 'Phase A scoring migration done' AS status,
  (SELECT COUNT(*) FROM player_stats) AS player_stats_rows,
  (SELECT COUNT(*) FROM game_record_participants) AS participant_rows;
