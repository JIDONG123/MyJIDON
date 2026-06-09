-- AI 批改异步任务（grading_jobs / grading_job_items），幂等
-- 不修改 grading_results 结构，保留 ai_batch_id

CREATE TABLE IF NOT EXISTS `grading_jobs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `created_by` INT NOT NULL COMMENT '发起用户',
  `task_id` INT NULL COMMENT '关联任务（批量必填）',
  `scope_type` ENUM('single', 'batch_task') NOT NULL DEFAULT 'single',
  `teaching_class_id` INT NULL,
  `class_id` INT NULL,
  `course_id` INT NULL,
  `status` ENUM('pending', 'running', 'completed', 'partial_failed', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  `total_count` INT NOT NULL DEFAULT 0,
  `finished_count` INT NOT NULL DEFAULT 0,
  `success_count` INT NOT NULL DEFAULT 0,
  `failed_count` INT NOT NULL DEFAULT 0,
  `progress` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0-100',
  `message` VARCHAR(500) NULL,
  `error_summary` TEXT NULL,
  `legacy_batch_id` BIGINT NULL COMMENT '兼容旧 ai_batch_id / batch-progress',
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_gj_created_by` (`created_by`),
  INDEX `idx_gj_task` (`task_id`),
  INDEX `idx_gj_status` (`status`),
  INDEX `idx_gj_legacy_batch` (`legacy_batch_id`),
  INDEX `idx_gj_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 批改任务';

CREATE TABLE IF NOT EXISTS `grading_job_items` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT NOT NULL,
  `submission_id` INT NOT NULL,
  `student_id` INT NULL,
  `status` ENUM('pending', 'running', 'success', 'failed', 'skipped', 'cancelled') NOT NULL DEFAULT 'pending',
  `attempt_count` INT NOT NULL DEFAULT 0,
  `error_message` VARCHAR(500) NULL,
  `grading_result_id` INT NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_gji_job_submission` (`job_id`, `submission_id`),
  INDEX `idx_gji_job` (`job_id`),
  INDEX `idx_gji_submission` (`submission_id`),
  INDEX `idx_gji_status` (`status`),
  CONSTRAINT `fk_gji_job` FOREIGN KEY (`job_id`) REFERENCES `grading_jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 批改任务明细';
