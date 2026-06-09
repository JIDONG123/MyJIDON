-- 高校–企业协同实训场景：任务表扩展（幂等）
ALTER TABLE `tasks`
  ADD COLUMN IF NOT EXISTS `scenario_type` ENUM('teaching', 'enterprise_collab', 'mixed') NOT NULL DEFAULT 'mixed'
    COMMENT '任务场景：校内教学/校企协同/综合'
    AFTER `scoring_criteria`,
  ADD COLUMN IF NOT EXISTS `enterprise_standard` TEXT NULL
    COMMENT '企业岗位能力、交付规范等与教学要求并列的标准（可选）'
    AFTER `scenario_type`;
