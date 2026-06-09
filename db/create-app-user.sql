-- 以管理员执行一次：创建应用账号（密码可按需修改后再 GRANT）
DROP USER IF EXISTS 'boardgame'@'localhost';
CREATE USER 'boardgame'@'localhost' IDENTIFIED BY 'boardgame';
GRANT ALL PRIVILEGES ON boardgame.* TO 'boardgame'@'localhost';
FLUSH PRIVILEGES;
