-- 课程-教学班-实训模板体系（Phase 1，幂等）
-- 旧 tasks.class_id 链路保留；新任务使用 teaching_class_id

CREATE TABLE IF NOT EXISTS `majors` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `code` VARCHAR(32) NOT NULL COMMENT '专业代码',
  `name` VARCHAR(100) NOT NULL COMMENT '专业名称',
  `college` VARCHAR(100) NULL COMMENT '所属学院',
  `description` TEXT NULL,
  `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_major_code` (`code`),
  INDEX `idx_major_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='专业';

CREATE TABLE IF NOT EXISTS `terms` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL COMMENT '学期名称，如 2025-2026-1',
  `year` INT NOT NULL COMMENT '学年',
  `season` ENUM('spring', 'autumn', 'summer', 'winter') NOT NULL DEFAULT 'autumn',
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `is_current` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_term_name` (`name`),
  INDEX `idx_term_current` (`is_current`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学期';

CREATE TABLE IF NOT EXISTS `courses` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `course_code` VARCHAR(32) NOT NULL COMMENT '课程代码',
  `course_name` VARCHAR(120) NOT NULL COMMENT '课程名称',
  `major_id` INT NULL,
  `course_type` VARCHAR(32) NULL COMMENT '必修/选修/实训等',
  `course_goal` TEXT NULL COMMENT '课程目标',
  `ability_goals` TEXT NULL COMMENT '能力目标',
  `leader_id` INT NULL COMMENT '课程负责人（教师）',
  `status` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_course_code` (`course_code`),
  INDEX `idx_course_major` (`major_id`),
  INDEX `idx_course_leader` (`leader_id`),
  CONSTRAINT `fk_course_major` FOREIGN KEY (`major_id`) REFERENCES `majors` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_course_leader` FOREIGN KEY (`leader_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课程';

CREATE TABLE IF NOT EXISTS `teaching_classes` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `course_id` INT NOT NULL,
  `term_id` INT NOT NULL,
  `class_code` VARCHAR(32) NOT NULL COMMENT '教学班代码',
  `class_name` VARCHAR(120) NOT NULL COMMENT '教学班名称',
  `location` VARCHAR(120) NULL COMMENT '默认上课地点',
  `status` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_tc_code_term` (`class_code`, `term_id`),
  INDEX `idx_tc_course` (`course_id`),
  INDEX `idx_tc_term` (`term_id`),
  CONSTRAINT `fk_tc_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tc_term` FOREIGN KEY (`term_id`) REFERENCES `terms` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='教学班';

CREATE TABLE IF NOT EXISTS `teaching_class_teachers` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `teaching_class_id` INT NOT NULL,
  `teacher_id` INT NOT NULL,
  `role` ENUM('lead', 'assistant') NOT NULL DEFAULT 'lead' COMMENT '主讲/协同',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_tc_teacher` (`teaching_class_id`, `teacher_id`),
  INDEX `idx_tct_teacher` (`teacher_id`),
  CONSTRAINT `fk_tct_tc` FOREIGN KEY (`teaching_class_id`) REFERENCES `teaching_classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tct_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='教学班教师';

CREATE TABLE IF NOT EXISTS `teaching_class_students` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `teaching_class_id` INT NOT NULL,
  `student_id` INT NOT NULL,
  `source_class_id` INT NULL COMMENT '来源行政班（可选，仅记录）',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_tc_student` (`teaching_class_id`, `student_id`),
  INDEX `idx_tcs_student` (`student_id`),
  INDEX `idx_tcs_source_class` (`source_class_id`),
  CONSTRAINT `fk_tcs_tc` FOREIGN KEY (`teaching_class_id`) REFERENCES `teaching_classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tcs_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tcs_source_class` FOREIGN KEY (`source_class_id`) REFERENCES `classes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='教学班学生';

CREATE TABLE IF NOT EXISTS `training_project_templates` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `course_id` INT NOT NULL,
  `created_by` INT NOT NULL,
  `project_name` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `requirements` TEXT NULL,
  `evaluation_metrics` JSON NULL,
  `enterprise_standard` TEXT NULL,
  `suggested_materials` TEXT NULL COMMENT '建议提交材料',
  `status` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_tpl_course` (`course_id`),
  INDEX `idx_tpl_creator` (`created_by`),
  CONSTRAINT `fk_tpl_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tpl_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实训项目模板';

CREATE TABLE IF NOT EXISTS `course_schedules` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `teaching_class_id` INT NOT NULL,
  `week_no` INT NOT NULL COMMENT '周次',
  `weekday` TINYINT NOT NULL COMMENT '1-7 周一到周日',
  `period_start` TINYINT NULL COMMENT '开始节次',
  `period_end` TINYINT NULL COMMENT '结束节次',
  `location` VARCHAR(120) NULL,
  `title` VARCHAR(200) NULL COMMENT '安排标题',
  `task_id` INT NULL COMMENT '关联实训任务',
  `remark` VARCHAR(500) NULL,
  `created_by` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_cs_tc_week` (`teaching_class_id`, `week_no`),
  INDEX `idx_cs_task` (`task_id`),
  CONSTRAINT `fk_cs_tc` FOREIGN KEY (`teaching_class_id`) REFERENCES `teaching_classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cs_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实训日历/轻量课表';

CREATE TABLE IF NOT EXISTS `enterprise_teaching_class_access` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `enterprise_user_id` INT NOT NULL,
  `teaching_class_id` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_ent_tc` (`enterprise_user_id`, `teaching_class_id`),
  INDEX `idx_etca_tc` (`teaching_class_id`),
  CONSTRAINT `fk_etca_ent` FOREIGN KEY (`enterprise_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_etca_tc` FOREIGN KEY (`teaching_class_id`) REFERENCES `teaching_classes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='企业导师-教学班授权';

ALTER TABLE `tasks`
  ADD COLUMN IF NOT EXISTS `course_id` INT NULL COMMENT '课程ID' AFTER `class_id`,
  ADD COLUMN IF NOT EXISTS `teaching_class_id` INT NULL COMMENT '教学班ID' AFTER `course_id`,
  ADD COLUMN IF NOT EXISTS `project_template_id` INT NULL COMMENT '来源项目模板' AFTER `teaching_class_id`,
  ADD COLUMN IF NOT EXISTS `week_no` INT NULL COMMENT '周次' AFTER `project_template_id`,
  ADD COLUMN IF NOT EXISTS `schedule_id` INT NULL COMMENT '课表安排ID' AFTER `week_no`;

CREATE INDEX IF NOT EXISTS `idx_tasks_course_id` ON `tasks` (`course_id`);
CREATE INDEX IF NOT EXISTS `idx_tasks_teaching_class_id` ON `tasks` (`teaching_class_id`);
CREATE INDEX IF NOT EXISTS `idx_tasks_project_template_id` ON `tasks` (`project_template_id`);
