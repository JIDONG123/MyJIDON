-- 在线实训 + 代码运行检查（Code Runner Worker）
-- 幂等；不修改 grading_results / AI JSON 结构
-- 默认 tasks.code_run_enabled=0，不影响现有 Staging 主流程

-- ---------------------------------------------------------------------------
-- 1. tasks / submissions 扩展（可选功能，默认关闭）
-- ---------------------------------------------------------------------------
ALTER TABLE `tasks`
  ADD COLUMN IF NOT EXISTS `code_run_enabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用代码运行检查' AFTER `difficulty_level`,
  ADD COLUMN IF NOT EXISTS `code_run_language` ENUM('python', 'node', 'c', 'cpp', 'java') NULL COMMENT '运行检查语言' AFTER `code_run_enabled`,
  ADD COLUMN IF NOT EXISTS `code_run_config` JSON NULL COMMENT 'timeout_sec、entry_file、grade_after_run 等' AFTER `code_run_language`,
  ADD COLUMN IF NOT EXISTS `online_practice_template_id` INT NULL COMMENT '关联在线实训模板（可选）' AFTER `code_run_config`;

ALTER TABLE `submissions`
  ADD COLUMN IF NOT EXISTS `code_run_result_id` BIGINT NULL COMMENT '最新一次提交关联的运行结果' AFTER `similarity_pairs`,
  ADD COLUMN IF NOT EXISTS `code_run_summary` VARCHAR(500) NULL COMMENT '运行摘要（列表展示）' AFTER `code_run_result_id`;

CREATE INDEX IF NOT EXISTS `idx_tasks_code_run_enabled` ON `tasks` (`code_run_enabled`);
CREATE INDEX IF NOT EXISTS `idx_submissions_code_run_result` ON `submissions` (`code_run_result_id`);

-- ---------------------------------------------------------------------------
-- 2. 在线实训模板
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `online_practice_templates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL COMMENT '练习标题',
  `description` TEXT NULL COMMENT '题目说明',
  `language` ENUM('python', 'node', 'c', 'cpp', 'java') NOT NULL DEFAULT 'python',
  `starter_code` MEDIUMTEXT NULL COMMENT '初始模板代码',
  `solution_hint` TEXT NULL COMMENT '教师提示（学生端可选隐藏）',
  `stdin_default` TEXT NULL COMMENT '默认标准输入',
  `teaching_class_id` INT NULL,
  `class_id` INT NULL,
  `task_id` INT NULL COMMENT '关联正式任务（可选）',
  `code_run_timeout_sec` INT NOT NULL DEFAULT 10,
  `config_json` JSON NULL COMMENT 'entryFile、maxRunPerHour、forbiddenPatterns 等',
  `status` ENUM('draft', 'published', 'closed') NOT NULL DEFAULT 'draft',
  `created_by` INT NOT NULL,
  `published_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_opt_tc` (`teaching_class_id`),
  INDEX `idx_opt_class` (`class_id`),
  INDEX `idx_opt_task` (`task_id`),
  INDEX `idx_opt_status` (`status`),
  INDEX `idx_opt_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='在线实训模板';

-- ---------------------------------------------------------------------------
-- 3. 学生练习实例
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `online_practice_attempts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `template_id` INT NOT NULL,
  `student_id` INT NOT NULL,
  `source_code` MEDIUMTEXT NULL,
  `last_code_run_result_id` BIGINT NULL,
  `linked_submission_id` INT NULL COMMENT '提交到正式任务后的 submission',
  `run_count` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_opa_template_student` (`template_id`, `student_id`),
  INDEX `idx_opa_student` (`student_id`),
  INDEX `idx_opa_linked_sub` (`linked_submission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='在线实训学生实例';

-- ---------------------------------------------------------------------------
-- 4. 代码运行异步任务
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `code_run_jobs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `scope_type` ENUM('practice', 'submission', 'manual') NOT NULL DEFAULT 'practice',
  `practice_attempt_id` BIGINT NULL,
  `submission_id` INT NULL,
  `template_id` INT NULL,
  `task_id` INT NULL,
  `student_id` INT NULL,
  `language` ENUM('python', 'node', 'c', 'cpp', 'java') NOT NULL,
  `source_type` ENUM('inline', 'zip', 'job_dir') NOT NULL DEFAULT 'inline',
  `job_dir` VARCHAR(500) NULL COMMENT 'Worker 工作目录（相对 CODE_RUNNER_JOBS_ROOT）',
  `status` ENUM('pending', 'running', 'completed', 'failed', 'timeout', 'cancelled') NOT NULL DEFAULT 'pending',
  `timeout_sec` INT NOT NULL DEFAULT 10,
  `message` VARCHAR(500) NULL,
  `error_message` VARCHAR(500) NULL,
  `created_by` INT NOT NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_crj_status` (`status`),
  INDEX `idx_crj_submission` (`submission_id`),
  INDEX `idx_crj_attempt` (`practice_attempt_id`),
  INDEX `idx_crj_student` (`student_id`),
  INDEX `idx_crj_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='代码运行任务';

-- ---------------------------------------------------------------------------
-- 5. 代码运行结果
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `code_run_results` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT NOT NULL,
  `compile_exit_code` INT NULL,
  `run_exit_code` INT NULL,
  `compile_log` MEDIUMTEXT NULL,
  `stdout` MEDIUMTEXT NULL,
  `stderr` MEDIUMTEXT NULL,
  `timed_out` TINYINT(1) NOT NULL DEFAULT 0,
  `duration_ms` INT NULL,
  `entry_file_found` TINYINT(1) NOT NULL DEFAULT 0,
  `artifact_json` JSON NULL COMMENT 'files、zipEntries 等',
  `summary` VARCHAR(500) NULL COMMENT '人类可读摘要',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_crr_job` (`job_id`),
  INDEX `idx_crr_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='代码运行结果';
