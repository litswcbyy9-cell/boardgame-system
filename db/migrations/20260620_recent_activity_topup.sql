-- =====================================================================
-- 近期活跃数据补齐：让营收趋势/热度图覆盖到「今天」，用于数据大屏演示。
-- 历史 bulk seed 的数据截止于生成当日，运行一段时间后近 14 天会变空，
-- 趋势折线在当前边缘掉到 0，视觉上像故障。此脚本补齐最近 14 天的对局。
-- 幂等：以 notes 前缀 'recent_topup#' 为标记，已存在则跳过，可重复执行。
-- =====================================================================
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS sp_seed_recent_activity;

DELIMITER $$
CREATE PROCEDURE sp_seed_recent_activity()
proc: BEGIN
  DECLARE v_exists INT UNSIGNED DEFAULT 0;
  DECLARE d INT;             -- 距今天的天数偏移：13..0
  DECLARE k INT;             -- 当天第几场
  DECLARE v_per_day INT;
  DECLARE v_session_id INT UNSIGNED;
  DECLARE v_game_id INT UNSIGNED;
  DECLARE v_winner_id INT UNSIGNED;
  DECLARE v_title VARCHAR(160);
  DECLARE v_started DATETIME;
  DECLARE v_duration INT UNSIGNED;
  DECLARE v_player_max INT UNSIGNED DEFAULT 1;
  DECLARE v_game_max INT UNSIGNED DEFAULT 1;
  DECLARE v_seq INT UNSIGNED DEFAULT 0;

  SELECT COUNT(*) INTO v_exists FROM play_sessions WHERE notes LIKE 'recent_topup#%';
  IF v_exists > 0 THEN
    -- 已补齐过，直接返回，保证幂等。
    LEAVE proc;
  END IF;

  SELECT GREATEST(IFNULL(MAX(id), 1), 1) INTO v_player_max FROM players;
  SELECT GREATEST(IFNULL(MAX(id), 1), 1) INTO v_game_max FROM games;

  SET d = 13;
  WHILE d >= 0 DO
    -- 周末（每 7 天里的两天）场次更多，制造自然波动。
    SET v_per_day = 4 + ((d * 3) MOD 4) + IF((d MOD 7) IN (5, 6), 3, 0);
    SET k = 0;
    WHILE k < v_per_day DO
      SET v_seq = v_seq + 1;
      SET v_started = DATE_SUB(CURDATE(), INTERVAL d DAY)
        + INTERVAL (12 + (k MOD 11)) HOUR
        + INTERVAL ((v_seq * 13) MOD 60) MINUTE;
      SET v_duration = 55 + ((v_seq * 17) MOD 150);
      SET v_game_id = 1 + ((v_seq * 7) MOD v_game_max);
      SET v_winner_id = 1 + ((v_seq * 11) MOD v_player_max);

      INSERT INTO play_sessions (table_id, reservation_id, guest_name, party_size, started_at, ended_at, billed_minutes, amount_cents, notes)
      VALUES (
        1 + (v_seq MOD 12),
        NULL,
        ELT(1 + (v_seq MOD 6), '周末晚场', '工作日午后', '会员包间', '新手教学', '生日聚会', '重策开荒'),
        2 + (v_seq MOD 5),
        v_started,
        DATE_ADD(v_started, INTERVAL v_duration MINUTE),
        v_duration,
        (60 + ((v_seq * 9) MOD 130)) * 100,
        CONCAT('recent_topup#', v_seq)
      );
      SET v_session_id = LAST_INSERT_ID();

      SELECT title INTO v_title FROM games WHERE id = v_game_id;
      INSERT INTO game_records (session_id, game_id, title_snapshot, winner_player_id, winner_display_name, score_json, played_at)
      VALUES (
        v_session_id,
        v_game_id,
        IFNULL(v_title, '桌游'),
        v_winner_id,
        NULL,
        JSON_OBJECT('players', 2 + (v_seq MOD 5), 'source', 'recent_topup'),
        DATE_ADD(v_started, INTERVAL v_duration MINUTE)
      );
      SET k = k + 1;
    END WHILE;
    SET d = d - 1;
  END WHILE;
END$$
DELIMITER ;

CALL sp_seed_recent_activity();
DROP PROCEDURE IF EXISTS sp_seed_recent_activity;
