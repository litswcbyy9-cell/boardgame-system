SET NAMES utf8mb4;

DROP VIEW IF EXISTS v_leaderboard;
DROP VIEW IF EXISTS v_session_billing_detail;
DROP VIEW IF EXISTS v_game_catalog_with_stats;
DROP VIEW IF EXISTS v_game_recommendation_features;
DROP VIEW IF EXISTS v_table_status_floor;

CREATE VIEW v_leaderboard AS
SELECT
  p.id AS player_id,
  p.display_name,
  p.avatar_url,
  ps.wins,
  ps.games,
  CASE WHEN ps.games = 0 THEN 0 ELSE ROUND(ps.wins / ps.games, 4) END AS win_rate,
  ps.last_win_at
FROM players p
INNER JOIN player_stats ps ON ps.player_id = p.id;

CREATE VIEW v_session_billing_detail AS
SELECT
  s.id AS session_id,
  t.code AS table_code,
  v.name AS venue_name,
  s.started_at,
  s.ended_at,
  s.billed_minutes,
  s.amount_cents,
  ROUND(s.amount_cents / 100, 2) AS amount_yuan,
  s.reservation_id,
  s.notes
FROM play_sessions s
INNER JOIN game_tables t ON t.id = s.table_id
INNER JOIN venues v ON v.id = t.venue_id;

CREATE VIEW v_game_catalog_with_stats AS
SELECT
  g.id AS game_id,
  g.title,
  g.cover_image_url,
  g.rules_pdf_url,
  g.min_players,
  g.max_players,
  g.category,
  g.difficulty_level,
  g.avg_minutes,
  g.recommend_weight,
  COUNT(gr.id) AS total_play_records
FROM games g
LEFT JOIN game_records gr ON gr.game_id = g.id
GROUP BY g.id, g.title, g.cover_image_url, g.rules_pdf_url, g.min_players, g.max_players,
         g.category, g.difficulty_level, g.avg_minutes, g.recommend_weight;

CREATE VIEW v_game_recommendation_features AS
SELECT
  g.id AS game_id,
  g.title,
  g.cover_image_url,
  g.rules_pdf_url,
  g.min_players,
  g.max_players,
  g.category,
  g.difficulty_level,
  g.avg_minutes,
  g.recommend_weight,
  COUNT(gr.id) AS total_play_records,
  SUM(CASE WHEN gr.played_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS recent_30_records
FROM games g
LEFT JOIN game_records gr ON gr.game_id = g.id
GROUP BY g.id, g.title, g.cover_image_url, g.rules_pdf_url, g.min_players, g.max_players,
         g.category, g.difficulty_level, g.avg_minutes, g.recommend_weight;

CREATE VIEW v_table_status_floor AS
SELECT
  t.id AS table_id,
  t.code,
  t.venue_id,
  t.pos_x,
  t.pos_y,
  t.sort_order,
  t.seat_capacity,
  t.area_type,
  t.floor_photo_url,
  s.status,
  s.current_reservation_id,
  s.current_session_id
FROM game_tables t
INNER JOIN game_table_state s ON s.table_id = t.id;
