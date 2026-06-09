-- 班级分层推荐阈值（幂等）
ALTER TABLE `classes`
  ADD COLUMN IF NOT EXISTS `rec_basic_below` DECIMAL(5, 2) NOT NULL DEFAULT 62.00 COMMENT '历史均分低于该值→巩固型，优先推荐基础难度未交任务' AFTER `teacher_id`,
  ADD COLUMN IF NOT EXISTS `rec_advanced_above` DECIMAL(5, 2) NOT NULL DEFAULT 86.00 COMMENT '历史均分≥该值且无显著维度薄弱→挑战型，优先推荐进阶未交任务' AFTER `rec_basic_below`;
