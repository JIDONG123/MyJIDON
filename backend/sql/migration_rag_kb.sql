-- RAG 私有实训知识库（教师上传文档 + 向量分块）

CREATE TABLE IF NOT EXISTS `kb_documents` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `teacher_id` INT NOT NULL,
  `category` ENUM('guide', 'standard', 'example', 'pitfalls', 'other') NOT NULL DEFAULT 'other',
  `title` VARCHAR(200) NOT NULL,
  `file_path` VARCHAR(512) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(120) NULL,
  `status` ENUM('processing', 'ready', 'failed') NOT NULL DEFAULT 'processing',
  `error_message` VARCHAR(500) NULL,
  `chunk_count` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_teacher` (`teacher_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实训知识库文档';

CREATE TABLE IF NOT EXISTS `kb_chunks` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `document_id` INT NOT NULL,
  `teacher_id` INT NOT NULL,
  `chunk_index` INT NOT NULL,
  `content` TEXT NOT NULL,
  `embedding` JSON NULL COMMENT 'Qwen text-embedding-v4 向量',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_teacher` (`teacher_id`),
  INDEX `idx_doc` (`document_id`),
  CONSTRAINT `fk_kb_chunk_doc` FOREIGN KEY (`document_id`) REFERENCES `kb_documents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库文本块';

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'embedding_api_base', 'https://dashscope.aliyuncs.com/compatible-mode/v1', '向量 API Base（OpenAI 兼容，默认 DashScope）'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'embedding_api_base');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'embedding_api_key', '', 'DashScope / 通义 API Key（用于 text-embedding-v4）'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'embedding_api_key');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'embedding_model', 'text-embedding-v4', '向量模型名'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'embedding_model');
