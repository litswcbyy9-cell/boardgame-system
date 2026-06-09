-- 以管理员（如 root）执行：仅创建库。应用账号见 db/create-app-user.sql
CREATE DATABASE IF NOT EXISTS boardgame
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
