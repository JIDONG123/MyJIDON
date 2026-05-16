require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    await c.query(`
      ALTER TABLE submissions
      ADD COLUMN archive_extracted_text LONGTEXT NULL COMMENT 'ZIP 解压合并后的结构化文本（供 AI 优先使用）' AFTER content
    `);
    console.log('[migration] archive_extracted_text added');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('[migration] archive_extracted_text exists, skip');
    } else {
      throw e;
    }
  }

  try {
    await c.query(`
      ALTER TABLE submissions
      ADD COLUMN archive_extracted_file_count INT NULL COMMENT 'ZIP 内成功解析的文本文件数量' AFTER archive_extracted_text
    `);
    console.log('[migration] archive_extracted_file_count added');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('[migration] archive_extracted_file_count exists, skip');
    } else {
      throw e;
    }
  }

  await c.end();
  console.log('[migration] zip columns done');
}

main().catch((e) => {
  console.error('[migration] failed:', e.message);
  process.exit(1);
});
