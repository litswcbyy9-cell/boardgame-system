SET NAMES utf8mb4;

-- 大量测试数据：会员、历史结算对局、战绩记录。
-- 该脚本用于报表、排行榜和性能测试；生产环境可跳过。

DROP PROCEDURE IF EXISTS sp_seed_bulk_test_data;

DELIMITER $$
CREATE PROCEDURE sp_seed_bulk_test_data()
BEGIN
  DECLARE j INT UNSIGNED DEFAULT 1;
  DECLARE v_session_id INT UNSIGNED;
  DECLARE v_game_id INT UNSIGNED;
  DECLARE v_winner_id INT UNSIGNED;
  DECLARE v_title VARCHAR(160);
  DECLARE v_started DATETIME;
  DECLARE v_duration INT UNSIGNED;

  WHILE j <= 36 DO
    INSERT INTO players (display_name, phone, avatar_url)
    VALUES (
      CONCAT(
        ELT(1 + (j MOD 18), '林', '陈', '周', '吴', '郑', '许', '沈', '顾', '唐', '何', '宋', '叶', '韩', '陆', '苏', '姜', '谢', '夏'),
        ELT(1 + (j MOD 20), '小川', '北北', '青柠', '可可', '阿南', '米粒', '山月', '橘白', '栗子', '晓风', '海盐', '木南', '星河', '小满', '阿布', '钟意', '鹿鸣', '鱼丸', '白桃', '十七'),
        '_',
        LPAD(j, 3, '0')
      ),
      CONCAT('139', LPAD(20000000 + j, 8, '0')),
      CONCAT('https://i.pravatar.cc/128?img=', 1 + (j MOD 70))
    );
    SET j = j + 1;
  END WHILE;

  UPDATE players
  SET
    member_no = CONCAT('MB', DATE_FORMAT(CURDATE(), '%Y'), LPAD(id, 5, '0')),
    balance_cents = (40 + (id MOD 20) * 18) * 100,
    total_recharged_cents = ((40 + (id MOD 20) * 18) + (90 + (id MOD 18) * 35)) * 100,
    total_spent_cents = (90 + (id MOD 18) * 35) * 100,
    status = IF(id MOD 37 = 0, 'disabled', 'active')
  WHERE member_no IS NULL;

  SET j = 1;
  WHILE j <= 360 DO
    SET v_started = DATE_SUB(CURDATE(), INTERVAL (j MOD 90) DAY)
      + INTERVAL (13 + (j MOD 10)) HOUR
      + INTERVAL ((j * 7) MOD 50) MINUTE;
    SET v_duration = 55 + (j MOD 145);

    INSERT INTO play_sessions (table_id, reservation_id, started_at, ended_at, billed_minutes, amount_cents, notes)
    VALUES (
      1 + (j MOD 12),
      NULL,
      v_started,
      DATE_ADD(v_started, INTERVAL v_duration MINUTE),
      v_duration,
      (58 + (j MOD 120)) * 100,
      CONCAT(
        ELT(1 + (j MOD 6), '周末晚场', '工作日下午场', '会员包间', '新手教学', '生日聚会', '重策预约'),
        ' / seed#',
        j
      )
    );

    SET v_session_id = LAST_INSERT_ID();
    SET v_game_id = 1 + (j MOD 25);
    SET v_winner_id = 1 + (j MOD 66);

    SELECT title INTO v_title FROM games WHERE id = v_game_id;

    INSERT INTO game_records (session_id, game_id, title_snapshot, winner_player_id, winner_display_name, score_json, played_at)
    VALUES (
      v_session_id,
      v_game_id,
      v_title,
      v_winner_id,
      NULL,
      JSON_OBJECT(
        'players', 2 + (j MOD 5),
        'score', JSON_ARRAY(40 + (j MOD 60), 35 + ((j * 3) MOD 55), 28 + ((j * 5) MOD 45)),
        'source', 'bulk_seed'
      ),
      DATE_ADD(v_started, INTERVAL v_duration MINUTE)
    );

    SET j = j + 1;
  END WHILE;

  UPDATE player_stats
  SET games = GREATEST(games, wins + 3 + (player_id MOD 12))
  WHERE player_id <= 66;
END$$
DELIMITER ;

CALL sp_seed_bulk_test_data();

DROP PROCEDURE IF EXISTS sp_seed_bulk_test_data;
