-- 竞赛版增量迁移（幂等）
ALTER TABLE `tasks`
  ADD COLUMN IF NOT EXISTS `evaluation_metrics` JSON NULL COMMENT '自定义评价维度 [{name,weight,maxScore}]' AFTER `scoring_criteria`;

ALTER TABLE `grading_results`
  ADD COLUMN IF NOT EXISTS `verification_result` JSON NULL COMMENT '智能核查结果' AFTER `ai_suggestions`,
  ADD COLUMN IF NOT EXISTS `final_score` DECIMAL(5, 2) NULL COMMENT '最终综合得分' AFTER `verification_result`;

INSERT INTO
    `system_config` (`config_key`, `config_value`, `description`)
VALUES (
        'llm_api_base',
        '',
        '大模型 API Base（OpenAI 兼容）'
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
        '综合得分 AI 权重'
    ),
    (
        'score_human_weight',
        '0.6',
        '综合得分教师权重'
    ) ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
