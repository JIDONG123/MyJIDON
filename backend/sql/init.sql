-- 智能实训作业批改管理系统 - 数据库初始化脚本
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS `smart_grading_system` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `smart_grading_system`;

-- 用户表
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '用户ID',
    `username` VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    `password` VARCHAR(255) NOT NULL COMMENT '密码（加密）',
    `real_name` VARCHAR(50) NOT NULL COMMENT '真实姓名',
    `student_no` VARCHAR(32) NULL COMMENT '学号',
    `role` ENUM('admin', 'teacher', 'student', 'enterprise') NOT NULL COMMENT '角色：管理员/教师/学生/企业导师',
    `email` VARCHAR(100) UNIQUE COMMENT '邮箱',
    `phone` VARCHAR(20) COMMENT '手机号',
    `contact_extra` VARCHAR(100) NULL COMMENT '其它联系方式',
    `class_id` INT COMMENT '班级ID（学生）',
    `department` VARCHAR(100) COMMENT '部门/学院',
    `avatar` VARCHAR(512) NULL COMMENT '头像相对路径（uploads 下，如 avatars/xxx.jpg）',
    `profile_bio` VARCHAR(2000) NULL COMMENT '个人简介',
    `is_disabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '管理员禁用',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX `idx_role` (`role`),
    INDEX `idx_class_id` (`class_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '用户表';

-- 班级表
CREATE TABLE IF NOT EXISTS `classes` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '班级ID',
    `class_name` VARCHAR(100) NOT NULL UNIQUE COMMENT '班级名称',
    `major` VARCHAR(100) COMMENT '专业',
    `grade` VARCHAR(20) COMMENT '年级',
    `teacher_id` INT COMMENT '班主任/指导教师ID',
    `rec_basic_below` DECIMAL(5, 2) NOT NULL DEFAULT 62.00 COMMENT '分层推荐：历史均分低于该值→巩固型(基础任务)',
    `rec_advanced_above` DECIMAL(5, 2) NOT NULL DEFAULT 86.00 COMMENT '分层推荐：均分≥该值且无显著维度薄弱→挑战型(进阶任务)',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX `idx_teacher_id` (`teacher_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '班级表';

-- 实训任务表
CREATE TABLE IF NOT EXISTS `tasks` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '任务ID',
    `title` VARCHAR(200) NOT NULL COMMENT '任务标题',
    `description` TEXT COMMENT '任务描述',
    `requirements` TEXT COMMENT '任务要求',
    `scoring_criteria` TEXT COMMENT '评分标准',
    `scenario_type` ENUM('teaching', 'enterprise_collab', 'mixed') NOT NULL DEFAULT 'mixed' COMMENT '任务场景',
    `enterprise_standard` TEXT COMMENT '企业/岗位能力标准（校企合作）',
    `evaluation_metrics` JSON COMMENT '自定义评价维度 [{name,weight,maxScore}]',
    `deadline` DATETIME NOT NULL COMMENT '截止时间',
    `class_id` INT COMMENT '班级ID（任务仅对该班学生可见；发布时必选）',
    `is_public` TINYINT(1) DEFAULT 0 COMMENT '保留字段，学生端一律按 class_id 隔离',
    `max_score` INT DEFAULT 100 COMMENT '满分',
    `max_submissions` INT NOT NULL DEFAULT 1 COMMENT '学生最大可提交次数（每次成功提交计 1 次）',
    `score_ai_weight` DECIMAL(5, 4) NULL COMMENT '综合分 AI 权重（空则使用系统设置）',
    `score_human_weight` DECIMAL(5, 4) NULL COMMENT '综合分教师权重（空则使用系统设置）',
    `campus_grade_weight` DECIMAL(5, 2) NOT NULL DEFAULT 50.00 COMMENT '校内评分权重%',
    `enterprise_grade_weight` DECIMAL(5, 2) NOT NULL DEFAULT 50.00 COMMENT '企业评分权重%',
    `step_checklist` JSON NULL COMMENT '步骤核查清单',
    `difficulty_level` ENUM('basic', 'standard', 'advanced') NOT NULL DEFAULT 'standard' COMMENT '任务难度',
    `created_by` INT NOT NULL COMMENT '创建者ID',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX `idx_class_id` (`class_id`),
    INDEX `idx_created_by` (`created_by`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '实训任务表';

-- 作业提交表
CREATE TABLE IF NOT EXISTS `submissions` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '提交ID',
    `task_id` INT NOT NULL COMMENT '任务ID',
    `student_id` INT NOT NULL COMMENT '学生ID',
    `file_path` VARCHAR(500) COMMENT '提交文件路径',
    `file_name` VARCHAR(200) COMMENT '文件名',
    `file_type` VARCHAR(50) COMMENT '文件类型',
    `content` TEXT COMMENT '提交内容（文本形式）',
    `archive_extracted_text` LONGTEXT NULL COMMENT 'ZIP 解压合并后的结构化文本（供 AI 优先使用）',
    `archive_extracted_file_count` INT NULL COMMENT 'ZIP 内成功解析的文本文件数量',
    `vl_recognition_status` VARCHAR(20) NULL COMMENT 'skipped|done|failed',
    `vl_recognition_text` LONGTEXT NULL COMMENT 'VL 识别规整文本',
    `vl_recognition_meta` JSON NULL COMMENT 'VL 结构化 JSON',
    `vl_recognition_error` VARCHAR(500) NULL COMMENT 'VL 识别失败原因',
    `vl_recognition_at` DATETIME NULL COMMENT 'VL 识别完成时间',
    `submitted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
    `is_revised` TINYINT(1) DEFAULT 0 COMMENT '是否修改重交',
    `revised_count` INT DEFAULT 0 COMMENT '修改次数',
    `max_similarity` DECIMAL(5, 2) NULL COMMENT '与同任务其他作业最高相似度 0-100',
    `similarity_level` ENUM('none', 'low', 'warn', 'high') NOT NULL DEFAULT 'none' COMMENT '查重等级',
    `similarity_pairs` JSON NULL COMMENT '疑似重复对照',
    INDEX `idx_task_id` (`task_id`),
    INDEX `idx_student_id` (`student_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '作业提交表';

-- 批改结果表
CREATE TABLE IF NOT EXISTS `grading_results` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '批改结果ID',
    `submission_id` INT NOT NULL UNIQUE COMMENT '提交ID',
    `total_score` DECIMAL(5, 2) COMMENT '总分',
    `dimension_scores` JSON COMMENT '维度得分（JSON）',
    `ai_comment` TEXT COMMENT 'AI评语',
    `ai_problems` TEXT COMMENT '问题分析',
    `ai_suggestions` TEXT COMMENT '改进建议',
    `verification_result` JSON COMMENT '智能核查：逻辑漏洞、步骤完整性、与要求对比等',
    `verification_teacher_override` JSON NULL COMMENT '教师对核查项的手工修正',
    `final_score` DECIMAL(5, 2) COMMENT '最终综合得分（AI与教师加权）',
    `human_score` DECIMAL(5, 2) COMMENT '人工复核分数',
    `human_comment` TEXT COMMENT '人工评语',
    `enterprise_score` DECIMAL(5, 2) NULL COMMENT '企业导师评分',
    `enterprise_comment` TEXT NULL COMMENT '企业导师评语',
    `enterprise_graded_by` INT NULL COMMENT '企业导师用户ID',
    `enterprise_graded_at` TIMESTAMP NULL COMMENT '企业导师批改时间',
    `graded_by` INT COMMENT '批改教师ID',
    `graded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '批改时间',
    `status` ENUM(
        'pending',
        'ai_grading',
        'ai_failed',
        'ai_graded',
        'human_graded'
    ) DEFAULT 'pending' COMMENT '状态：待批改/AI批改中/批改失败/AI已批改/人工已复核',
    `ai_batch_id` BIGINT NULL COMMENT '异步批量批改批次ID',
    INDEX `idx_submission_id` (`submission_id`),
    INDEX `idx_gr_ai_batch` (`ai_batch_id`),
    INDEX `idx_graded_by` (`graded_by`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '批改结果表';

-- 班级公告
CREATE TABLE IF NOT EXISTS `class_announcements` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `class_id` INT NOT NULL,
    `teacher_id` INT NOT NULL COMMENT '发布教师',
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_class_id` (`class_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '班级公告';

-- 站内通知
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
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '站内通知';

-- 实训知识库（教师私有 RAG）
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
    INDEX `idx_kb_teacher` (`teacher_id`),
    INDEX `idx_kb_status` (`status`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '实训知识库文档';

CREATE TABLE IF NOT EXISTS `kb_chunks` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `document_id` INT NOT NULL,
    `teacher_id` INT NOT NULL,
    `chunk_index` INT NOT NULL,
    `content` TEXT NOT NULL,
    `embedding` JSON NULL COMMENT 'Qwen text-embedding-v4 向量',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_kb_chunk_teacher` (`teacher_id`),
    INDEX `idx_kb_chunk_doc` (`document_id`),
    CONSTRAINT `fk_kb_chunk_doc` FOREIGN KEY (`document_id`) REFERENCES `kb_documents` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '知识库文本块';

-- 企业导师可访问的班级
CREATE TABLE IF NOT EXISTS `enterprise_class_access` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `enterprise_user_id` INT NOT NULL,
    `class_id` INT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_ent_class` (`enterprise_user_id`, `class_id`),
    INDEX `idx_class` (`class_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '企业用户-班级授权';

-- 学生 AI 助手会话
CREATE TABLE IF NOT EXISTS `assistant_sessions` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `student_id` INT NOT NULL,
    `title` VARCHAR(120) NOT NULL DEFAULT '新对话',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_student` (`student_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '学生助手会话';

CREATE TABLE IF NOT EXISTS `assistant_messages` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `session_id` INT NOT NULL,
    `role` ENUM('user', 'assistant') NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_session` (`session_id`),
    CONSTRAINT `fk_asst_msg_sess` FOREIGN KEY (`session_id`) REFERENCES `assistant_sessions` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '学生助手消息';

-- 系统配置表
CREATE TABLE IF NOT EXISTS `system_config` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '配置ID',
    `config_key` VARCHAR(100) NOT NULL UNIQUE COMMENT '配置键',
    `config_value` TEXT COMMENT '配置值',
    `description` VARCHAR(500) COMMENT '配置描述',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '系统配置表';

-- 统一 bcryptjs 密码哈希（与生产一致）：admin/admin123；教师、学生/123456
-- 哈希由 bcryptjs 生成，勿混用原生 bcrypt 库
INSERT IGNORE INTO
    `users` (
        `username`,
        `password`,
        `real_name`,
        `role`,
        `email`
    )
VALUES (
        'admin',
        '$2a$10$Z9fxLg22Vv//etmNbIllruT6WT0NtsIZTyi7iXD.ezYbDqIOZM0GG',
        '系统管理员',
        'admin',
        'admin@example.com'
    );

-- 初始化测试数据
INSERT INTO
    `classes` (
        `class_name`,
        `major`,
        `grade`,
        `teacher_id`
    )
VALUES ('软件2101班', '软件工程', '2021', 2),
    ('软件2102班', '软件工程', '2021', 2),
    ('网络2101班', '网络工程', '2021', 3);

INSERT INTO
    `users` (
        `username`,
        `password`,
        `real_name`,
        `role`,
        `email`,
        `department`
    )
VALUES (
        'teacher1',
        '$2a$10$yCilYCYozCmBP5ykHfbJleRUtIWd5BrQ42E0bXtK1y7oVsoysKSW2',
        '张老师',
        'teacher',
        'zhang@example.com',
        '计算机学院'
    ),
    (
        'teacher2',
        '$2a$10$yCilYCYozCmBP5ykHfbJleRUtIWd5BrQ42E0bXtK1y7oVsoysKSW2',
        '李老师',
        'teacher',
        'li@example.com',
        '计算机学院'
    );

INSERT INTO
    `users` (
        `username`,
        `password`,
        `real_name`,
        `role`,
        `email`,
        `class_id`
    )
VALUES (
        'student1',
        '$2a$10$yCilYCYozCmBP5ykHfbJleRUtIWd5BrQ42E0bXtK1y7oVsoysKSW2',
        '王小明',
        'student',
        'wang@example.com',
        1
    ),
    (
        'student2',
        '$2a$10$yCilYCYozCmBP5ykHfbJleRUtIWd5BrQ42E0bXtK1y7oVsoysKSW2',
        '李小红',
        'student',
        'lihong@example.com',
        1
    ),
    (
        'student3',
        '$2a$10$yCilYCYozCmBP5ykHfbJleRUtIWd5BrQ42E0bXtK1y7oVsoysKSW2',
        '张伟',
        'student',
        'zhangwei@example.com',
        2
    ),
    (
        'student4',
        '$2a$10$yCilYCYozCmBP5ykHfbJleRUtIWd5BrQ42E0bXtK1y7oVsoysKSW2',
        '刘芳',
        'student',
        'liufang@example.com',
        2
    ),
    (
        'student5',
        '$2a$10$yCilYCYozCmBP5ykHfbJleRUtIWd5BrQ42E0bXtK1y7oVsoysKSW2',
        '陈明',
        'student',
        'chenming@example.com',
        3
    );

INSERT INTO
    `tasks` (
        `title`,
        `description`,
        `requirements`,
        `scoring_criteria`,
        `deadline`,
        `class_id`,
        `is_public`,
        `max_score`,
        `created_by`
    )
VALUES (
        'Python基础实训',
        '完成Python基础语法练习和小型项目开发',
        '1. 掌握Python基本语法\n2. 完成一个简单的学生管理系统\n3. 使用面向对象思想',
        '代码规范性：30分\n功能完整性：40分\n创新性：20分\n文档：10分',
        '2024-12-31 23:59:59',
        1,
        0,
        100,
        2
    ),
    (
        'Web前端开发实训',
        '使用Vue3开发一个响应式网站',
        '1. 使用Vue3 + Vite\n2. 实现至少3个页面\n3. 响应式设计',
        '页面美观度：25分\n功能完整性：35分\n代码质量：25分\n用户体验：15分',
        '2024-12-25 23:59:59',
        1,
        0,
        100,
        2
    ),
    (
        '数据库设计实训',
        '设计并实现一个图书管理系统数据库',
        '1. 设计ER图\n2. 创建数据库表\n3. 编写查询语句',
        '设计合理性：30分\n表结构完整性：35分\n查询效率：20分\n文档：15分',
        '2024-12-20 23:59:59',
        2,
        0,
        100,
        3
    );

-- 系统默认配置（大模型与综合分权重，可在管理端修改）
INSERT INTO
    `system_config` (`config_key`, `config_value`, `description`)
VALUES (
        'llm_api_base',
        '',
        '大模型 API Base（OpenAI 兼容），不含路径，如 https://api.deepseek.com'
    ),
    (
        'llm_api_key',
        '',
        '大模型 API Key'
    ),
    (
        'llm_model',
        'deepseek-chat',
        '模型名称'
    ),
    (
        'score_ai_weight',
        '0.4',
        '综合得分中 AI 分权重 0~1'
    ),
    (
        'score_human_weight',
        '0.6',
        '综合得分中教师分权重 0~1'
    ),
    (
        'embedding_api_base',
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
        '向量 API Base（OpenAI 兼容，默认 DashScope）'
    ),
    (
        'embedding_api_key',
        '',
        'DashScope / 通义 API Key（text-embedding-v4）'
    ),
    (
        'embedding_model',
        'text-embedding-v4',
        '向量模型名'
    ),
    (
        'similarity_warn_threshold',
        '40',
        '查重预警阈值（%）'
    ),
    (
        'similarity_suspect_threshold',
        '70',
        '查重疑似抄袭阈值（%）'
    ),
    (
        'assistant_blocked_words',
        '',
        '学生助手敏感词，逗号分隔（可选）'
    );