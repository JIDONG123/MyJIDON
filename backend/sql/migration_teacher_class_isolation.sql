-- 教师-班级-任务数据隔离：关闭「公开任务」穿透；为示例班级绑定负责教师（按常见演示数据 id）
-- 手工执行：mysql -u root -p -D your_database < backend/sql/migration_teacher_class_isolation.sql
-- 推荐：在 backend 目录执行 node scripts/run-migration-isolation.js（使用 .env 中的 DB_*）

-- 学生只看本班任务，不再通过 is_public 看到其他班任务
UPDATE `tasks` SET `is_public` = 0 WHERE `is_public` = 1;

-- 若班级尚未指定教师：班级 id 1、2 → 教师 id 2；班级 id 3 → 教师 id 3（与 init.sql 示例一致；若你库中 id 不同请先手工调整）
UPDATE `classes` SET `teacher_id` = 2 WHERE `id` IN (1, 2) AND (`teacher_id` IS NULL OR `teacher_id` = 0);
UPDATE `classes` SET `teacher_id` = 3 WHERE `id` = 3 AND (`teacher_id` IS NULL OR `teacher_id` = 0);
