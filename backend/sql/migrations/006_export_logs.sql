-- 导出操作审计日志（教师/管理员导出 Excel / ZIP / PDF）
CREATE TABLE IF NOT EXISTS `export_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '导出人',
  `export_type` VARCHAR(48) NOT NULL COMMENT 'task_scores_excel|task_submissions_zip|practice_scores_excel|practice_scores_pdf|personal_pdf',
  `format` VARCHAR(16) NOT NULL COMMENT 'xlsx|zip|pdf',
  `scope_label` VARCHAR(512) NULL COMMENT '导出范围描述',
  `task_id` INT NULL,
  `scope_type` VARCHAR(32) NULL COMMENT 'legacy_class|teaching_class|course',
  `scope_id` INT NULL,
  `file_name` VARCHAR(255) NULL,
  `row_count` INT NULL COMMENT '记录行数或附件数',
  `status` ENUM('success', 'failed') NOT NULL DEFAULT 'success',
  `error_message` VARCHAR(512) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_export_logs_user_created` (`user_id`, `created_at`),
  INDEX `idx_export_logs_task` (`task_id`),
  INDEX `idx_export_logs_type` (`export_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='导出操作日志';
