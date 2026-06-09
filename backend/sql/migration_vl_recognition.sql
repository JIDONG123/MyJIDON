-- Qwen3-VL-Plus 图片视觉识别结果（不参与批改逻辑，仅存储展示与追溯）
ALTER TABLE `submissions`
  ADD COLUMN `vl_recognition_status` VARCHAR(20) NULL COMMENT 'skipped|done|failed' AFTER `archive_extracted_file_count`;

ALTER TABLE `submissions`
  ADD COLUMN `vl_recognition_text` LONGTEXT NULL COMMENT 'VL 识别规整文本' AFTER `vl_recognition_status`;

ALTER TABLE `submissions`
  ADD COLUMN `vl_recognition_meta` JSON NULL COMMENT 'VL 结构化 JSON' AFTER `vl_recognition_text`;

ALTER TABLE `submissions`
  ADD COLUMN `vl_recognition_error` VARCHAR(500) NULL COMMENT 'VL 识别失败原因' AFTER `vl_recognition_meta`;

ALTER TABLE `submissions`
  ADD COLUMN `vl_recognition_at` DATETIME NULL COMMENT 'VL 识别完成时间' AFTER `vl_recognition_error`;
