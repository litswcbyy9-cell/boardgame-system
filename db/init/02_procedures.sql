SET NAMES utf8mb4;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_reserve_table$$
DROP PROCEDURE IF EXISTS sp_checkin_start_session$$
DROP PROCEDURE IF EXISTS sp_start_walkin_session$$
DROP PROCEDURE IF EXISTS sp_end_session_settle$$
DROP PROCEDURE IF EXISTS sp_insert_game_record$$
DROP PROCEDURE IF EXISTS sp_cancel_reservation$$
DROP PROCEDURE IF EXISTS sp_expire_overdue_reservations$$
DROP PROCEDURE IF EXISTS sp_report_daily_revenue$$
DROP PROCEDURE IF EXISTS sp_report_game_popularity$$
DROP PROCEDURE IF EXISTS sp_report_table_utilization$$
DROP PROCEDURE IF EXISTS sp_recommend_games$$
DROP PROCEDURE IF EXISTS sp_recommend_tables$$

CREATE PROCEDURE sp_reserve_table(
  IN p_table_id INT UNSIGNED,
  IN p_player_id INT UNSIGNED,
  IN p_guest_name VARCHAR(100),
  IN p_guest_phone VARCHAR(30),
  IN p_party_size INT UNSIGNED,
  IN p_reserved_start DATETIME,
  IN p_reserved_end DATETIME,
  OUT p_reservation_id INT UNSIGNED,
  OUT p_err_code VARCHAR(64)
)
BEGIN
  DECLARE v_status VARCHAR(16);
  DECLARE v_table_capacity INT UNSIGNED DEFAULT 0;
  DECLARE v_party_size INT UNSIGNED DEFAULT 1;
  DECLARE v_conflict INT UNSIGNED DEFAULT 0;

  SET p_reservation_id = NULL;
  SET p_err_code = NULL;
  SET v_party_size = IFNULL(NULLIF(p_party_size, 0), 1);

  SELECT gts.status, t.seat_capacity INTO v_status, v_table_capacity
  FROM game_table_state gts
  INNER JOIN game_tables t ON t.id = gts.table_id
  WHERE gts.table_id = p_table_id;

  IF v_status IS NULL THEN
    SET p_err_code = 'table_not_found';
  ELSEIF v_status = 'occupied' THEN
    SET p_err_code = 'table_occupied';
  ELSEIF v_party_size > v_table_capacity THEN
    SET p_err_code = 'capacity_exceeded';
  ELSE
    SELECT COUNT(*) INTO v_conflict
    FROM reservations r
    WHERE r.table_id = p_table_id
      AND r.status IN ('pending', 'active')
      AND NOT (p_reserved_end <= r.reserved_start OR p_reserved_start >= r.reserved_end);

    IF v_conflict > 0 THEN
      SET p_err_code = 'time_overlap';
    ELSE
      INSERT INTO reservations (table_id, player_id, guest_name, guest_phone, party_size, reserved_start, reserved_end, status)
      VALUES (p_table_id, p_player_id, p_guest_name, p_guest_phone, v_party_size, p_reserved_start, p_reserved_end, 'pending');
      SET p_reservation_id = LAST_INSERT_ID();

      UPDATE game_table_state gts
      JOIN (
        SELECT r.id AS rid
        FROM reservations r
        WHERE r.table_id = p_table_id AND r.status = 'pending'
        ORDER BY r.reserved_start ASC, r.id ASC
        LIMIT 1
      ) pick ON TRUE
      SET
        gts.status = 'reserved',
        gts.current_reservation_id = pick.rid,
        gts.current_session_id = NULL
      WHERE gts.table_id = p_table_id;
    END IF;
  END IF;
END$$

CREATE PROCEDURE sp_checkin_start_session(
  IN p_reservation_id INT UNSIGNED,
  OUT p_session_id INT UNSIGNED,
  OUT p_err_code VARCHAR(64)
)
BEGIN
  DECLARE v_table_id INT UNSIGNED;
  DECLARE v_guest_name VARCHAR(100);
  DECLARE v_guest_phone VARCHAR(30);
  DECLARE v_party_size INT UNSIGNED DEFAULT 1;
  DECLARE v_status VARCHAR(16);

  SET p_session_id = NULL;
  SET p_err_code = NULL;

  SELECT
    r.table_id,
    COALESCE(NULLIF(r.guest_name, ''), p.display_name, '访客'),
    COALESCE(NULLIF(r.guest_phone, ''), p.phone),
    r.party_size,
    r.status
  INTO v_table_id, v_guest_name, v_guest_phone, v_party_size, v_status
  FROM reservations r
  LEFT JOIN players p ON p.id = r.player_id
  WHERE r.id = p_reservation_id;

  IF v_table_id IS NULL THEN
    SET p_err_code = 'reservation_not_found';
  ELSEIF v_status <> 'pending' THEN
    SET p_err_code = 'reservation_not_pending';
  ELSE
    INSERT INTO play_sessions (table_id, reservation_id, guest_name, guest_phone, party_size, started_at, ended_at, billed_minutes, amount_cents, notes)
    VALUES (v_table_id, p_reservation_id, v_guest_name, v_guest_phone, v_party_size, NOW(), NULL, NULL, 0, NULL);
    SET p_session_id = LAST_INSERT_ID();
    UPDATE reservations SET status = 'active' WHERE id = p_reservation_id;
  END IF;
END$$

CREATE PROCEDURE sp_start_walkin_session(
  IN p_table_id INT UNSIGNED,
  IN p_guest_name VARCHAR(100),
  IN p_guest_phone VARCHAR(30),
  IN p_party_size INT UNSIGNED,
  OUT p_session_id INT UNSIGNED,
  OUT p_err_code VARCHAR(64)
)
BEGIN
  DECLARE v_status VARCHAR(16);
  DECLARE v_table_capacity INT UNSIGNED DEFAULT 0;
  DECLARE v_party_size INT UNSIGNED DEFAULT 1;
  DECLARE v_block INT UNSIGNED DEFAULT 0;

  SET p_session_id = NULL;
  SET p_err_code = NULL;
  SET v_party_size = IFNULL(NULLIF(p_party_size, 0), 1);

  SELECT gts.status, t.seat_capacity INTO v_status, v_table_capacity
  FROM game_table_state gts
  INNER JOIN game_tables t ON t.id = gts.table_id
  WHERE gts.table_id = p_table_id;

  SELECT COUNT(*) INTO v_block
  FROM reservations r
  WHERE r.table_id = p_table_id
    AND r.status = 'pending'
    AND r.reserved_start <= NOW()
    AND r.reserved_end >= NOW();

  IF v_status IS NULL THEN
    SET p_err_code = 'table_not_found';
  ELSEIF v_status = 'occupied' THEN
    SET p_err_code = 'table_occupied';
  ELSEIF v_party_size > v_table_capacity THEN
    SET p_err_code = 'capacity_exceeded';
  ELSEIF v_block > 0 THEN
    SET p_err_code = 'reserved_slot_active';
  ELSE
    INSERT INTO play_sessions (table_id, reservation_id, guest_name, guest_phone, party_size, started_at, ended_at, billed_minutes, amount_cents, notes)
    VALUES (p_table_id, NULL, NULLIF(p_guest_name, ''), NULLIF(p_guest_phone, ''), v_party_size, NOW(), NULL, NULL, 0, NULL);
    SET p_session_id = LAST_INSERT_ID();
  END IF;
END$$

CREATE PROCEDURE sp_end_session_settle(
  IN p_session_id INT UNSIGNED,
  IN p_billed_minutes INT UNSIGNED,
  IN p_amount_cents INT UNSIGNED,
  IN p_notes VARCHAR(500),
  OUT p_err_code VARCHAR(64)
)
BEGIN
  DECLARE v_open INT UNSIGNED DEFAULT 0;

  SET p_err_code = NULL;

  SELECT COUNT(*) INTO v_open
  FROM play_sessions
  WHERE id = p_session_id AND ended_at IS NULL;

  IF v_open = 0 THEN
    SET p_err_code = 'session_not_open';
  ELSE
    UPDATE play_sessions
    SET
      ended_at = NOW(),
      billed_minutes = p_billed_minutes,
      amount_cents = p_amount_cents,
      notes = p_notes
    WHERE id = p_session_id;

    UPDATE reservations r
    JOIN play_sessions s ON s.reservation_id = r.id
    SET r.status = 'completed'
    WHERE s.id = p_session_id AND r.status = 'active';
  END IF;
END$$

CREATE PROCEDURE sp_insert_game_record(
  IN p_session_id INT UNSIGNED,
  IN p_game_id INT UNSIGNED,
  IN p_winner_player_id INT UNSIGNED,
  IN p_winner_display_name VARCHAR(100),
  IN p_score_json JSON,
  OUT p_record_id INT UNSIGNED,
  OUT p_err_code VARCHAR(64)
)
BEGIN
  DECLARE v_ended DATETIME;
  DECLARE v_title VARCHAR(160);

  SET p_record_id = NULL;
  SET p_err_code = NULL;

  SELECT ended_at INTO v_ended FROM play_sessions WHERE id = p_session_id;
  SELECT title INTO v_title FROM games WHERE id = p_game_id;

  IF v_ended IS NULL THEN
    SET p_err_code = 'session_still_open';
  ELSEIF v_title IS NULL THEN
    SET p_err_code = 'game_not_found';
  ELSE
    INSERT INTO game_records (session_id, game_id, title_snapshot, winner_player_id, winner_display_name, score_json, played_at)
    VALUES (p_session_id, p_game_id, v_title, p_winner_player_id, p_winner_display_name, p_score_json, NOW());
    SET p_record_id = LAST_INSERT_ID();
  END IF;
END$$

CREATE PROCEDURE sp_cancel_reservation(
  IN p_reservation_id INT UNSIGNED,
  OUT p_err_code VARCHAR(64)
)
BEGIN
  DECLARE v_status VARCHAR(16);
  DECLARE v_table_id INT UNSIGNED;

  SET p_err_code = NULL;

  SELECT status, table_id INTO v_status, v_table_id
  FROM reservations
  WHERE id = p_reservation_id;

  IF v_table_id IS NULL THEN
    SET p_err_code = 'reservation_not_found';
  ELSEIF v_status <> 'pending' THEN
    SET p_err_code = 'reservation_not_cancellable';
  ELSE
    UPDATE reservations SET status = 'cancelled' WHERE id = p_reservation_id;

    UPDATE game_table_state gts
    LEFT JOIN (
      SELECT r.id AS rid
      FROM reservations r
      WHERE r.table_id = v_table_id AND r.status = 'pending'
      ORDER BY r.reserved_start ASC, r.id ASC
      LIMIT 1
    ) nxt ON TRUE
    SET
      gts.status = IF(gts.status = 'occupied', gts.status, IF(nxt.rid IS NULL, 'idle', 'reserved')),
      gts.current_reservation_id = IF(gts.status = 'occupied', gts.current_reservation_id, nxt.rid)
    WHERE gts.table_id = v_table_id;
  END IF;
END$$

CREATE PROCEDURE sp_expire_overdue_reservations(
  IN p_grace_minutes INT UNSIGNED,
  OUT p_expired_count INT UNSIGNED
)
BEGIN
  DECLARE v_grace_minutes INT UNSIGNED DEFAULT 15;

  SET p_expired_count = 0;
  SET v_grace_minutes = IFNULL(NULLIF(p_grace_minutes, 0), 15);

  CREATE TEMPORARY TABLE IF NOT EXISTS tmp_expired_reservation_tables (
    table_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (table_id)
  ) ENGINE=MEMORY;

  TRUNCATE TABLE tmp_expired_reservation_tables;

  INSERT IGNORE INTO tmp_expired_reservation_tables (table_id)
  SELECT DISTINCT table_id
  FROM reservations
  WHERE status = 'pending'
    AND reserved_start <= DATE_SUB(NOW(), INTERVAL v_grace_minutes MINUTE);

  UPDATE reservations r
  JOIN tmp_expired_reservation_tables et ON et.table_id = r.table_id
  SET r.status = 'no_show'
  WHERE r.status = 'pending'
    AND r.reserved_start <= DATE_SUB(NOW(), INTERVAL v_grace_minutes MINUTE);

  SET p_expired_count = ROW_COUNT();

  UPDATE game_table_state gts
  JOIN tmp_expired_reservation_tables et ON et.table_id = gts.table_id
  LEFT JOIN play_sessions s ON s.id = gts.current_session_id AND s.ended_at IS NULL
  LEFT JOIN (
    SELECT id, table_id
    FROM (
      SELECT
        r.id,
        r.table_id,
        ROW_NUMBER() OVER (PARTITION BY r.table_id ORDER BY r.reserved_start ASC, r.id ASC) AS rn
      FROM reservations r
      WHERE r.status = 'pending'
    ) ranked
    WHERE rn = 1
  ) nxt ON nxt.table_id = gts.table_id
  SET
    gts.status = IF(s.id IS NOT NULL, 'occupied', IF(nxt.id IS NULL, 'idle', 'reserved')),
    gts.current_session_id = IF(s.id IS NOT NULL, s.id, NULL),
    gts.current_reservation_id = IF(s.id IS NOT NULL, gts.current_reservation_id, nxt.id)
  WHERE gts.table_id = et.table_id;

  DROP TEMPORARY TABLE IF EXISTS tmp_expired_reservation_tables;
END$$

-- 统计：某日已结算收入（元）与会话数
CREATE PROCEDURE sp_report_daily_revenue(IN p_day DATE)
BEGIN
  SELECT
    p_day AS report_day,
    ROUND(IFNULL(SUM(s.amount_cents), 0) / 100, 2) AS revenue_yuan,
    COUNT(*) AS settled_sessions,
    IFNULL(SUM(s.billed_minutes), 0) AS total_billed_minutes
  FROM play_sessions s
  WHERE s.ended_at IS NOT NULL
    AND DATE(s.ended_at) = p_day;
END$$

-- 统计：桌游被记录局数（按目录）
CREATE PROCEDURE sp_report_game_popularity(IN p_recent_days INT UNSIGNED)
BEGIN
  SELECT
    g.id AS game_id,
    g.title,
    g.cover_image_url,
    COUNT(gr.id) AS record_count
  FROM games g
  LEFT JOIN game_records gr
    ON gr.game_id = g.id
    AND gr.played_at >= DATE_SUB(CURDATE(), INTERVAL p_recent_days DAY)
  GROUP BY g.id, g.title, g.cover_image_url
  ORDER BY record_count DESC, g.title ASC;
END$$

-- 统计：桌位利用率（近期已结算会话数 / 桌数）
CREATE PROCEDURE sp_report_table_utilization(IN p_recent_days INT UNSIGNED)
BEGIN
  SELECT
    t.id AS table_id,
    t.code,
    COUNT(s.id) AS settled_sessions_in_range
  FROM game_tables t
  LEFT JOIN play_sessions s
    ON s.table_id = t.id
    AND s.ended_at IS NOT NULL
    AND s.ended_at >= DATE_SUB(CURDATE(), INTERVAL p_recent_days DAY)
  GROUP BY t.id, t.code
  ORDER BY settled_sessions_in_range DESC, t.code ASC;
END$$

-- 智能推荐：基于人数、时长、类型偏好、会员历史偏好、近期热度和运营权重推荐桌游
CREATE PROCEDURE sp_recommend_games(
  IN p_player_id INT UNSIGNED,
  IN p_party_size INT UNSIGNED,
  IN p_expected_minutes INT UNSIGNED,
  IN p_category VARCHAR(32)
)
BEGIN
  DECLARE v_player_id INT UNSIGNED DEFAULT NULL;
  DECLARE v_party_size INT UNSIGNED DEFAULT 4;
  DECLARE v_expected_minutes INT UNSIGNED DEFAULT 120;
  DECLARE v_category VARCHAR(32) DEFAULT '';

  SET v_player_id = NULLIF(p_player_id, 0);
  SET v_party_size = IFNULL(NULLIF(p_party_size, 0), 4);
  SET v_expected_minutes = IFNULL(NULLIF(p_expected_minutes, 0), 120);
  SET v_category = TRIM(IFNULL(p_category, ''));

  SELECT
    game_id,
    title,
    cover_image_url,
    min_players,
    max_players,
    category,
    difficulty_level,
    avg_minutes,
    recommend_weight,
    total_play_records,
    recent_30_records,
    people_score,
    duration_score,
    category_score,
    history_score,
    hot_score,
    weight_score,
    ROUND(
      people_score * 0.25
      + duration_score * 0.15
      + category_score * 0.15
      + history_score * 0.20
      + hot_score * 0.15
      + weight_score * 0.10,
      2
    ) AS score
  FROM (
    SELECT
      f.game_id,
      f.title,
      f.cover_image_url,
      f.min_players,
      f.max_players,
      f.category,
      f.difficulty_level,
      f.avg_minutes,
      f.recommend_weight,
      f.total_play_records,
      f.recent_30_records,
      CASE
        WHEN v_party_size BETWEEN f.min_players AND f.max_players THEN 100
        WHEN v_party_size < f.min_players THEN GREATEST(0, 100 - (CAST(f.min_players AS SIGNED) - CAST(v_party_size AS SIGNED)) * 25)
        ELSE GREATEST(0, 100 - (CAST(v_party_size AS SIGNED) - CAST(f.max_players AS SIGNED)) * 30)
      END AS people_score,
      GREATEST(
        0,
        100 - ROUND(
          ABS(CAST(f.avg_minutes AS SIGNED) - CAST(v_expected_minutes AS SIGNED)) * 100 / GREATEST(v_expected_minutes, f.avg_minutes, 1),
          2
        )
      ) AS duration_score,
      CASE
        WHEN v_category = '' THEN 70
        WHEN f.category = v_category THEN 100
        ELSE 45
      END AS category_score,
      CASE
        WHEN v_player_id IS NULL THEN 50
        WHEN IFNULL(pg.player_game_records, 0) > 0 THEN 100
        WHEN IFNULL(pc.player_category_records, 0) > 0 THEN 75
        ELSE 45
      END AS history_score,
      LEAST(100, f.recent_30_records * 8 + f.total_play_records * 0.5) AS hot_score,
      LEAST(100, f.recommend_weight * 20) AS weight_score
    FROM v_game_recommendation_features f
    LEFT JOIN (
      SELECT gr.game_id, COUNT(*) AS player_game_records
      FROM game_records gr
      WHERE gr.winner_player_id = v_player_id
      GROUP BY gr.game_id
    ) pg ON pg.game_id = f.game_id
    LEFT JOIN (
      SELECT g.category, COUNT(*) AS player_category_records
      FROM game_records gr
      INNER JOIN games g ON g.id = gr.game_id
      WHERE gr.winner_player_id = v_player_id
      GROUP BY g.category
    ) pc ON pc.category = f.category
  ) scored
  ORDER BY score DESC, people_score DESC, recent_30_records DESC, recommend_weight DESC, title ASC
  LIMIT 5;
END$$

-- 智能调度：在不冲突的桌位中，按容量匹配、空闲状态和近期利用均衡推荐桌位
CREATE PROCEDURE sp_recommend_tables(
  IN p_party_size INT UNSIGNED,
  IN p_reserved_start DATETIME,
  IN p_reserved_end DATETIME
)
BEGIN
  DECLARE v_party_size INT UNSIGNED DEFAULT 4;
  DECLARE v_start DATETIME DEFAULT NOW();
  DECLARE v_end DATETIME DEFAULT DATE_ADD(NOW(), INTERVAL 2 HOUR);

  SET v_party_size = IFNULL(NULLIF(p_party_size, 0), 4);
  SET v_start = IFNULL(p_reserved_start, NOW());
  SET v_end = IFNULL(p_reserved_end, DATE_ADD(v_start, INTERVAL 2 HOUR));

  SELECT
    table_id,
    code,
    seat_capacity,
    area_type,
    pos_x,
    pos_y,
    status,
    recent_sessions,
    capacity_score,
    availability_score,
    utilization_score,
    ROUND(
      capacity_score * 0.55
      + availability_score * 0.25
      + utilization_score * 0.20,
      2
    ) AS score
  FROM (
    SELECT
      t.id AS table_id,
      t.code,
      t.seat_capacity,
      t.area_type,
      t.pos_x,
      t.pos_y,
      gts.status,
      IFNULL(u.recent_sessions, 0) AS recent_sessions,
      CASE
        WHEN t.seat_capacity >= v_party_size THEN GREATEST(0, 100 - (t.seat_capacity - v_party_size) * 12)
        ELSE GREATEST(0, 100 - (v_party_size - t.seat_capacity) * 35)
      END AS capacity_score,
      CASE
        WHEN gts.status = 'idle' THEN 100
        WHEN gts.status = 'reserved' THEN 75
        ELSE 0
      END AS availability_score,
      GREATEST(40, 100 - IFNULL(u.recent_sessions, 0) * 3) AS utilization_score
    FROM game_tables t
    INNER JOIN game_table_state gts ON gts.table_id = t.id
    LEFT JOIN (
      SELECT r.table_id, COUNT(*) AS conflict_count
      FROM reservations r
      WHERE r.status IN ('pending', 'active')
        AND NOT (v_end <= r.reserved_start OR v_start >= r.reserved_end)
      GROUP BY r.table_id
    ) c ON c.table_id = t.id
    LEFT JOIN (
      SELECT s.table_id, COUNT(*) AS recent_sessions
      FROM play_sessions s
      WHERE s.ended_at IS NOT NULL
        AND s.ended_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY s.table_id
    ) u ON u.table_id = t.id
    WHERE gts.status <> 'occupied'
      AND t.seat_capacity >= v_party_size
      AND IFNULL(c.conflict_count, 0) = 0
  ) scored
  ORDER BY score DESC, capacity_score DESC, utilization_score DESC, code ASC
  LIMIT 5;
END$$

DELIMITER ;
