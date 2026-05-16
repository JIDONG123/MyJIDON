-- 异步 AI 批改：扩展状态枚举 + 批次字段（在已有数据库上执行；若列或索引已存在会报错，可忽略对应语句）
ALTER TABLE `grading_results`
  MODIFY COLUMN `status` ENUM(
    'pending',
    'ai_grading',
    'ai_failed',
    'ai_graded',
    'human_graded'
  ) DEFAULT 'pending' COMMENT '状态：待批改/AI批改中/批改失败/AI已批改/人工已复核';

ALTER TABLE `grading_results`
  ADD COLUMN `ai_batch_id` BIGINT NULL COMMENT '异步批量批改批次ID' AFTER `status`;

-- 若索引已存在可跳过
CREATE INDEX `idx_gr_ai_batch` ON `grading_results` (`ai_batch_id`);
