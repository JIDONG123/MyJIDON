-- 题库考试 / 习题练习支持教学班发布
-- 执行：在 backend 目录 node scripts/runQbankMigrationV3.js

SET NAMES utf8mb4;

ALTER TABLE `qb_exams`
  ADD COLUMN `teaching_class_id` INT NULL COMMENT '教学班 ID' AFTER `class_id`,
  MODIFY COLUMN `class_id` INT NULL COMMENT '行政班 ID';

ALTER TABLE `qb_exams`
  ADD KEY `idx_qb_ex_tc` (`teaching_class_id`),
  ADD CONSTRAINT `fk_qb_ex_tc` FOREIGN KEY (`teaching_class_id`) REFERENCES `teaching_classes` (`id`) ON DELETE CASCADE;

ALTER TABLE `qb_practices`
  ADD COLUMN `teaching_class_id` INT NULL COMMENT '教学班 ID' AFTER `class_id`,
  MODIFY COLUMN `class_id` INT NULL COMMENT '行政班 ID';

ALTER TABLE `qb_practices`
  ADD KEY `idx_qb_pr_tc` (`teaching_class_id`),
  ADD CONSTRAINT `fk_qb_pr_tc` FOREIGN KEY (`teaching_class_id`) REFERENCES `teaching_classes` (`id`) ON DELETE CASCADE;
