-- 任务：学生最大提交次数（存量库执行一次）
USE `smart_grading_system`;

ALTER TABLE `tasks`
  ADD COLUMN `max_submissions` INT NOT NULL DEFAULT 1 COMMENT '学生最大可提交次数（每次成功提交计 1 次）' AFTER `max_score`;
