-- Phase 2：商业化闭环 - 多租户、会员、优惠券、订单
-- 兼容 MySQL 8.0.27（不支持 ADD COLUMN/KEY/CONSTRAINT IF NOT EXISTS），
-- 用存储过程查 information_schema 后条件执行。幂等，可重复跑。
-- 列名对齐后端代码：membershipLevel（驼峰）。

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- 条件 DDL 辅助存储过程（列/索引/外键 不存在才执行）
-- =====================================================================
DROP PROCEDURE IF EXISTS pf_add_column;
DROP PROCEDURE IF EXISTS pf_add_index;
DROP PROCEDURE IF EXISTS pf_add_fk;
DROP PROCEDURE IF EXISTS pf_drop_index;

DELIMITER $$

CREATE PROCEDURE pf_add_column(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$

CREATE PROCEDURE pf_add_index(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD ', ddl);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$

CREATE PROCEDURE pf_add_fk(IN tbl VARCHAR(64), IN fk VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND CONSTRAINT_NAME = fk) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD ', ddl);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$

CREATE PROCEDURE pf_drop_index(IN tbl VARCHAR(64), IN idx VARCHAR(64))
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` DROP INDEX `', idx, '`');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$

DELIMITER ;

-- =====================================================================
-- 1. 租户管理
-- =====================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL COMMENT '租户/品牌方名称',
  phone VARCHAR(32) NULL,
  plan_type ENUM('free', 'basic', 'pro', 'enterprise') NOT NULL DEFAULT 'free',
  status ENUM('trial', 'active', 'suspended', 'expired') NOT NULL DEFAULT 'trial',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expired_at DATE NULL,
  PRIMARY KEY (id),
  KEY ix_tenants_status (status)
) ENGINE=InnoDB COMMENT='租户/品牌方';

INSERT INTO tenants (id, name, status) SELECT 1, '默认门店', 'active'
  WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = 1);

-- venues 加 tenant_id
CALL pf_add_column('venues', 'tenant_id', "tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id");
CALL pf_add_index('venues', 'ix_venues_tenant', 'KEY ix_venues_tenant (tenant_id)');

-- app_users 加 tenant_id
CALL pf_add_column('app_users', 'tenant_id', "tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id");
CALL pf_add_index('app_users', 'ix_app_users_tenant', 'KEY ix_app_users_tenant (tenant_id)');

-- =====================================================================
-- 2. 会员等级与积分（列名对齐后端：membershipLevel）
-- =====================================================================
CALL pf_add_column('players', 'tenant_id', "tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id");
CALL pf_add_column('players', 'membershipLevel', "membershipLevel ENUM('bronze','silver','gold','platinum','diamond') NOT NULL DEFAULT 'bronze' AFTER total_spent_cents");
CALL pf_add_column('players', 'points', "points INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '积分' AFTER membershipLevel");
CALL pf_add_column('players', 'birthday', "birthday DATE NULL COMMENT '生日' AFTER points");
CALL pf_add_index('players', 'ix_players_tenant_status', 'KEY ix_players_tenant_status (tenant_id, status)');

-- games 加 Phase2 字段（描述、出版信息）
CALL pf_add_column('games', 'tenant_id', "tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id");
CALL pf_add_column('games', 'description', "description TEXT NULL COMMENT '描述/规则简介' AFTER category");
CALL pf_add_column('games', 'publisher', "publisher VARCHAR(120) NULL AFTER description");
CALL pf_add_column('games', 'publish_year', "publish_year SMALLINT UNSIGNED NULL AFTER publisher");
CALL pf_add_column('games', 'bgg_id', "bgg_id VARCHAR(32) NULL AFTER publish_year");

-- 业务表加 tenant_id（报表/隔离用）
CALL pf_add_column('reservations', 'tenant_id', "tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id");
CALL pf_add_column('play_sessions', 'tenant_id', "tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id");
CALL pf_add_column('game_records', 'tenant_id', "tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id");

-- 积分流水表
CREATE TABLE IF NOT EXISTS points_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id INT UNSIGNED NOT NULL,
  tenant_id INT UNSIGNED NOT NULL,
  points INT NOT NULL COMMENT '积分数（可为负）',
  description VARCHAR(255) NOT NULL,
  type ENUM('consume', 'sign_in', 'redeem', 'admin') NOT NULL DEFAULT 'consume',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_points_logs_player_created (player_id, created_at),
  KEY ix_points_logs_tenant_created (tenant_id, created_at)
) ENGINE=InnoDB COMMENT='积分流水';

-- =====================================================================
-- 3. 优惠券
-- =====================================================================
CREATE TABLE IF NOT EXISTS coupons (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  type ENUM('discount_fixed', 'discount_percent', 'newbie') NOT NULL,
  value INT UNSIGNED NOT NULL COMMENT '优惠值（单位：分）',
  min_amount INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '最低消费（单位：分）',
  total_qty INT UNSIGNED NOT NULL,
  used_qty INT UNSIGNED NOT NULL DEFAULT 0,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  valid_on ENUM('weekday', 'weekend', 'all') NOT NULL DEFAULT 'all',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_coupons_tenant_name (tenant_id, name),
  KEY ix_coupons_tenant_end_at (tenant_id, end_at)
) ENGINE=InnoDB COMMENT='优惠券';

CREATE TABLE IF NOT EXISTS member_coupons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id INT UNSIGNED NOT NULL,
  coupon_id INT UNSIGNED NOT NULL,
  status ENUM('unused', 'used', 'expired') NOT NULL DEFAULT 'unused',
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_member_coupons_player_coupon (player_id, coupon_id),
  KEY ix_member_coupons_player_status (player_id, status),
  KEY ix_member_coupons_coupon_status (coupon_id, status)
) ENGINE=InnoDB COMMENT='会员领券记录';

-- =====================================================================
-- 4. 订单与结算
-- =====================================================================
CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT UNSIGNED NOT NULL,
  venue_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NULL,
  order_no VARCHAR(64) NOT NULL,
  amount_cents INT UNSIGNED NOT NULL COMMENT '原价（单位：分）',
  discount_cents INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '折扣金额（单位：分）',
  final_cents INT UNSIGNED NOT NULL COMMENT '实付金额（单位：分）',
  status ENUM('pending', 'paid', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_orders_order_no (tenant_id, order_no),
  KEY ix_orders_tenant_created (tenant_id, created_at),
  KEY ix_orders_venue_created (venue_id, created_at),
  KEY ix_orders_player_created (player_id, created_at)
) ENGINE=InnoDB COMMENT='订单';

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id INT UNSIGNED NOT NULL,
  session_id INT UNSIGNED NULL COMMENT '开台记录 ID',
  game_id INT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price INT UNSIGNED NOT NULL COMMENT '单价（单位：分）',
  total_price INT UNSIGNED NOT NULL COMMENT '小计（单位：分）',
  PRIMARY KEY (id),
  KEY ix_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='订单明细';

-- 清理辅助存储过程
DROP PROCEDURE IF EXISTS pf_add_column;
DROP PROCEDURE IF EXISTS pf_add_index;
DROP PROCEDURE IF EXISTS pf_add_fk;
DROP PROCEDURE IF EXISTS pf_drop_index;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Phase2 migration done (8.0.27 兼容)' AS status;
