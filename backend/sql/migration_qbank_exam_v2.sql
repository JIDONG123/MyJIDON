-- 题库考试 v2：成绩密文字段、考试 AI 建议、练习成绩公布与密文、练习 AI 建议

SET NAMES utf8mb4;

ALTER TABLE `qb_exam_attempts`
  ADD COLUMN `score_bundle_cipher` TEXT NULL COMMENT 'AES-GCM 密封成绩包（公布前）' AFTER `per_question_scores`,
  ADD COLUMN `ai_suggestion` LONGTEXT NULL COMMENT '主观题 AI 辅助建议 JSON' AFTER `score_bundle_cipher`;

ALTER TABLE `qb_practice_attempts`
  ADD COLUMN `score_bundle_cipher` TEXT NULL COMMENT 'AES-GCM 密封成绩包（公布前）' AFTER `per_question_scores`;

ALTER TABLE `qb_practices`
  ADD COLUMN `publish_scores_at` DATETIME NULL COMMENT '成绩公布时间，空则提交后即可查' AFTER `deadline_at`;
