-- ZIP 源码包解析字段（幂等）
ALTER TABLE `submissions`
  ADD COLUMN IF NOT EXISTS `archive_extracted_text` LONGTEXT NULL COMMENT 'ZIP 解压合并后的结构化文本（供 AI 优先使用）' AFTER `content`;

ALTER TABLE `submissions`
  ADD COLUMN IF NOT EXISTS `archive_extracted_file_count` INT NULL COMMENT 'ZIP 内成功解析的文本文件数量' AFTER `archive_extracted_text`;
