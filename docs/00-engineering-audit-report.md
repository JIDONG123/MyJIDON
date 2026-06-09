# 部署前工程化审计报告

> 系统：**龙芯智训 · 校企实训智慧评价平台**（B1 LoongArch Grading System）  
> 审计日期：2026-06-08  
> 原则：先扫描分类，再最小改动；不删不确定文件；不改核心业务逻辑。

---

## 1. 项目目录结构概览

```
B1_LoongArch_Grading_System/
├── backend/          # Node.js + Express API、Worker、SQL 迁移
├── frontend/         # Vue 3 + Vite + Element Plus
├── deploy/           # Nginx、Dockerfile、systemd
├── docs/             # 工程文档（18+ 篇）
├── scripts/          # 宿主机安装/更新 shell
├── docker-compose.yml
├── docker-compose.host.yml
├── .env.example / .env.host.example
└── README.md
```

运行时目录（不提交）：`uploads/`、`logs/`、`tmp/`、`frontend/dist/`、`node_modules/`。

---

## 2. 后端核心模块

| 层 | 路径 | 职责 |
|----|------|------|
| 入口 | `server.js`, `app.js` | HTTP、中间件、路由挂载 |
| 路由 | `routes/*.js` | REST API |
| 控制器 | `controllers/*.js` | 请求校验、响应 |
| 服务 | `services/*.js` | 业务逻辑 |
| 工具 | `utils/*.js` | LLM、RAG、队列、权限、SSE |
| Worker | `workers/gradingBullmqWorker.js`, `codeRunnerWorker.js` | 异步 AI 批改、代码运行 |
| 数据库 | `db/bootstrap.js`, `sql/`, `sql/migrations/` | 迁移与启动 |

---

## 3. 前端核心模块

| 路径 | 职责 |
|------|------|
| `views/admin/` | 管理端（用户、课程、监管、内容安全） |
| `views/teacher/` | 教师端（任务、批改队列、学情、图谱） |
| `views/student/` | 学生端（提交、报告、AI 助手、在线实训） |
| `views/enterprise/` | 企业导师评价 |
| `api/` | Axios 封装 |
| `stores/` | Pinia 会话与批改进度 |
| `socket/` | Socket.IO 单端登录踢出 |

---

## 4. 部署相关文件

| 文件 | 用途 |
|------|------|
| `deploy/nginx/host-native.conf` | 龙芯 VM 宿主机 Nginx（含 SSE `/api/assistant/`） |
| `deploy/docker/nginx.default.conf` | Docker 全栈 Nginx |
| `deploy/docker/nginx.static.conf` | 仅静态 |
| `deploy/systemd/smart-grading-*.service` | backend / worker / code-runner / neo4j |
| `scripts/install-autostart.sh` | 龙芯一键安装 |
| `docker-compose.yml` | 云 ECS 全栈 |

---

## 5. 数据库迁移文件

- **Bootstrap**：`backend/sql/init.sql`
- **编号迁移**：`backend/sql/migrations/001`–`013`（grading、BullMQ、内容安全、反馈重交、单端登录等）
- **根目录 SQL**：20 个 `migration_*.sql`（课程、RAG、题库、图谱等）
- **执行方式**：`backend/db/bootstrap.js` 启动时自动；旧环境可用手动 `runMigration*.js`

未发现 migration 中含真实密码；demo 数据在 `seed-test-data.js`，不在 migration。

---

## 6. 文档文件清单

见 [docs/README.md](./README.md)。建议发布前阅读：04 部署、05 配置、07 测试、16 安全、17 发布清单、18 演示脚本。

---

## 7. 测试脚本清单（A 类）

| 类型 | 命令 |
|------|------|
| 单元测试 | `test:login-identifier`, `test:assistant-stream`, `test:submission-feedback`, `test:grading-contract` 等 |
| 回归 SAFE | `regression:grading`（默认不写 grading_jobs） |
| 回归 LIVE | `regression:grading:live`（显式） |
| 权限回归 | `regression:teacher-permissions` |
| 部署检查 | `staging:env-check` |

---

## 8. 可疑临时文件

| 项 | 结论 |
|----|------|
| `*.bak` / `*.old` / `temp/` 源码 | **未发现** |
| `backend/uploads/` | 仅 `.gitkeep` |
| 根目录 `uploads/logs/temp` | **不存在**（正确） |
| Windows 路径重复显示（`\` vs `/`） | 同一文件，非重复组件 |

---

## 9. 可疑废弃文件

| 项 | 结论 |
|----|------|
| `worker:grading:legacy` | **保留**：回退路径，文档注明勿与 BullMQ 同时启 |
| 10 个手动 `runMigration*.js` | **保留**：历史环境补跑，新环境用 bootstrap |
| `docs/11-final-acceptance-report.md` | **保留**：验收记录 |

**需人工确认**：是否仍需要全部手动 migration runner（若 bootstrap 已覆盖可归档到 `scripts/dev/legacy-migrations/`）。

---

## 10. 敏感信息文件

| 文件 | 状态 |
|------|------|
| `.env` / `.env.local` | 已在 `.gitignore` |
| `.env.example` / `.env.host.example` | **占位符**，无真实密钥 |
| 源码硬编码密钥 | **未发现** API Key；JWT 默认 `dev-secret` 仅示例 |
| 文档中的 `admin123` | 示例密码，**生产必须更换** |

**提醒**：若 `.env` 曾提交或泄露，请轮换：DB 密码、Redis、Neo4j、JWT_SECRET、DashScope Key、SMTP、frp token。

---

## 11. 可能误触发真实业务的脚本

| 脚本 | 风险 | 现状 |
|------|------|------|
| `regression-grading-phase4.js` | 创建 AI 批改 job | ✅ 默认 SAFE + dryRun |
| `regression-grading-live.js` | 同上 LIVE | ✅ 显式入口 |
| `seed-test-data.js` | 写测试数据 | ✅ 需 `SCRIPT_ALLOW_MUTATION=1` |
| `staging-supplement-check.js` | recover job | ✅ 需 mutation |
| `*-import-smoke-test.js` | DELETE 用户 | ✅ 需 mutation |
| `assistant-api-smoke-test.js` | LLM + DELETE 会话 | 写库/LLM 需显式开关 |

---

## 12. 需保留的工程化脚本

见 [backend/scripts/README.md](../backend/scripts/README.md) A/B 类表。

---

## 13. 部署风险点（已确认/待运维）

| 项 | 状态 |
|----|------|
| Nginx SSE `proxy_buffering off` | ✅ `deploy/nginx/host-native.conf` |
| 后端端口 8080 vs Nginx upstream | ✅ 配置一致 |
| BullMQ vs legacy worker 双启 | ⚠️ 文档强调二选一 |
| `regression:grading` 污染演示数据 | ✅ 已修复 SAFE 模式 |
| `.env` 未提交 | ✅ gitignore |
| 上传目录权限 | 部署时创建 `uploads/` |
| Redis 版本 < 6.2 | 警告不影响基本功能 |

---

## 14. 需补充的文档（本次已增）

| 文档 | 状态 |
|------|------|
| `00-engineering-audit-report.md` | ✅ 本文 |
| `16-security-design.md` | ✅ 新增 |
| `17-release-checklist.md` | ✅ 新增 |
| `18-demo-script.md` | ✅ 新增 |
| `backend/scripts/README.md` | ✅ 新增 |
| 根 `README.md` | ✅ 更新 |

---

## 15. 脚本 A/B/C 分类摘要

- **A 类（保留）**：回归、单元测试、staging-env-check、迁移 bootstrap、Worker 入口  
- **B 类（规范）**：seed、smoke、generate-sample、手动 migration — 需 `SCRIPT_ALLOW_MUTATION=1`  
- **C 类（需人工确认）**：历史 migration runner、update-from-zip.sh — 不删除  

本次**未删除**任何脚本文件。
