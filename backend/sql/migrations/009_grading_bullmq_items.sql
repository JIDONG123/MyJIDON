-- BullMQ item-level 调度：grading_job_items 增强字段与状态
-- 幂等；不影响 grading_results 结构

ALTER TABLE `grading_job_items`
  MODIFY COLUMN `status` ENUM(
    'pending',
    'queued',
    'running',
    'success',
    'failed',
    'skipped',
    'cancelled'
  ) NOT NULL DEFAULT 'pending';

ALTER TABLE `grading_job_items`
  ADD COLUMN IF NOT EXISTS `stage` VARCHAR(32) NULL COMMENT 'waiting|loading_context|rag_retrieving|llm_grading|saving_result|completed|failed|cancelled' AFTER `status`,
  ADD COLUMN IF NOT EXISTS `retry_count` INT NOT NULL DEFAULT 0 AFTER `attempt_count`,
  ADD COLUMN IF NOT EXISTS `error_type` VARCHAR(64) NULL AFTER `error_message`,
  ADD COLUMN IF NOT EXISTS `ai_score` DECIMAL(5, 2) NULL AFTER `grading_result_id`,
  ADD COLUMN IF NOT EXISTS `duration_ms` INT NULL AFTER `ai_score`,
  ADD COLUMN IF NOT EXISTS `llm_cost_ms` INT NULL AFTER `duration_ms`,
  ADD COLUMN IF NOT EXISTS `rag_cost_ms` INT NULL AFTER `llm_cost_ms`,
  ADD COLUMN IF NOT EXISTS `task_context_cost_ms` INT NULL AFTER `rag_cost_ms`,
  ADD COLUMN IF NOT EXISTS `save_cost_ms` INT NULL AFTER `task_context_cost_ms`,
  ADD COLUMN IF NOT EXISTS `llm_tokens` INT NULL AFTER `save_cost_ms`,
  ADD COLUMN IF NOT EXISTS `prompt_summarized` TINYINT(1) NOT NULL DEFAULT 0 AFTER `llm_tokens`,
  ADD COLUMN IF NOT EXISTS `last_error_message` VARCHAR(500) NULL AFTER `prompt_summarized`,
  ADD COLUMN IF NOT EXISTS `bullmq_job_id` VARCHAR(128) NULL AFTER `last_error_message`;

ALTER TABLE `grading_jobs`
  ADD COLUMN IF NOT EXISTS `pending_count` INT NOT NULL DEFAULT 0 AFTER `total_count`,
  ADD COLUMN IF NOT EXISTS `running_count` INT NOT NULL DEFAULT 0 AFTER `pending_count`,
  ADD COLUMN IF NOT EXISTS `skipped_count` INT NOT NULL DEFAULT 0 AFTER `failed_count`,
  ADD COLUMN IF NOT EXISTS `batch_mode` VARCHAR(32) NULL COMMENT 'new_only|include_failed|regrade_all' AFTER `scope_type`;
