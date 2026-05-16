require('dotenv').config();
const mysql = require('mysql2/promise');
const path = require('path');

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await c.query(`
    ALTER TABLE grading_results
    MODIFY COLUMN status ENUM(
      'pending',
      'ai_grading',
      'ai_failed',
      'ai_graded',
      'human_graded'
    ) DEFAULT 'pending' COMMENT '状态：待批改/AI批改中/批改失败/AI已批改/人工已复核'
  `);
  console.log('[migration] status enum updated');

  try {
    await c.query(`
      ALTER TABLE grading_results
      ADD COLUMN ai_batch_id BIGINT NULL COMMENT '异步批量批改批次ID' AFTER status
    `);
    console.log('[migration] ai_batch_id column added');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('[migration] ai_batch_id already exists, skip');
    } else {
      throw e;
    }
  }

  try {
    await c.query('CREATE INDEX idx_gr_ai_batch ON grading_results (ai_batch_id)');
    console.log('[migration] index idx_gr_ai_batch created');
  } catch (e) {
    if (e.code === 'ER_DUP_KEYNAME') {
      console.log('[migration] index idx_gr_ai_batch already exists, skip');
    } else {
      throw e;
    }
  }

  await c.end();
  console.log('[migration] done');
}

main().catch((e) => {
  console.error('[migration] failed:', e.message);
  process.exit(1);
});
