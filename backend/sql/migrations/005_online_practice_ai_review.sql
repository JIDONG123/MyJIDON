-- Phase F1：在线实训 AI 代码点评（练习参考分，非正式成绩）
-- 幂等；不修改 grading_results / grading_jobs / submissions 成绩字段

ALTER TABLE `online_practice_templates`
  ADD COLUMN IF NOT EXISTS `ai_review_enabled` TINYINT(1) NOT NULL DEFAULT 1
  COMMENT '模板是否启用 AI 代码点评（受全局 ONLINE_PRACTICE_AI_REVIEW_ENABLED 控制）'
  AFTER `code_run_timeout_sec`;

ALTER TABLE `online_practice_attempts`
  ADD COLUMN IF NOT EXISTS `last_ai_review_id` BIGINT NULL COMMENT '最近一次 AI 点评'
  AFTER `last_code_run_result_id`;

CREATE TABLE IF NOT EXISTS `online_practice_ai_reviews` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `attempt_id` BIGINT NOT NULL,
  `template_id` INT NOT NULL,
  `student_id` INT NOT NULL,
  `code_run_result_id` BIGINT NOT NULL,
  `code_run_job_id` BIGINT NULL,
  `language` ENUM('python', 'node', 'c', 'cpp', 'java') NOT NULL,
  `entry_file` VARCHAR(120) NOT NULL,
  `task_description` TEXT NULL,
  `source_code` MEDIUMTEXT NOT NULL,
  `source_code_sha256` CHAR(64) NULL,
  `run_snapshot_json` JSON NULL,
  `review_json` JSON NULL,
  `style_score` TINYINT UNSIGNED NULL COMMENT '0-100 代码规范参考分',
  `status` ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  `error_message` VARCHAR(500) NULL,
  `model_name` VARCHAR(80) NULL,
  `latency_ms` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_opar_attempt` (`attempt_id`, `created_at`),
  INDEX `idx_opar_student` (`student_id`, `created_at`),
  INDEX `idx_opar_template` (`template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='在线实训 AI 代码点评（课堂参考，非正式成绩）';
