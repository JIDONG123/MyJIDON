/**
 * 本地验证：node --test db/sqlMigrationExec.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeMigrationSql,
  splitSqlStatements,
  isIgnorableMigrationError,
} = require('./sqlMigrationExec');

test('normalizeMigrationSql strips CREATE INDEX IF NOT EXISTS', () => {
  const input =
    'CREATE INDEX IF NOT EXISTS `idx_gr_ai_batch` ON `grading_results` (`ai_batch_id`);';
  const out = normalizeMigrationSql(input);
  assert.ok(!/IF NOT EXISTS/i.test(out));
  assert.match(out, /CREATE INDEX `idx_gr_ai_batch`/);
});

test('normalizeMigrationSql strips ADD COLUMN IF NOT EXISTS', () => {
  const input = 'ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `avatar` VARCHAR(512) NULL;';
  const out = normalizeMigrationSql(input);
  assert.match(out, /ADD COLUMN `avatar`/);
  assert.ok(!/IF NOT EXISTS/i.test(out));
});

test('isIgnorableMigrationError accepts duplicate index 1061', () => {
  assert.equal(isIgnorableMigrationError({ errno: 1061, message: 'Duplicate key name' }), true);
  assert.equal(isIgnorableMigrationError({ errno: 1060, message: 'Duplicate column' }), true);
});

test('splitSqlStatements splits migration file', () => {
  const sql = `
    ALTER TABLE t ADD COLUMN IF NOT EXISTS c INT;
    CREATE INDEX IF NOT EXISTS idx ON t (c);
  `;
  const parts = splitSqlStatements(normalizeMigrationSql(sql));
  assert.equal(parts.length, 2);
});
