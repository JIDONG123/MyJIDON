-- 学生作业反馈与教师退回重交

CREATE TABLE IF NOT EXISTS submission_feedbacks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  submission_id INT NOT NULL,
  student_id INT NOT NULL,
  teacher_id INT NULL COMMENT '指定处理教师，可为空',
  feedback_type VARCHAR(32) NOT NULL,
  content TEXT NOT NULL,
  wants_resubmit TINYINT(1) NOT NULL DEFAULT 0,
  contact_note VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reply_content TEXT NULL,
  reject_reason TEXT NULL,
  handled_by INT NULL,
  handled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sf_submission (submission_id),
  INDEX idx_sf_student (student_id),
  INDEX idx_sf_task (task_id),
  INDEX idx_sf_status (status),
  CONSTRAINT fk_sf_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_sf_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sf_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS submission_resubmit_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  student_id INT NOT NULL,
  submission_id INT NOT NULL,
  feedback_id INT NULL,
  granted_by INT NOT NULL,
  reason TEXT NOT NULL,
  extra_attempts INT NOT NULL DEFAULT 1,
  used_attempts INT NOT NULL DEFAULT 0,
  expire_at DATETIME NULL,
  keep_history TINYINT(1) NOT NULL DEFAULT 1,
  remark VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_srp_task_student (task_id, student_id),
  INDEX idx_srp_submission (submission_id),
  INDEX idx_srp_status (status),
  CONSTRAINT fk_srp_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_srp_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_srp_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS submission_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  task_id INT NOT NULL,
  student_id INT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  file_path VARCHAR(512) NULL,
  file_name VARCHAR(255) NULL,
  submission_text MEDIUMTEXT NULL,
  code_content MEDIUMTEXT NULL,
  code_language VARCHAR(32) NULL,
  content MEDIUMTEXT NULL,
  grading_snapshot JSON NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_reason VARCHAR(64) NULL,
  INDEX idx_sh_submission (submission_id),
  CONSTRAINT fk_sh_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS resubmit_status VARCHAR(20) NOT NULL DEFAULT 'normal' COMMENT 'normal|returned|resubmitted',
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
