-- 题库 / 习题练习 / 在线考试（v1）
-- 执行：在 backend 目录 node scripts/runQbankMigration.js
-- 依赖：users、classes 表已存在

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `qb_questions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `teacher_id` INT NOT NULL COMMENT '创建教师',
  `type` ENUM('single', 'multi', 'judge', 'fill', 'short', 'code') NOT NULL COMMENT '题型',
  `stem` TEXT NOT NULL COMMENT '题干',
  `options_json` JSON NULL COMMENT '选项 [{key,label}]',
  `answer_json` JSON NOT NULL COMMENT '结构化标准答案（客观题判分用）',
  `reference_answer` TEXT NULL COMMENT '主观题参考答案（教师/AI辅助）',
  `default_score` DECIMAL(8, 2) NOT NULL DEFAULT 5.00 COMMENT '默认分值',
  `difficulty` ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'medium',
  `course_label` VARCHAR(200) NULL COMMENT '课程/课程模块',
  `knowledge_tags` JSON NULL COMMENT '知识点标签数组',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_qb_q_teacher` (`teacher_id`),
  KEY `idx_qb_q_type` (`type`),
  KEY `idx_qb_q_deleted` (`deleted_at`),
  CONSTRAINT `fk_qb_q_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='题库题目';

CREATE TABLE IF NOT EXISTS `qb_question_usage` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `question_id` INT NOT NULL,
  `ref_type` ENUM('practice', 'exam') NOT NULL,
  `ref_id` INT NOT NULL COMMENT 'qb_practices.id 或 qb_exams.id',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_qb_qu_q` (`question_id`),
  KEY `idx_qb_qu_ref` (`ref_type`, `ref_id`),
  CONSTRAINT `fk_qb_qu_q` FOREIGN KEY (`question_id`) REFERENCES `qb_questions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='题目被引用记录';

CREATE TABLE IF NOT EXISTS `qb_practices` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `teacher_id` INT NOT NULL,
  `class_id` INT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `deadline_at` DATETIME NULL,
  `shuffle_options` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('draft', 'published', 'closed') NOT NULL DEFAULT 'published',
  `pick_rules` JSON NULL COMMENT '预留：按知识点/难度抽题规则',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_qb_pr_class` (`class_id`),
  KEY `idx_qb_pr_teacher` (`teacher_id`),
  CONSTRAINT `fk_qb_pr_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qb_pr_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='习题练习';

CREATE TABLE IF NOT EXISTS `qb_practice_questions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `practice_id` INT NOT NULL,
  `question_id` INT NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `score_override` DECIMAL(8, 2) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_practice_question` (`practice_id`, `question_id`),
  KEY `idx_qb_pq_practice` (`practice_id`),
  CONSTRAINT `fk_qb_pq_practice` FOREIGN KEY (`practice_id`) REFERENCES `qb_practices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qb_pq_question` FOREIGN KEY (`question_id`) REFERENCES `qb_questions` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='习题题目关联';

CREATE TABLE IF NOT EXISTS `qb_practice_attempts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `practice_id` INT NOT NULL,
  `student_id` INT NOT NULL,
  `answers_json` JSON NOT NULL COMMENT 'key: practice_question_id 字符串',
  `objective_score` DECIMAL(10, 2) NULL,
  `subjective_score` DECIMAL(10, 2) NULL,
  `total_score` DECIMAL(10, 2) NULL,
  `per_question_scores` JSON NULL COMMENT '教师批改主观题分项',
  `ai_suggestion` TEXT NULL COMMENT '预留：AI辅助评语',
  `status` ENUM('in_progress', 'submitted', 'graded') NOT NULL DEFAULT 'in_progress',
  `submitted_at` TIMESTAMP NULL DEFAULT NULL,
  `graded_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_practice_student` (`practice_id`, `student_id`),
  KEY `idx_qb_pa_student` (`student_id`),
  CONSTRAINT `fk_qb_pa_practice` FOREIGN KEY (`practice_id`) REFERENCES `qb_practices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qb_pa_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='习题作答';

CREATE TABLE IF NOT EXISTS `qb_exams` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `teacher_id` INT NOT NULL,
  `class_id` INT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `instructions` TEXT NULL,
  `start_at` DATETIME NOT NULL COMMENT '允许进入作答的开始时间',
  `end_at` DATETIME NOT NULL COMMENT '最晚结束时间',
  `duration_minutes` INT NOT NULL DEFAULT 90,
  `early_submit_minutes` INT NOT NULL DEFAULT 0 COMMENT '结束前至少提前多少分钟允许交卷',
  `shuffle_questions` TINYINT(1) NOT NULL DEFAULT 0,
  `shuffle_options` TINYINT(1) NOT NULL DEFAULT 0,
  `randomize` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '预留：随机组卷',
  `random_pick_rules` JSON NULL,
  `anti_tab_switch` TINYINT(1) NOT NULL DEFAULT 0,
  `tab_switch_limit` INT NOT NULL DEFAULT 3,
  `ip_allowlist` TEXT NULL COMMENT '逗号分隔，可选',
  `publish_scores_at` DATETIME NULL COMMENT '成绩公布时间，空则提交后即可查',
  `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_qb_ex_class` (`class_id`),
  KEY `idx_qb_ex_teacher` (`teacher_id`),
  KEY `idx_qb_ex_window` (`start_at`, `end_at`),
  CONSTRAINT `fk_qb_ex_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qb_ex_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='在线考试';

CREATE TABLE IF NOT EXISTS `qb_exam_questions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `exam_id` INT NOT NULL,
  `question_id` INT NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `score` DECIMAL(8, 2) NOT NULL DEFAULT 5.00,
  PRIMARY KEY (`id`),
  KEY `idx_qb_eq_exam` (`exam_id`),
  KEY `idx_qb_eq_question` (`question_id`),
  CONSTRAINT `fk_qb_eq_exam` FOREIGN KEY (`exam_id`) REFERENCES `qb_exams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qb_eq_question` FOREIGN KEY (`question_id`) REFERENCES `qb_questions` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='考试题目';

CREATE TABLE IF NOT EXISTS `qb_exam_attempts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `exam_id` INT NOT NULL,
  `student_id` INT NOT NULL,
  `started_at` DATETIME NULL,
  `attempt_expires_at` DATETIME NULL COMMENT '个人倒计时截止',
  `last_saved_at` DATETIME NULL,
  `draft_json` LONGTEXT NULL COMMENT '作答草稿 JSON',
  `submitted_at` DATETIME NULL,
  `tab_switch_count` INT NOT NULL DEFAULT 0,
  `auto_submit_reason` VARCHAR(200) NULL,
  `objective_score` DECIMAL(10, 2) NULL,
  `subjective_score` DECIMAL(10, 2) NULL,
  `total_score` DECIMAL(10, 2) NULL,
  `per_question_scores` JSON NULL,
  `rank_in_class` INT NULL COMMENT '公布后由任务回填',
  `status` ENUM('in_progress', 'submitted', 'graded') NOT NULL DEFAULT 'in_progress',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_exam_student` (`exam_id`, `student_id`),
  KEY `idx_qb_ea_student` (`student_id`),
  CONSTRAINT `fk_qb_ea_exam` FOREIGN KEY (`exam_id`) REFERENCES `qb_exams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qb_ea_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='考试作答';
