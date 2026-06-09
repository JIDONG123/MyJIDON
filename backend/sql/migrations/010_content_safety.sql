-- 内容安全检测与合规审查

CREATE TABLE IF NOT EXISTS `content_safety_audit_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `target_type` VARCHAR(64) NOT NULL COMMENT 'submission|kb_document|avatar|student_import|teacher_import|text|assistant|account',
  `target_id` BIGINT NULL,
  `user_id` INT NULL,
  `user_role` VARCHAR(32) NULL,
  `username` VARCHAR(100) NULL,
  `real_name` VARCHAR(100) NULL,
  `file_name` VARCHAR(255) NULL,
  `file_type` VARCHAR(64) NULL,
  `file_hash` VARCHAR(128) NULL,
  `risk_level` VARCHAR(20) NOT NULL DEFAULT 'safe',
  `categories_json` JSON NULL,
  `reason` VARCHAR(500) NULL,
  `model_used` VARCHAR(64) NULL,
  `raw_result_json` JSON NULL COMMENT '不含 API Key',
  `status` VARCHAR(32) NOT NULL DEFAULT 'passed' COMMENT 'passed|pending_review|rejected|manual_approved|manual_rejected',
  `reviewer_id` INT NULL,
  `review_note` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cs_audit_status` (`status`),
  INDEX `idx_cs_audit_target` (`target_type`, `target_id`),
  INDEX `idx_cs_audit_risk` (`risk_level`),
  INDEX `idx_cs_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内容安全审计日志';

ALTER TABLE `submissions`
  ADD COLUMN IF NOT EXISTS `safety_status` VARCHAR(32) NOT NULL DEFAULT 'passed' COMMENT 'passed|pending_review|rejected|manual_approved|manual_rejected' AFTER `similarity_pairs`,
  ADD COLUMN IF NOT EXISTS `safety_reason` VARCHAR(500) NULL AFTER `safety_status`,
  ADD COLUMN IF NOT EXISTS `safety_checked_at` DATETIME NULL AFTER `safety_reason`,
  ADD COLUMN IF NOT EXISTS `safety_reviewed_by` INT NULL AFTER `safety_checked_at`,
  ADD COLUMN IF NOT EXISTS `safety_reviewed_at` DATETIME NULL AFTER `safety_reviewed_by`,
  ADD COLUMN IF NOT EXISTS `file_hash` VARCHAR(128) NULL AFTER `file_type`;

ALTER TABLE `kb_documents`
  ADD COLUMN IF NOT EXISTS `safety_status` VARCHAR(32) NOT NULL DEFAULT 'passed' AFTER `status`,
  ADD COLUMN IF NOT EXISTS `safety_reason` VARCHAR(500) NULL AFTER `safety_status`,
  ADD COLUMN IF NOT EXISTS `safety_checked_at` DATETIME NULL AFTER `safety_reason`,
  ADD COLUMN IF NOT EXISTS `safety_reviewed_by` INT NULL AFTER `safety_checked_at`,
  ADD COLUMN IF NOT EXISTS `safety_reviewed_at` DATETIME NULL AFTER `safety_reviewed_by`,
  ADD COLUMN IF NOT EXISTS `file_hash` VARCHAR(128) NULL AFTER `mime_type`;

ALTER TABLE `student_import_rows`
  ADD COLUMN IF NOT EXISTS `import_safety_status` VARCHAR(32) NULL AFTER `errors_json`,
  ADD COLUMN IF NOT EXISTS `import_safety_reason` VARCHAR(500) NULL AFTER `import_safety_status`;

ALTER TABLE `teacher_import_rows`
  ADD COLUMN IF NOT EXISTS `import_safety_status` VARCHAR(32) NULL AFTER `errors_json`,
  ADD COLUMN IF NOT EXISTS `import_safety_reason` VARCHAR(500) NULL AFTER `import_safety_status`;
