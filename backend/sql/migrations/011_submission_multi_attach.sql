-- 学生提交：多附件 + 正文/代码区 + 代码运行 hash 绑定

CREATE TABLE IF NOT EXISTS `submission_attachments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `submission_id` INT NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `original_name` VARCHAR(255) NOT NULL,
  `stored_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `file_size` BIGINT NOT NULL DEFAULT 0,
  `mime_type` VARCHAR(128) NULL,
  `file_ext` VARCHAR(32) NULL,
  `file_hash` VARCHAR(128) NULL,
  `safety_status` VARCHAR(32) NOT NULL DEFAULT 'passed',
  `safety_reason` VARCHAR(500) NULL,
  `safety_checked_at` DATETIME NULL,
  `vision_status` VARCHAR(32) NULL COMMENT 'skipped|done|failed|pending',
  `vision_result_json` JSON NULL,
  `vision_text` MEDIUMTEXT NULL,
  `parsed_text` MEDIUMTEXT NULL COMMENT '文档解析摘要',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_sa_submission` (`submission_id`),
  INDEX `idx_sa_hash` (`file_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提交附件（一对多）';

ALTER TABLE `submissions`
  ADD COLUMN IF NOT EXISTS `submission_text` MEDIUMTEXT NULL COMMENT '学生文字说明（纯文本，不含附件解析）' AFTER `content`,
  ADD COLUMN IF NOT EXISTS `code_content` MEDIUMTEXT NULL COMMENT '代码区内容' AFTER `submission_text`,
  ADD COLUMN IF NOT EXISTS `code_language` VARCHAR(32) NULL AFTER `code_content`,
  ADD COLUMN IF NOT EXISTS `code_content_hash` VARCHAR(128) NULL AFTER `code_language`,
  ADD COLUMN IF NOT EXISTS `code_run_bound_hash` VARCHAR(128) NULL COMMENT '与 code_run 结果绑定的内容 hash' AFTER `code_content_hash`;

ALTER TABLE `code_run_jobs`
  ADD COLUMN IF NOT EXISTS `code_hash` VARCHAR(128) NULL AFTER `source_type`,
  ADD COLUMN IF NOT EXISTS `attachment_id` BIGINT NULL AFTER `code_hash`;

ALTER TABLE `code_run_results`
  ADD COLUMN IF NOT EXISTS `code_hash` VARCHAR(128) NULL AFTER `job_id`,
  ADD COLUMN IF NOT EXISTS `source_type` VARCHAR(32) NULL AFTER `code_hash`,
  ADD COLUMN IF NOT EXISTS `meta_json` JSON NULL AFTER `artifact_json`;
