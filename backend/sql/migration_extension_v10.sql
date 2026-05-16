-- v10: 企业角色、双轨评分、查重、学情/推荐、助手会话、任务核查清单与难度等（存量库执行一次）

-- 用户角色扩展 + 禁用标记
ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('admin', 'teacher', 'student', 'enterprise') NOT NULL COMMENT '角色',
  ADD COLUMN `is_disabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '管理员禁用' AFTER `profile_bio`;

-- 企业用户可访问的班级（数据隔离）
CREATE TABLE IF NOT EXISTS `enterprise_class_access` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `enterprise_user_id` INT NOT NULL,
  `class_id` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_ent_class` (`enterprise_user_id`, `class_id`),
  INDEX `idx_class` (`class_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='企业用户-班级授权';

-- 任务：双轨权重、步骤核查清单、难度（推荐用）
ALTER TABLE `tasks`
  ADD COLUMN `campus_grade_weight` DECIMAL(5, 2) NOT NULL DEFAULT 50.00 COMMENT '校内评分权重%' AFTER `score_human_weight`,
  ADD COLUMN `enterprise_grade_weight` DECIMAL(5, 2) NOT NULL DEFAULT 50.00 COMMENT '企业评分权重%' AFTER `campus_grade_weight`,
  ADD COLUMN `step_checklist` JSON NULL COMMENT '步骤核查清单 [{id,title,required}]' AFTER `enterprise_standard`,
  ADD COLUMN `difficulty_level` ENUM('basic', 'standard', 'advanced') NOT NULL DEFAULT 'standard' COMMENT '任务难度' AFTER `step_checklist`;

-- 批改：企业导师批改 + 教师手工修正核查
ALTER TABLE `grading_results`
  ADD COLUMN `enterprise_score` DECIMAL(5, 2) NULL COMMENT '企业导师评分' AFTER `human_comment`,
  ADD COLUMN `enterprise_comment` TEXT NULL COMMENT '企业导师评语' AFTER `enterprise_score`,
  ADD COLUMN `enterprise_graded_by` INT NULL AFTER `enterprise_comment`,
  ADD COLUMN `enterprise_graded_at` TIMESTAMP NULL AFTER `enterprise_graded_by`,
  ADD COLUMN `verification_teacher_override` JSON NULL COMMENT '教师对核查项的手工修正' AFTER `verification_result`;

-- 提交：查重结果
ALTER TABLE `submissions`
  ADD COLUMN `max_similarity` DECIMAL(5, 2) NULL COMMENT '与同任务其他作业最高相似度 0-100' AFTER `revised_count`,
  ADD COLUMN `similarity_level` ENUM('none', 'low', 'warn', 'high') NOT NULL DEFAULT 'none' AFTER `max_similarity`,
  ADD COLUMN `similarity_pairs` JSON NULL COMMENT '疑似重复对照' AFTER `similarity_level`;

-- 学生 AI 助手会话
CREATE TABLE IF NOT EXISTS `assistant_sessions` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `student_id` INT NOT NULL,
  `title` VARCHAR(120) NOT NULL DEFAULT '新对话',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assistant_messages` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `session_id` INT NOT NULL,
  `role` ENUM('user', 'assistant') NOT NULL,
  `content` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_session` (`session_id`),
  CONSTRAINT `fk_asst_msg_sess` FOREIGN KEY (`session_id`) REFERENCES `assistant_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'similarity_warn_threshold', '40', '查重预警阈值（%），达到或超过标记 warn'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'similarity_warn_threshold');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'similarity_suspect_threshold', '70', '查重疑似抄袭阈值（%）'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'similarity_suspect_threshold');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'assistant_blocked_words', '', '学生助手敏感词，逗号分隔（可选）'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'assistant_blocked_words');
