-- 任务：学生最大提交次数（幂等）
ALTER TABLE `tasks`
  ADD COLUMN IF NOT EXISTS `max_submissions` INT NOT NULL DEFAULT 1 COMMENT '学生最大可提交次数（每次成功提交计 1 次）' AFTER `max_score`;
