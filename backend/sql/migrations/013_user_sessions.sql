-- 单端登录会话审计表

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '用户 ID',
  `session_id` VARCHAR(64) NOT NULL COMMENT '会话 ID',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active/kicked/logout/expired',
  `login_ip` VARCHAR(64) NULL COMMENT '登录 IP',
  `user_agent` VARCHAR(512) NULL COMMENT 'User-Agent',
  `device_label` VARCHAR(128) NULL COMMENT '设备摘要',
  `login_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间',
  `last_seen_at` DATETIME NULL COMMENT '最后活跃时间',
  `kicked_at` DATETIME NULL COMMENT '被踢时间',
  `logout_at` DATETIME NULL COMMENT '主动退出时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_sessions_session_id` (`session_id`),
  INDEX `idx_user_sessions_user_status` (`user_id`, `status`),
  INDEX `idx_user_sessions_user_login_at` (`user_id`, `login_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户登录会话';
