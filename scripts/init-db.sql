-- 多式联运演示版 v0：一次性建库脚本
-- 用法（任选其一）：
--   1) 在 PowerShell 中执行：& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u root -p -e "source D:/MyCodes/multimodal-platform/scripts/init-db.sql"
--   2) 打开 MySQL Workbench / 命令行客户端，用 root 登录后执行本文件
-- 说明：只创建演示库和演示账号，不修改其他库；密码可自行修改后同步到 api/.env

CREATE DATABASE IF NOT EXISTS multimodal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'mto_demo'@'localhost' IDENTIFIED BY 'Mto_demo_2026';

GRANT ALL PRIVILEGES ON multimodal.* TO 'mto_demo'@'localhost';

FLUSH PRIVILEGES;
