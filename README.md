# 龙芯智训 · 校企实训智慧评价平台

校企协同场景下的 Web 应用：多模态作业提交、**BullMQ 异步 AI 批改**、教师复核、企业评价、学情分析、知识图谱、题库考试、**学生 AI 助手（SSE 流式）**；图形验证码登录、单端登录、SMTP 找回密码、内容安全审核。

**国产化适配**：LoongArch / 麒麟 OS 宿主机部署 + 云 ECS Docker 部署。

## 文档

完整工程文档见 **[docs/README.md](./docs/README.md)**：

| 文档 | 说明 |
|------|------|
| [00-engineering-audit-report.md](./docs/00-engineering-audit-report.md) | 部署前工程化审计 |
| [01-overview.md](./docs/01-overview.md) | 项目概述与功能 |
| [02-architecture.md](./docs/02-architecture.md) | 系统架构与目录 |
| [03-development.md](./docs/03-development.md) | 本地开发 |
| [04-deployment.md](./docs/04-deployment.md) | 生产部署与运维 |
| [05-configuration.md](./docs/05-configuration.md) | 环境配置 |
| [07-test-plan.md](./docs/07-test-plan.md) | 回归测试与种子数据 |
| [16-security-design.md](./docs/16-security-design.md) | 安全设计 |
| [17-release-checklist.md](./docs/17-release-checklist.md) | **发布前检查清单** |
| [18-demo-script.md](./docs/18-demo-script.md) | 7 分钟演示脚本 |

## 快速开始

```bash
# 1. 环境（勿提交 .env）
cp .env.example .env          # 本地：DB_HOST=127.0.0.1, NODE_ENV=development

# 2. 后端
cd backend && npm install && npm run dev

# 3. 前端
cd frontend && npm install && npm run dev

# 4. AI 批改 Worker（第三终端，与 legacy worker 二选一）
cd backend && npm run worker:grading:dev

# → http://localhost:5173  默认 admin / admin123（生产务必改密）
```

## 数据库与测试数据

```bash
# 迁移：backend 启动时 bootstrap 自动执行

# 测试种子（会写库，仅开发库）
cd backend && npm run seed:test:apply
# 或：SCRIPT_ALLOW_MUTATION=1 npm run seed:test
```

## 测试命令

```bash
cd backend
npm run test:login-identifier
npm run test:assistant-stream
npm run test:submission-feedback
npm run test:grading-contract
npm run regression:teacher-permissions
npm run regression:grading              # 默认 SAFE，不创建真实 AI 批改任务
# npm run regression:grading:live       # 显式 LIVE，可能调用 LLM（勿在演示库默认执行）

cd ../frontend && npm run build
```

## 生产部署

| 环境 | 命令 |
|------|------|
| **龙芯 VM / 麒麟** | `cp .env.host.example .env` → `sudo bash scripts/install-autostart.sh` |
| **云 ECS** | `cp .env.example .env` → `docker compose up -d --build` |

发布前请完成 [docs/17-release-checklist.md](./docs/17-release-checklist.md)。

## 注意事项

1. **不要提交 `.env`**（已在 `.gitignore`）；示例仅用 `.env.example` / `.env.host.example`。
2. **`regression:grading` 默认 SAFE MODE**，不会新增 `grading_jobs`；真实 AI 批改测试用 `regression:grading:live`。
3. **`seed:test` 默认不写库**；写入测试数据用 `seed:test:apply` 或 `SCRIPT_ALLOW_MUTATION=1`。
4. **BullMQ Worker**（`worker:grading`）与 **legacy worker**（`worker:grading:legacy`）不要同时启动。
5. **AI 助手 SSE** 经 Nginx 时需 `proxy_buffering off`，见 [04-deployment.md](./docs/04-deployment.md) §4.2.10。
6. 运行时目录 `uploads/`、`logs/`、`tmp/` 由部署创建，不提交 Git。

## 技术栈

Vue 3 · Vite · Element Plus · ECharts · Pinia · Node.js · Express · MariaDB · Redis · BullMQ · Neo4j · JWT · LangChain · Socket.IO · systemd · Nginx
