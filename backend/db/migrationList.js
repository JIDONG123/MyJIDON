/**
 * 发现迁移文件：优先按既定顺序（兼容存量库升级），其余 migration_*.sql 按文件名追加
 */
const fs = require('fs');
const path = require('path');

const SQL_DIR = path.join(__dirname, '..', 'sql');

/** 迁移依赖顺序（与 backend/db/bootstrap.js 自动迁移一致） */
const PREFERRED_ORDER = [
  'migration_user_avatar.sql',
  'migration_teacher_class_isolation.sql',
  'migration_scenario_coop.sql',
  'migration_task_score_weights.sql',
  'migration_competition.sql',
  'migration_task_max_submissions.sql',
  'migration_class_recommendation_rules.sql',
  'migration_rag_kb.sql',
  'migration_qbank_exam_v1.sql',
  'migration_qbank_exam_v2.sql',
  'migration_extension_v10.sql',
  'migration_features_v6.sql',
  'migrations/001_grading_async_redis.sql',
  'migrations/002_submission_zip_extract.sql',
  'migrations/003_grading_jobs.sql',
  'migrations/004_code_runner_online_practice.sql',
  'migrations/005_online_practice_ai_review.sql',
  'migrations/006_export_logs.sql',
  'migrations/007_student_account_import.sql',
  'migrations/008_teacher_account_import.sql',
  'migrations/009_grading_bullmq_items.sql',
  'migrations/010_content_safety.sql',
  'migrations/011_submission_multi_attach.sql',
  'migrations/012_submission_feedback_resubmit.sql',
  'migrations/013_user_sessions.sql',
  'migration_unify_password.sql',
  'migration_vl_recognition.sql',
  'migration_kg_sync.sql',
  'migration_password_plain.sql',
  'migration_curriculum_teaching_v1.sql',
];

function discoverSqlFiles() {
  const found = new Set();

  if (fs.existsSync(SQL_DIR)) {
    for (const ent of fs.readdirSync(SQL_DIR)) {
      if (ent.startsWith('migration_') && ent.endsWith('.sql')) {
        found.add(ent);
      }
    }
    const sub = path.join(SQL_DIR, 'migrations');
    if (fs.existsSync(sub)) {
      for (const ent of fs.readdirSync(sub)) {
        if (ent.endsWith('.sql')) {
          found.add(`migrations/${ent}`);
        }
      }
    }
  }

  return found;
}

function getMigrationPaths() {
  const found = discoverSqlFiles();
  const ordered = [];
  const seen = new Set();

  for (const name of PREFERRED_ORDER) {
    if (found.has(name)) {
      ordered.push({
        name,
        path: path.join(SQL_DIR, name),
      });
      seen.add(name);
    }
  }

  const rest = [...found].filter((n) => !seen.has(n)).sort();
  for (const name of rest) {
    ordered.push({
      name,
      path: path.join(SQL_DIR, name),
    });
  }

  return ordered;
}

module.exports = { getMigrationPaths, PREFERRED_ORDER, SQL_DIR };
