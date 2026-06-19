SET NAMES utf8mb4;

INSERT INTO venues (id, name, address, logo_url) VALUES
(1, '骰子猫桌游馆·银杏路店', '杭州市西湖区银杏路 18 号 2F', 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=720&q=80');

INSERT INTO staff_profiles (id, employee_no, full_name, phone, position, status, hired_at) VALUES
(1, 'ST20260001', '门店管理员', '13800009001', '店长', 'active', '2026-01-01'),
(2, 'ST20260002', '值班店员', '13800009002', '店员', 'active', '2026-02-15');

INSERT INTO app_users (id, staff_id, username, display_name, password_hash, role) VALUES
(1, 1, 'admin', '门店管理员', '2596da10b83d7a65cf359c397f3c8deb:7510b9199c07ce02c7d4af4269ba51fcb124c401d1c34fd9f1232cd84c5d048df3ac0f5638dcb63eb44f00b169c8eb745d887193187115ef02e540712b264e71', 'admin');

INSERT INTO games (id, title, cover_image_url, rules_pdf_url, min_players, max_players, category, difficulty_level, avg_minutes, recommend_weight) VALUES
(1, '卡坦岛', 'https://cf.geekdo-images.com/W3Bsga_uLP9kO91gZ7H8yw__original/img/xV7oisd3RQ8R-k18cdWAYthHXsA=/0x0/filters:format(jpeg)/pic2419375.jpg', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 3, 4, '策略', 3, 90, 4.60),
(2, '车票之旅', 'https://cf.geekdo-images.com/0K1AOciqlMVUWFPLTJSiww__original/img/O37sCRSJLq4S8EpCxFDNVsNBuxE=/0x0/filters:format(jpeg)/pic66668.jpg', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 2, 5, '家庭', 2, 75, 4.20),
(3, '七大奇迹', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 3, 7, '策略', 3, 45, 4.10),
(4, '狼人杀', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=640&q=80', NULL, 6, 12, '聚会', 2, 60, 4.80),
(5, '阿瓦隆', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', NULL, 5, 10, '推理', 2, 45, 4.70),
(6, '璀璨宝石', 'https://cf.geekdo-images.com/vNFe4JkhKAERzi4T0Ntwpw__original/img/0E9xIYlYZCWeIYbXd8y2lyctUDo=/0x0/filters:format(jpeg)/pic1904079.jpg', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 2, 4, '家庭', 2, 35, 4.90),
(7, '冷战热斗', 'https://cf.geekdo-images.com/pNCiUUphnoeWOYfsWq0kng__original/img/Iae47UtAd_RXVd5tJ3YzbDHOv4E=/0x0/filters:format(jpeg)/pic3530661.jpg', NULL, 2, 2, '双人', 5, 180, 3.70),
(8, '瘟疫危机', 'https://cf.geekdo-images.com/S3ybV1LAp-8SnHIXLLjVqA__original/img/IsrvRLpUV1TEyZsO5rC-btXaPz0=/0x0/filters:format(jpeg)/pic1534148.jpg', NULL, 2, 4, '合作', 3, 60, 4.30),
(9, '农场主', 'https://cf.geekdo-images.com/soeKmBO_HCQ5-7tI0IvPxw__original/img/EM5Gg_dg0Ii85W2C5Svy4-9R3AY=/0x0/filters:format(jpeg)/pic293456.jpg', NULL, 1, 5, '重策', 4, 120, 3.90),
(10, '电力公司', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', NULL, 2, 6, '重策', 4, 150, 3.80),
(11, '马尼拉', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=640&q=80', NULL, 3, 5, '聚会', 2, 60, 3.60),
(12, '开膛手杰克', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', NULL, 2, 2, '双人', 3, 45, 3.80),
(13, '情书', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=640&q=80', NULL, 2, 4, '聚会', 1, 20, 4.40),
(14, '花砖物语', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', NULL, 2, 4, '家庭', 2, 45, 4.50),
(15, '行动代号', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=640&q=80', NULL, 4, 8, '聚会', 2, 30, 4.30),
(16, '山屋惊魂', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', NULL, 3, 6, '剧情', 3, 120, 3.60),
(17, '小黑屋', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=640&q=80', NULL, 2, 7, '推理', 2, 60, 3.90),
(18, '诡镇奇谈', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', NULL, 1, 4, '合作', 4, 120, 3.70),
(19, '幽港迷城', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=640&q=80', NULL, 1, 4, '重策', 5, 150, 3.20),
(20, 'ROOT 茂林源记', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', NULL, 2, 4, '策略', 4, 100, 4.00),
(21, '方舟动物园', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=640&q=80', NULL, 1, 4, '重策', 4, 150, 3.90),
(22, '勃艮第城堡', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', NULL, 2, 4, '策略', 3, 90, 4.00),
(23, '大西部之路', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=640&q=80', NULL, 2, 4, '重策', 4, 150, 3.60),
(24, '重塑火星', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', NULL, 1, 5, '重策', 4, 140, 4.10),
(25, '污痕圣杯', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=640&q=80', NULL, 1, 4, '剧情', 5, 180, 3.10);

INSERT INTO game_tables (id, venue_id, code, pos_x, pos_y, sort_order, seat_capacity, area_type, floor_photo_url) VALUES
(1, 1, 'A01', 0, 0, 1, 4, 'standard', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=800&q=80'),
(2, 1, 'A02', 1, 0, 2, 4, 'standard', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=800&q=80'),
(3, 1, 'A03', 2, 0, 3, 6, 'party', 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=800&q=80'),
(4, 1, 'A04', 3, 0, 4, 4, 'standard', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=800&q=80'),
(5, 1, 'B01', 0, 1, 5, 8, 'party', 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=800&q=80'),
(6, 1, 'B02', 1, 1, 6, 2, 'quiet', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=800&q=80'),
(7, 1, 'B03', 2, 1, 7, 6, 'private', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=800&q=80'),
(8, 1, 'B04', 3, 1, 8, 4, 'standard', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=800&q=80'),
(9, 1, 'C01', 0, 2, 9, 4, 'standard', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=800&q=80'),
(10, 1, 'C02', 1, 2, 10, 6, 'private', 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=800&q=80'),
(11, 1, 'C03', 2, 2, 11, 8, 'party', 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=800&q=80'),
(12, 1, 'C04', 3, 2, 12, 2, 'quiet', 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=800&q=80');

INSERT INTO game_table_state (table_id, status, current_reservation_id, current_session_id)
SELECT id, 'idle', NULL, NULL FROM game_tables;

INSERT INTO players (id, display_name, phone, avatar_url) VALUES
(1, '林鹿', '13800010001', 'https://i.pravatar.cc/128?img=11'),
(2, '阿哲', '13800010002', 'https://i.pravatar.cc/128?img=12'),
(3, 'Momo', '13800010003', 'https://i.pravatar.cc/128?img=13'),
(4, '老周', '13800010004', 'https://i.pravatar.cc/128?img=14'),
(5, '小满', '13800010005', 'https://i.pravatar.cc/128?img=15'),
(6, 'Rita', '13800010006', 'https://i.pravatar.cc/128?img=16'),
(7, '陈一', '13800010007', 'https://i.pravatar.cc/128?img=17'),
(8, '南瓜', '13800010008', 'https://i.pravatar.cc/128?img=18'),
(9, '海盐', '13800010009', 'https://i.pravatar.cc/128?img=19'),
(10, '北辰', '13800010010', 'https://i.pravatar.cc/128?img=20'),
(11, '栗子', '13800010011', 'https://i.pravatar.cc/128?img=21'),
(12, '安安', '13800010012', 'https://i.pravatar.cc/128?img=22'),
(13, 'Leo', '13800010013', 'https://i.pravatar.cc/128?img=23'),
(14, '可乐', '13800010014', 'https://i.pravatar.cc/128?img=24'),
(15, '苏打', '13800010015', 'https://i.pravatar.cc/128?img=25'),
(16, '陶子', '13800010016', 'https://i.pravatar.cc/128?img=26'),
(17, '沈默', '13800010017', 'https://i.pravatar.cc/128?img=27'),
(18, '鱼丸', '13800010018', 'https://i.pravatar.cc/128?img=28'),
(19, '橘白', '13800010019', 'https://i.pravatar.cc/128?img=29'),
(20, '晓风', '13800010020', 'https://i.pravatar.cc/128?img=30'),
(21, '青柠', '13800010021', 'https://i.pravatar.cc/128?img=31'),
(22, '阿布', '13800010022', 'https://i.pravatar.cc/128?img=32'),
(23, '米粒', '13800010023', 'https://i.pravatar.cc/128?img=33'),
(24, '江野', '13800010024', 'https://i.pravatar.cc/128?img=34'),
(25, '许愿', '13800010025', 'https://i.pravatar.cc/128?img=35'),
(26, '白桃', '13800010026', 'https://i.pravatar.cc/128?img=36'),
(27, '木南', '13800010027', 'https://i.pravatar.cc/128?img=37'),
(28, '钟意', '13800010028', 'https://i.pravatar.cc/128?img=38'),
(29, '小羽', '13800010029', 'https://i.pravatar.cc/128?img=39'),
(30, '陆离', '13800010030', 'https://i.pravatar.cc/128?img=40');

UPDATE players
SET
  member_no = CONCAT('MB', DATE_FORMAT(CURDATE(), '%Y'), LPAD(id, 5, '0')),
  avatar_url = CONCAT('https://i.pravatar.cc/128?img=', 1 + (id MOD 70)),
  balance_cents = (80 + (id MOD 12) * 35) * 100,
  total_recharged_cents = ((80 + (id MOD 12) * 35) + (120 + (id MOD 10) * 55)) * 100,
  total_spent_cents = (120 + (id MOD 10) * 55) * 100,
  status = 'active'
WHERE id <= 30;

INSERT INTO reservations (id, table_id, player_id, guest_name, party_size, reserved_start, reserved_end, status) VALUES
(1, 2, 1, '林鹿四人局', 4, DATE_ADD(CURDATE(), INTERVAL 19 HOUR), DATE_ADD(CURDATE(), INTERVAL 21 HOUR), 'pending'),
(2, 5, 6, 'Rita 狼人杀局', 8, DATE_ADD(CURDATE(), INTERVAL 20 HOUR), DATE_ADD(CURDATE(), INTERVAL 23 HOUR), 'pending'),
(3, 10, 9, '海盐家庭局', 4, DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 1 DAY), INTERVAL 14 HOUR), DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 1 DAY), INTERVAL 17 HOUR), 'pending'),
(4, 3, 2, '阿哲卡坦局', 4, DATE_SUB(NOW(), INTERVAL 50 MINUTE), DATE_ADD(NOW(), INTERVAL 80 MINUTE), 'active'),
(5, 7, 4, '老周包间局', 5, DATE_SUB(NOW(), INTERVAL 35 MINUTE), DATE_ADD(NOW(), INTERVAL 95 MINUTE), 'active'),
(6, 11, 14, '可乐生日局', 8, DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 2 DAY), INTERVAL 19 HOUR), DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 2 DAY), INTERVAL 22 HOUR), 'pending'),
(7, 12, 18, '鱼丸双人局', 2, DATE_ADD(CURDATE(), INTERVAL 22 HOUR), DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 1 DAY), INTERVAL 0 HOUR), 'pending'),
(8, 1, 5, '小满周五局', 4, DATE_SUB(CURDATE(), INTERVAL 6 DAY) + INTERVAL 19 HOUR, DATE_SUB(CURDATE(), INTERVAL 6 DAY) + INTERVAL 21 HOUR, 'completed'),
(9, 4, 11, '栗子新手局', 3, DATE_SUB(CURDATE(), INTERVAL 5 DAY) + INTERVAL 18 HOUR, DATE_SUB(CURDATE(), INTERVAL 5 DAY) + INTERVAL 20 HOUR, 'completed'),
(10, 6, 13, 'Leo 双人局', 2, DATE_SUB(CURDATE(), INTERVAL 4 DAY) + INTERVAL 15 HOUR, DATE_SUB(CURDATE(), INTERVAL 4 DAY) + INTERVAL 17 HOUR, 'completed');

INSERT INTO play_sessions (id, table_id, reservation_id, started_at, ended_at, billed_minutes, amount_cents, notes) VALUES
(1, 3, 4, DATE_SUB(NOW(), INTERVAL 50 MINUTE), NULL, NULL, 0, '当前进行：卡坦岛教学局'),
(2, 7, 5, DATE_SUB(NOW(), INTERVAL 35 MINUTE), NULL, NULL, 0, '当前进行：包间对局'),
(3, 12, NULL, DATE_SUB(NOW(), INTERVAL 75 MINUTE), NULL, NULL, 0, '现场开台：双人对弈'),
(11, 1, 8, DATE_SUB(CURDATE(), INTERVAL 6 DAY) + INTERVAL 19 HOUR, DATE_SUB(CURDATE(), INTERVAL 6 DAY) + INTERVAL 21 HOUR + INTERVAL 8 MINUTE, 128, 9800, '周五晚高峰'),
(12, 4, 9, DATE_SUB(CURDATE(), INTERVAL 5 DAY) + INTERVAL 18 HOUR, DATE_SUB(CURDATE(), INTERVAL 5 DAY) + INTERVAL 20 HOUR + INTERVAL 20 MINUTE, 140, 11200, '新手教学'),
(13, 6, 10, DATE_SUB(CURDATE(), INTERVAL 4 DAY) + INTERVAL 15 HOUR, DATE_SUB(CURDATE(), INTERVAL 4 DAY) + INTERVAL 17 HOUR + INTERVAL 5 MINUTE, 125, 8600, '工作日下午双人局'),
(14, 8, NULL, DATE_SUB(CURDATE(), INTERVAL 3 DAY) + INTERVAL 20 HOUR, DATE_SUB(CURDATE(), INTERVAL 3 DAY) + INTERVAL 23 HOUR + INTERVAL 15 MINUTE, 195, 15800, '狼人杀拼桌'),
(15, 2, NULL, DATE_SUB(CURDATE(), INTERVAL 3 DAY) + INTERVAL 14 HOUR, DATE_SUB(CURDATE(), INTERVAL 3 DAY) + INTERVAL 16 HOUR + INTERVAL 30 MINUTE, 150, 10800, '亲子桌'),
(16, 5, NULL, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 19 HOUR, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 21 HOUR + INTERVAL 40 MINUTE, 160, 12800, '熟客局'),
(17, 9, NULL, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 16 HOUR, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR + INTERVAL 10 MINUTE, 130, 9200, '下午茶套餐'),
(18, 10, NULL, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 18 HOUR, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 20 HOUR + INTERVAL 45 MINUTE, 165, 13200, '会员活动'),
(19, 11, NULL, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 20 HOUR, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 23 HOUR + INTERVAL 5 MINUTE, 185, 14800, '重策包间'),
(20, 1, NULL, CURDATE() + INTERVAL 13 HOUR, CURDATE() + INTERVAL 15 HOUR + INTERVAL 20 MINUTE, 140, 9800, '今日下午场'),
(21, 4, NULL, CURDATE() + INTERVAL 14 HOUR, CURDATE() + INTERVAL 16 HOUR + INTERVAL 50 MINUTE, 170, 11800, '今日聚会局'),
(22, 6, NULL, CURDATE() + INTERVAL 16 HOUR, CURDATE() + INTERVAL 18 HOUR + INTERVAL 15 MINUTE, 135, 9600, '今日双人桌'),
(23, 8, NULL, CURDATE() + INTERVAL 17 HOUR, CURDATE() + INTERVAL 19 HOUR + INTERVAL 30 MINUTE, 150, 11800, '今日教学局'),
(24, 9, NULL, CURDATE() + INTERVAL 18 HOUR, CURDATE() + INTERVAL 20 HOUR + INTERVAL 10 MINUTE, 130, 10800, '今日家庭局');

INSERT INTO game_records (session_id, game_id, title_snapshot, winner_player_id, winner_display_name, score_json, played_at) VALUES
(11, 6, '璀璨宝石', 1, NULL, JSON_OBJECT('scores', JSON_ARRAY(15, 12, 9, 8)), DATE_SUB(CURDATE(), INTERVAL 6 DAY) + INTERVAL 21 HOUR),
(12, 5, '阿瓦隆', 4, NULL, JSON_OBJECT('camp', '蓝方', 'rounds', 5), DATE_SUB(CURDATE(), INTERVAL 5 DAY) + INTERVAL 20 HOUR),
(13, 12, '开膛手杰克', 13, NULL, JSON_OBJECT('winnerRole', 'Jack', 'turns', 7), DATE_SUB(CURDATE(), INTERVAL 4 DAY) + INTERVAL 17 HOUR),
(14, 4, '狼人杀', 8, NULL, JSON_OBJECT('camp', '狼人', 'players', 10), DATE_SUB(CURDATE(), INTERVAL 3 DAY) + INTERVAL 23 HOUR),
(15, 14, '花砖物语', 11, NULL, JSON_OBJECT('scores', JSON_ARRAY(74, 68, 61)), DATE_SUB(CURDATE(), INTERVAL 3 DAY) + INTERVAL 16 HOUR),
(16, 1, '卡坦岛', 2, NULL, JSON_OBJECT('vp', 10, 'longestRoad', true), DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 21 HOUR),
(17, 8, '瘟疫危机', NULL, '全员胜利', JSON_OBJECT('result', 'success', 'difficulty', 'normal'), DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR),
(18, 6, '璀璨宝石', 6, NULL, JSON_OBJECT('scores', JSON_ARRAY(16, 13, 11, 9)), DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 20 HOUR),
(19, 24, '重塑火星', 20, NULL, JSON_OBJECT('scores', JSON_ARRAY(82, 77, 71)), DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 23 HOUR),
(20, 2, '车票之旅', 5, NULL, JSON_OBJECT('scores', JSON_ARRAY(121, 110, 98)), CURDATE() + INTERVAL 15 HOUR),
(21, 15, '行动代号', 14, NULL, JSON_OBJECT('rounds', 3, 'score', '2:1'), CURDATE() + INTERVAL 16 HOUR),
(22, 7, '冷战热斗', 13, NULL, JSON_OBJECT('turn', 8, 'vp', 20), CURDATE() + INTERVAL 18 HOUR),
(23, 3, '七大奇迹', 3, NULL, JSON_OBJECT('scores', JSON_ARRAY(63, 58, 54, 50)), CURDATE() + INTERVAL 19 HOUR),
(24, 13, '情书', 18, NULL, JSON_OBJECT('rounds', 6, 'tokens', 4), CURDATE() + INTERVAL 20 HOUR);

UPDATE player_stats
SET games = wins + 4 + (player_id MOD 9)
WHERE wins > 0;

UPDATE player_stats
SET games = 2 + (player_id MOD 6)
WHERE wins = 0 AND player_id <= 30;

UPDATE game_table_state gts
LEFT JOIN (
  SELECT r.table_id, MIN(r.id) AS reservation_id
  FROM reservations r
  WHERE r.status = 'pending'
  GROUP BY r.table_id
) pending ON pending.table_id = gts.table_id
SET
  gts.status = CASE
    WHEN gts.current_session_id IS NOT NULL THEN 'occupied'
    WHEN pending.reservation_id IS NOT NULL THEN 'reserved'
    ELSE 'idle'
  END,
  gts.current_reservation_id = CASE
    WHEN gts.current_session_id IS NOT NULL THEN gts.current_reservation_id
    ELSE pending.reservation_id
  END;
