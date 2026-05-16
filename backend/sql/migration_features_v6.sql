-- 扩展功能：学号/简介/联系方式、班级公告、站内通知（存量库执行一次）

ALTER TABLE `users`
  ADD COLUMN `student_no` VARCHAR(32) NULL COMMENT '学号' AFTER `real_name`,
  ADD COLUMN `profile_bio` VARCHAR(2000) NULL COMMENT '个人简介' AFTER `avatar`,
  ADD COLUMN `contact_extra` VARCHAR(100) NULL COMMENT '其它联系方式（如微信号）' AFTER `phone`;

CREATE TABLE IF NOT EXISTS `class_announcements` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `class_id` INT NOT NULL,
  `teacher_id` INT NOT NULL COMMENT '发布教师',
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_class_id` (`class_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='班级公告';

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '接收用户',
  `type` VARCHAR(40) NOT NULL COMMENT 'task_published / grade_ai / grade_final',
  `title` VARCHAR(200) NOT NULL,
  `body` TEXT,
  `ref_type` VARCHAR(32) NULL COMMENT 'task / submission',
  `ref_id` INT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user_read` (`user_id`, `is_read`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站内通知';
