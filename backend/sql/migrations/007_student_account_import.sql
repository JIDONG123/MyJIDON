-- 学生账号扩展字段 + Excel 批量导入批次/明细

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `must_change_password` TINYINT NOT NULL DEFAULT 0 COMMENT '是否必须修改初始密码' AFTER `is_disabled`,
  ADD COLUMN IF NOT EXISTS `password_changed_at` DATETIME NULL COMMENT '首次修改密码时间' AFTER `must_change_password`;

CREATE UNIQUE INDEX IF NOT EXISTS `uk_users_student_no` ON `users` (`student_no`);

CREATE TABLE IF NOT EXISTS `student_import_batches` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `batch_no` VARCHAR(64) NOT NULL COMMENT '导入批次号',
  `file_name` VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `file_path` VARCHAR(500) NULL COMMENT '上传文件保存路径',
  `file_hash` VARCHAR(128) NULL COMMENT '文件哈希',
  `uploaded_by` INT NOT NULL COMMENT '上传管理员ID',
  `total_rows` INT NOT NULL DEFAULT 0 COMMENT '总行数',
  `valid_rows` INT NOT NULL DEFAULT 0 COMMENT '预检通过行数',
  `error_rows` INT NOT NULL DEFAULT 0 COMMENT '预检错误行数',
  `imported_rows` INT NOT NULL DEFAULT 0 COMMENT '成功导入行数',
  `failed_rows` INT NOT NULL DEFAULT 0 COMMENT '导入失败行数',
  `skipped_rows` INT NOT NULL DEFAULT 0 COMMENT '跳过行数',
  `status` VARCHAR(32) NOT NULL DEFAULT 'previewed' COMMENT 'previewed/importing/completed/failed/cancelled',
  `default_password_policy` VARCHAR(100) NOT NULL DEFAULT 'student_no' COMMENT '默认密码策略',
  `error_message` TEXT NULL COMMENT '批次级错误信息',
  `previewed_at` DATETIME NULL,
  `confirmed_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_student_import_batch_no` (`batch_no`),
  INDEX `idx_student_import_uploaded_by` (`uploaded_by`),
  INDEX `idx_student_import_status` (`status`),
  INDEX `idx_student_import_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学生账号 Excel 导入批次';

CREATE TABLE IF NOT EXISTS `student_import_rows` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `batch_id` BIGINT NOT NULL COMMENT '导入批次ID',
  `row_number` INT NOT NULL COMMENT 'Excel 行号',
  `username` VARCHAR(100) NULL COMMENT '用户名',
  `real_name` VARCHAR(100) NULL COMMENT '真实姓名',
  `student_no` VARCHAR(64) NULL COMMENT '学号',
  `phone` VARCHAR(32) NULL COMMENT '电话号码',
  `email` VARCHAR(255) NULL COMMENT '邮箱',
  `class_name` VARCHAR(100) NULL COMMENT 'Excel 中填写的班级名称',
  `class_id` INT NULL COMMENT '匹配到的行政班ID',
  `password_policy` VARCHAR(100) NOT NULL DEFAULT 'student_no' COMMENT '密码策略',
  `valid` TINYINT NOT NULL DEFAULT 0 COMMENT '预检是否通过',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending/valid/error/imported/failed/skipped',
  `errors_json` JSON NULL COMMENT '错误原因',
  `created_user_id` INT NULL COMMENT '创建出的用户ID',
  `created_student_id` INT NULL COMMENT '创建出的学生档案ID，如有',
  `imported_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_student_import_batch_row` (`batch_id`, `row_number`),
  INDEX `idx_student_import_rows_batch` (`batch_id`),
  INDEX `idx_student_import_rows_username` (`username`),
  INDEX `idx_student_import_rows_student_no` (`student_no`),
  INDEX `idx_student_import_rows_status` (`status`),
  CONSTRAINT `fk_student_import_rows_batch` FOREIGN KEY (`batch_id`) REFERENCES `student_import_batches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学生账号 Excel 导入明细';
