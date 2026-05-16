-- 高校–企业协同实训场景：任务表扩展（在已有库上执行一次）
-- mysql -u root -p smart_grading_system < backend/sql/migration_scenario_coop.sql
USE `smart_grading_system`;

ALTER TABLE `tasks`
  ADD COLUMN `scenario_type` ENUM('teaching', 'enterprise_collab', 'mixed') NOT NULL DEFAULT 'mixed'
    COMMENT '任务场景：校内教学/校企协同/综合'
    AFTER `scoring_criteria`,
  ADD COLUMN `enterprise_standard` TEXT NULL
    COMMENT '企业岗位能力、交付规范等与教学要求并列的标准（可选）'
    AFTER `scenario_type`;
