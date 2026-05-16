-- 任务级综合分权重（可覆盖系统设置），执行一次即可
USE `smart_grading_system`;

ALTER TABLE `tasks`
ADD COLUMN `score_ai_weight` DECIMAL(5, 4) NULL COMMENT '综合分 AI 权重' AFTER `max_score`,
ADD COLUMN `score_human_weight` DECIMAL(5, 4) NULL COMMENT '综合分教师权重' AFTER `score_ai_weight`;
