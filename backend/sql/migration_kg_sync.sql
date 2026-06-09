-- 知识图谱：MariaDB 为权威数据源，Neo4j 异步镜像
CREATE TABLE IF NOT EXISTS `kg_build_jobs` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `scope_type` VARCHAR(32) NOT NULL COMMENT 'course|class|student|full',
  `scope_id` VARCHAR(64) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending|processing|done|failed',
  `progress` INT NOT NULL DEFAULT 0,
  `message` VARCHAR(500) NULL,
  `error_message` VARCHAR(500) NULL,
  `requested_by` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  INDEX `idx_kg_job_status` (`status`),
  INDEX `idx_kg_job_scope` (`scope_type`, `scope_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kg_nodes` (
  `id` VARCHAR(128) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `node_type` VARCHAR(64) NOT NULL,
  `source_table` VARCHAR(64) NULL,
  `source_id` VARCHAR(64) NULL,
  `embedding_json` JSON NULL,
  `meta_json` JSON NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_kg_node_type` (`node_type`),
  INDEX `idx_kg_node_source` (`source_table`, `source_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kg_edges` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `from_node_id` VARCHAR(128) NOT NULL,
  `to_node_id` VARCHAR(128) NOT NULL,
  `rel_type` VARCHAR(64) NOT NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'rule',
  `weight` DECIMAL(6, 4) NULL,
  `meta_json` JSON NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_kg_edge` (`from_node_id`, `to_node_id`, `rel_type`),
  INDEX `idx_kg_edge_from` (`from_node_id`),
  INDEX `idx_kg_edge_to` (`to_node_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kg_sync_state` (
  `id` TINYINT PRIMARY KEY DEFAULT 1,
  `last_full_sync_at` DATETIME NULL,
  `last_reconcile_at` DATETIME NULL,
  `neo4j_synced_at` DATETIME NULL,
  `neo4j_status` VARCHAR(32) NULL,
  `node_count` INT NULL,
  `edge_count` INT NULL,
  `reconcile_note` VARCHAR(500) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `kg_sync_state` (`id`) VALUES (1);
