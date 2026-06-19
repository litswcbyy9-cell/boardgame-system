-- =============================================================================
-- 桌游桌位预约与战绩管理系统 - 逻辑结构（MySQL 8）
-- 所有数据库对象均通过 SQL 创建
-- =============================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS game_records;
DROP TABLE IF EXISTS play_sessions;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS game_table_state;
DROP TABLE IF EXISTS player_stats;
DROP TABLE IF EXISTS player_sessions;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS game_tables;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS venues;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS app_users;
DROP TABLE IF EXISTS staff_profiles;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE venues (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(255) NULL,
  logo_url VARCHAR(512) NULL COMMENT '门店 LOGO 外链',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB COMMENT='门店/场地';

CREATE TABLE staff_profiles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_no VARCHAR(32) NOT NULL COMMENT '员工工号',
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(32) NULL,
  position VARCHAR(64) NOT NULL DEFAULT '店员',
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  hired_at DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_staff_employee_no (employee_no),
  KEY ix_staff_status (status),
  KEY ix_staff_name_phone (full_name, phone)
) ENGINE=InnoDB COMMENT='员工档案';

CREATE TABLE app_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  staff_id INT UNSIGNED NULL,
  username VARCHAR(64) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_users_username (username),
  UNIQUE KEY uk_app_users_staff (staff_id),
  KEY ix_app_users_role_status (role, status),
  CONSTRAINT fk_app_users_staff FOREIGN KEY (staff_id) REFERENCES staff_profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='后台登录账号';

CREATE TABLE auth_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_auth_sessions_token_hash (token_hash),
  KEY ix_auth_sessions_user (user_id),
  KEY ix_auth_sessions_expires (expires_at),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='后台登录会话';

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT UNSIGNED NULL COMMENT '预留多租户编号',
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
) ENGINE=InnoDB COMMENT='操作审计日志';

CREATE TABLE games (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(160) NOT NULL,
  cover_image_url VARCHAR(512) NULL COMMENT '封面图 URL',
  rules_pdf_url VARCHAR(512) NULL COMMENT '规则说明 PDF URL',
  min_players TINYINT UNSIGNED NOT NULL DEFAULT 2,
  max_players TINYINT UNSIGNED NOT NULL DEFAULT 6,
  category VARCHAR(32) NOT NULL DEFAULT '综合' COMMENT '推荐分类',
  difficulty_level TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '难度等级 1-5',
  avg_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 90 COMMENT '平均游玩时长（分钟）',
  recommend_weight DECIMAL(5,2) NOT NULL DEFAULT 1.00 COMMENT '门店运营推荐权重',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_games_title (title),
  KEY ix_games_created (created_at),
  KEY ix_games_recommend (category, difficulty_level, avg_minutes),
  CONSTRAINT chk_games_player_range CHECK (max_players >= min_players),
  CONSTRAINT chk_games_difficulty CHECK (difficulty_level BETWEEN 1 AND 5),
  CONSTRAINT chk_games_avg_minutes CHECK (avg_minutes BETWEEN 10 AND 600),
  CONSTRAINT chk_games_recommend_weight CHECK (recommend_weight >= 0 AND recommend_weight <= 10)
) ENGINE=InnoDB COMMENT='桌游目录';

CREATE TABLE game_tables (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  venue_id INT UNSIGNED NOT NULL,
  code VARCHAR(16) NOT NULL,
  pos_x SMALLINT NOT NULL DEFAULT 0,
  pos_y SMALLINT NOT NULL DEFAULT 0,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  seat_capacity TINYINT UNSIGNED NOT NULL DEFAULT 4 COMMENT '建议容纳人数',
  area_type VARCHAR(24) NOT NULL DEFAULT 'standard' COMMENT '区域类型：standard/party/private/quiet',
  floor_photo_url VARCHAR(512) NULL COMMENT '桌位实景照片 URL',
  PRIMARY KEY (id),
  UNIQUE KEY uk_game_tables_venue_code (venue_id, code),
  KEY ix_tables_venue (venue_id),
  KEY ix_tables_capacity (seat_capacity, area_type),
  CONSTRAINT fk_gt_venue FOREIGN KEY (venue_id) REFERENCES venues (id),
  CONSTRAINT chk_tables_capacity CHECK (seat_capacity BETWEEN 1 AND 20)
) ENGINE=InnoDB COMMENT='游戏桌';

CREATE TABLE game_table_state (
  table_id INT UNSIGNED NOT NULL,
  status ENUM('idle', 'reserved', 'occupied') NOT NULL DEFAULT 'idle',
  current_reservation_id INT UNSIGNED NULL,
  current_session_id INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (table_id),
  KEY ix_gts_status (status),
  CONSTRAINT fk_gts_table FOREIGN KEY (table_id) REFERENCES game_tables (id)
) ENGINE=InnoDB COMMENT='桌位运行态';

CREATE TABLE players (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_no VARCHAR(32) NULL,
  display_name VARCHAR(100) NOT NULL,
  phone VARCHAR(32) NULL,
  password_hash VARCHAR(180) NULL COMMENT '顾客登录密码哈希',
  last_login_at DATETIME NULL COMMENT '顾客最近登录时间',
  avatar_url VARCHAR(512) NULL COMMENT '头像图片 URL',
  balance_cents INT UNSIGNED NOT NULL DEFAULT 0,
  total_recharged_cents INT UNSIGNED NOT NULL DEFAULT 0,
  total_spent_cents INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_players_member_no (member_no),
  KEY ix_players_name (display_name),
  KEY ix_players_phone (phone),
  KEY ix_players_status (status),
  KEY ix_players_created (created_at)
) ENGINE=InnoDB COMMENT='玩家/会员';

CREATE TABLE player_sessions (
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

CREATE TABLE player_stats (
  player_id INT UNSIGNED NOT NULL,
  wins INT UNSIGNED NOT NULL DEFAULT 0,
  games INT UNSIGNED NOT NULL DEFAULT 0,
  last_win_at DATETIME NULL,
  PRIMARY KEY (player_id),
  CONSTRAINT fk_ps_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='战绩聚合';

CREATE TABLE reservations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  table_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NULL,
  guest_name VARCHAR(100) NOT NULL,
  guest_phone VARCHAR(30) NULL,
  party_size INT UNSIGNED NOT NULL DEFAULT 1,
  reserved_start DATETIME NOT NULL,
  reserved_end DATETIME NOT NULL,
  status ENUM('pending', 'active', 'cancelled', 'completed', 'no_show') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_res_table_status_time (table_id, status, reserved_start, reserved_end),
  KEY ix_res_player (player_id),
  KEY ix_res_created (created_at),
  CONSTRAINT fk_res_table FOREIGN KEY (table_id) REFERENCES game_tables (id),
  CONSTRAINT fk_res_player FOREIGN KEY (player_id) REFERENCES players (id),
  CONSTRAINT chk_res_party_size CHECK (party_size BETWEEN 1 AND 20),
  CONSTRAINT chk_res_time_window CHECK (reserved_end > reserved_start)
) ENGINE=InnoDB COMMENT='预约';

CREATE TABLE play_sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  table_id INT UNSIGNED NOT NULL,
  reservation_id INT UNSIGNED NULL,
  guest_name VARCHAR(100) NULL COMMENT '现场开台或预约入场使用人',
  guest_phone VARCHAR(30) NULL COMMENT '现场开台或预约入场联系电话',
  party_size INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '本次开台人数',
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  billed_minutes INT UNSIGNED NULL,
  amount_cents INT UNSIGNED NOT NULL DEFAULT 0,
  notes VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY ix_sess_table_started (table_id, started_at),
  KEY ix_sess_ended (ended_at),
  KEY ix_sess_reservation (reservation_id),
  CONSTRAINT fk_sess_table FOREIGN KEY (table_id) REFERENCES game_tables (id),
  CONSTRAINT fk_sess_res FOREIGN KEY (reservation_id) REFERENCES reservations (id),
  CONSTRAINT chk_sess_party_size CHECK (party_size BETWEEN 1 AND 20),
  CONSTRAINT chk_sess_amount CHECK (amount_cents >= 0 AND amount_cents <= 100000000)
) ENGINE=InnoDB COMMENT='开台对局与计费';

CREATE TABLE game_records (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id INT UNSIGNED NOT NULL,
  game_id INT UNSIGNED NOT NULL,
  title_snapshot VARCHAR(160) NOT NULL COMMENT '落库时游戏名快照',
  winner_player_id INT UNSIGNED NULL,
  winner_display_name VARCHAR(100) NULL,
  score_json JSON NULL,
  played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gr_session (session_id),
  KEY ix_gr_game_played (game_id, played_at),
  KEY ix_gr_winner (winner_player_id),
  CONSTRAINT fk_gr_session FOREIGN KEY (session_id) REFERENCES play_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_gr_game FOREIGN KEY (game_id) REFERENCES games (id),
  CONSTRAINT fk_gr_winner FOREIGN KEY (winner_player_id) REFERENCES players (id)
) ENGINE=InnoDB COMMENT='单局战绩';

DELIMITER $$

CREATE TRIGGER tr_players_after_insert_stats
AFTER INSERT ON players
FOR EACH ROW
BEGIN
  INSERT INTO player_stats (player_id, wins, games, last_win_at)
  VALUES (NEW.id, 0, 0, NULL);
END$$

CREATE TRIGGER tr_play_sessions_after_insert_state
AFTER INSERT ON play_sessions
FOR EACH ROW
BEGIN
  IF NEW.ended_at IS NULL THEN
    UPDATE game_table_state
    SET
      status = 'occupied',
      current_session_id = NEW.id,
      current_reservation_id = IFNULL(NEW.reservation_id, current_reservation_id)
    WHERE table_id = NEW.table_id;
  END IF;
END$$

CREATE TRIGGER tr_play_sessions_after_update_release
AFTER UPDATE ON play_sessions
FOR EACH ROW
BEGIN
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
    UPDATE game_table_state gts
    LEFT JOIN (
      SELECT r.id AS rid
      FROM reservations r
      WHERE r.table_id = NEW.table_id AND r.status = 'pending'
      ORDER BY r.reserved_start ASC
      LIMIT 1
    ) nxt ON TRUE
    SET
      gts.status = IF(nxt.rid IS NULL, 'idle', 'reserved'),
      gts.current_session_id = NULL,
      gts.current_reservation_id = nxt.rid
    WHERE gts.table_id = NEW.table_id;
  END IF;
END$$

CREATE TRIGGER tr_game_records_after_insert_stats
AFTER INSERT ON game_records
FOR EACH ROW
BEGIN
  IF NEW.winner_player_id IS NOT NULL THEN
    INSERT INTO player_stats (player_id, wins, games, last_win_at)
    VALUES (NEW.winner_player_id, 1, 1, NEW.played_at)
    ON DUPLICATE KEY UPDATE
      wins = wins + 1,
      games = games + 1,
      last_win_at = NEW.played_at;
  END IF;
END$$

DELIMITER ;
