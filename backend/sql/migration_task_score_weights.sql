-- 任务级综合分权重（幂等）
ALTER TABLE `tasks`
  ADD COLUMN IF NOT EXISTS `score_ai_weight` DECIMAL(5, 4) NULL COMMENT '综合分 AI 权重' AFTER `max_score`,
  ADD COLUMN IF NOT EXISTS `score_human_weight` DECIMAL(5, 4) NULL COMMENT '综合分教师权重' AFTER `score_ai_weight`;
