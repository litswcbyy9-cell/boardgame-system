-- =============================================================================
-- 安全性：最小权限示例（生产按运维策略调整；开发可跳过本文件）
-- =============================================================================
SET NAMES utf8mb4;

-- MySQL 8.0.29+ 支持 CREATE USER IF NOT EXISTS；版本较低时请改为手动执行 db/create-app-user.sql 风格语句
CREATE USER IF NOT EXISTS 'bg_readonly'@'localhost' IDENTIFIED BY 'ChangeMe_ReadOnly_9xQ';
CREATE USER IF NOT EXISTS 'bg_app'@'localhost' IDENTIFIED BY 'ChangeMe_App_7zK';

GRANT SELECT ON boardgame.* TO 'bg_readonly'@'localhost';

GRANT SELECT, INSERT, UPDATE, DELETE ON boardgame.* TO 'bg_app'@'localhost';
GRANT EXECUTE ON boardgame.* TO 'bg_app'@'localhost';

FLUSH PRIVILEGES;
