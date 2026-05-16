/**
 * 执行 sql/migration_scenario_coop.sql（校企场景字段）
 * 用法：在 backend 目录下 node scripts/run-migration-scenario.js
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

async function main() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'migration_scenario_coop.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  })

  await conn.query(sql)
  console.log('已执行:', sqlPath)

  const [cols] = await conn.query(
    "SHOW COLUMNS FROM tasks WHERE Field IN ('scenario_type', 'enterprise_standard')"
  )
  console.log('校验 tasks 表新列:')
  for (const c of cols) {
    console.log(`  - ${c.Field}: ${c.Type}`)
  }

  await conn.end()
  console.log('完成。')
}

main().catch((e) => {
  console.error('迁移失败:', e.message)
  process.exit(1)
})
