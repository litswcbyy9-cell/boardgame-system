-- =====================================================================
-- Phase C: MySQL 全文检索 — ngram 中文分词索引
-- 幂等：先查索引是否存在再建
-- =====================================================================
SET NAMES utf8mb4;

-- games: title + category + description 全文索引
SET @has_ft_games := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'games' AND INDEX_NAME = 'ft_games');
SET @sql := IF(@has_ft_games = 0,
  'ALTER TABLE games ADD FULLTEXT INDEX ft_games (title, category, description) WITH PARSER ngram',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- players: display_name 全文索引（手机号/会员号仍用 LIKE 精确前缀）
SET @has_ft_players := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'players' AND INDEX_NAME = 'ft_players');
SET @sql := IF(@has_ft_players = 0,
  'ALTER TABLE players ADD FULLTEXT INDEX ft_players (display_name) WITH PARSER ngram',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Phase C fulltext migration done' AS status,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'games' AND INDEX_NAME = 'ft_games') AS games_ft,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'players' AND INDEX_NAME = 'ft_players') AS players_ft;
