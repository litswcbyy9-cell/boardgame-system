-- Phase 2：商业化闭环 - 多租户、会员、优惠券、订单
-- 添加 Phase 2 所需的表到现有数据库

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

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

-- venues 加 tenant_id
ALTER TABLE venues ADD COLUMN IF NOT EXISTS tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id;
ALTER TABLE venues ADD KEY IF NOT EXISTS ix_venues_tenant (tenant_id);
ALTER TABLE venues ADD CONSTRAINT IF NOT EXISTS fk_venues_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- app_users 加 tenant_id
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id;
ALTER TABLE app_users DROP KEY IF EXISTS uk_app_users_username;
ALTER TABLE app_users ADD UNIQUE KEY uk_app_users_tenant_username (tenant_id, username);
ALTER TABLE app_users ADD CONSTRAINT IF NOT EXISTS fk_app_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- =====================================================================
-- 2. 会员等级与积分
-- =====================================================================
ALTER TABLE players ADD COLUMN IF NOT EXISTS tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id;
ALTER TABLE players ADD COLUMN IF NOT EXISTS membership_level ENUM('bronze', 'silver', 'gold', 'platinum', 'diamond') NOT NULL DEFAULT 'bronze' AFTER total_spent_cents;
ALTER TABLE players ADD COLUMN IF NOT EXISTS points INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '积分' AFTER membership_level;
ALTER TABLE players ADD COLUMN IF NOT EXISTS birthday DATE NULL COMMENT '生日' AFTER points;
ALTER TABLE players DROP KEY IF EXISTS uk_players_member_no;
ALTER TABLE players ADD UNIQUE KEY IF NOT EXISTS uk_players_tenant_member_no (tenant_id, member_no);
ALTER TABLE players ADD KEY IF NOT EXISTS ix_players_tenant_status (tenant_id, status);
ALTER TABLE players ADD CONSTRAINT IF NOT EXISTS fk_players_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

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
  KEY ix_points_logs_tenant_created (tenant_id, created_at),
  CONSTRAINT fk_points_logs_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
  CONSTRAINT fk_points_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
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
  KEY ix_coupons_tenant_end_at (tenant_id, end_at),
  CONSTRAINT fk_coupons_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='优惠券';

-- 会员领券
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
  KEY ix_member_coupons_coupon_status (coupon_id, status),
  CONSTRAINT fk_member_coupons_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
  CONSTRAINT fk_member_coupons_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE CASCADE
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
  KEY ix_orders_player_created (player_id, created_at),
  CONSTRAINT fk_orders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_venue FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='订单';

-- 订单明细
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

SET FOREIGN_KEY_CHECKS = 1;


-- venues 加 tenant_id
ALTER TABLE venues ADD COLUMN IF NOT EXISTS tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id;
ALTER TABLE venues ADD KEY IF NOT EXISTS ix_venues_tenant (tenant_id);
ALTER TABLE venues ADD CONSTRAINT IF NOT EXISTS fk_venues_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- app_users 加 tenant_id
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id;
ALTER TABLE app_users DROP KEY IF EXISTS uk_app_users_username;
ALTER TABLE app_users ADD UNIQUE KEY uk_app_users_tenant_username (tenant_id, username);
ALTER TABLE app_users ADD CONSTRAINT IF NOT EXISTS fk_app_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- =====================================================================
-- 2. 会员等级与积分
-- =====================================================================
ALTER TABLE players ADD COLUMN IF NOT EXISTS tenant_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID' AFTER id;
ALTER TABLE players ADD COLUMN IF NOT EXISTS membership_level ENUM('bronze', 'silver', 'gold', 'platinum', 'diamond') NOT NULL DEFAULT 'bronze' AFTER total_spent_cents;
ALTER TABLE players ADD COLUMN IF NOT EXISTS points INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '积分' AFTER membership_level;
ALTER TABLE players ADD COLUMN IF NOT EXISTS birthday DATE NULL COMMENT '生日' AFTER points;
ALTER TABLE players DROP KEY IF EXISTS uk_players_member_no;
ALTER TABLE players ADD UNIQUE KEY IF NOT EXISTS uk_players_tenant_member_no (tenant_id, member_no);
ALTER TABLE players ADD KEY IF NOT EXISTS ix_players_tenant_status (tenant_id, status);
ALTER TABLE players ADD CONSTRAINT IF NOT EXISTS fk_players_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

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
  KEY ix_points_logs_tenant_created (tenant_id, created_at),
  CONSTRAINT fk_points_logs_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
  CONSTRAINT fk_points_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
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
  KEY ix_coupons_tenant_end_at (tenant_id, end_at),
  CONSTRAINT fk_coupons_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='优惠券';

-- 会员领券
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
  KEY ix_member_coupons_coupon_status (coupon_id, status),
  CONSTRAINT fk_member_coupons_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
  CONSTRAINT fk_member_coupons_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE CASCADE
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
  KEY ix_orders_player_created (player_id, created_at),
  CONSTRAINT fk_orders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_venue FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='订单';

-- 订单明细
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

SET FOREIGN_KEY_CHECKS = 1;
