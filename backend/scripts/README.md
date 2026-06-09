# Backend Scripts 目录说明

脚本按用途分类。**默认 SAFE MODE**：不写入业务数据、不调用 LLM、不入 BullMQ。

## 安全开关（全局）

| 变量 | 含义 |
|------|------|
| `SCRIPT_ALLOW_MUTATION=1` | 允许写库（seed、smoke 清理、staging 补测等） |
| `SCRIPT_LIVE_AI=1` | 允许真实 AI 批改 / LLM（须同时 `SCRIPT_ALLOW_MUTATION=1`） |
| `ASSISTANT_SMOKE_LIVE=1` | 同 `SCRIPT_LIVE_AI`，专用于 `smoke:assistant-api` |
| `SCRIPT_CONFIRM_PRODUCTION=YES` | 非 dev/test 库名时的人工确认 |
| `REGRESSION_LIVE_AI=1` + `REGRESSION_ALLOW_MUTATION=1` | 批改回归 LIVE 模式（见 `regression-grading-phase4.js`） |

**不要在演示库/生产库默认执行写库脚本。**

## A 类 — 必须保留（工程化 / 回归 / 部署）

| 脚本 | npm 命令 | 说明 |
|------|----------|------|
| `regression-grading-phase4.js` | `regression:grading` | 批改回归，**默认 SAFE**（dryRun） |
| `regression-grading-live.js` | `regression:grading:live` | 批改回归 LIVE（显式开启） |
| `regression-teacher-permissions.js` | `regression:teacher-permissions` | 教师权限 HTTP 回归 |
| `staging-env-check.js` | `staging:env-check` | 部署前连通性只读检查 |
| `run-cluster.cjs` | `start:cluster` | 集群模式入口 |
| `../db/runMigrations.js` | （bootstrap 自动） | 数据库迁移 |

单元测试见 `package.json` 中 `test:*`（不经过本目录）。

## B 类 — 开发辅助（可保留，需显式 mutation）

| 脚本 | npm 命令 | 风险 | 开启方式 |
|------|----------|------|----------|
| `seed-test-data.js` | `seed:test` | 写入测试前缀数据 | `npm run seed:test:apply` |
| `assistant-api-smoke-test.js` | `smoke:assistant-api` | 默认 SAFE（无 LLM）；LIVE 写会话+调模型 | `SCRIPT_LIVE_AI=1 npm run smoke:assistant-api` |
| 其它 `*-smoke-test.js` | `smoke:*` | 可能 DELETE 测试行 / 调 API | 读脚本头注释；写库需 mutation |
| `staging-supplement-check.js` | （手动） | 恢复 stale job | `SCRIPT_ALLOW_MUTATION=1` |
| `phase-e-staging-e2e-check.js` | `phase-e:staging-e2e` | HTTP 只读为主 | 后端需已启动 |
| `generate-*-sample.js` | （手动） | 写 exports/samples | 本地生成样例文件 |
| `runMigration*.js` | （手动） | DDL 变更 | 仅迁移环境 |

## C 类 — 需人工确认（勿默认删除）

| 项 | 状态 |
|----|------|
| 根目录 `scripts/update-from-zip.sh` | 保留：龙芯 VM 更新辅助 |
| 历史手动 migration runner（10 个） | 保留：旧环境补跑；新环境用 bootstrap |
| `docs/export-optimization-assessment.md` | 保留：评估记录 |

当前**无**已确认的 `temp/debug/bak` 源码文件；`.gitignore` 已忽略 `*.bak`、`*.old`、`tmp/`。

## 禁止在演示库随意执行

- `npm run regression:grading:live`
- `SCRIPT_ALLOW_MUTATION=1 npm run seed:test`（会改用户/任务/提交测试数据）
- `smoke:student-import` / `smoke:teacher-import`（会 DELETE 测试导入账号）
- 手动 migration runner（DDL）
- `SCRIPT_LIVE_AI=1 npm run smoke:assistant-api`（会调用 LLM 并写入 assistant 会话）
