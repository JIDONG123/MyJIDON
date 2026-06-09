# 文档中心

智能实训作业批改管理系统（龙芯智训 / B1 LoongArch Grading System）工程文档。

## 阅读顺序

| 序号 | 文档 | 说明 | 读者 |
|------|------|------|------|
| 01 | [01-overview.md](./01-overview.md) | 项目概述、业务功能、技术栈 | 全员 |
| 02 | [02-architecture.md](./02-architecture.md) | 系统架构、仓库结构、API 与数据流 | 开发 / 架构 |
| 03 | [03-development.md](./03-development.md) | 本地开发环境搭建与调试 | 开发 |
| 04 | [04-deployment.md](./04-deployment.md) | 生产部署与运维（龙芯 VM + 云 ECS） | 运维 / 交付 |
| 05 | [05-configuration.md](./05-configuration.md) | 环境变量与配置项说明 | 运维 / 开发 |
| 06 | [06-requirements.md](./06-requirements.md) | 需求对照、108 项验收清单、答辩路径 | 产品 / 答辩 |
| 07 | [07-test-plan.md](./07-test-plan.md) | 回归测试、AI 异步批改验收、种子数据 | 开发 / QA |
| 08 | [08-teacher-permission-tests.md](./08-teacher-permission-tests.md) | 教师端任务权限（仅创建者）测试清单 | 开发 / QA |
| 09 | [09-frontend-teacher-ui.md](./09-frontend-teacher-ui.md) | 教师批改工作台、核查修正、任务向导等前端 UI | 开发 / 产品 |
| 10 | [10-frontend-student-ui.md](./10-frontend-student-ui.md) | 学生实训中心、学习空间、任务过滤与空状态 | 开发 / 产品 |
| 11 | [11-staging-verification.md](./11-staging-verification.md) | Staging / 龙芯部署验证清单（E2E + AI 闭环） | QA / 运维 |
| 12 | [12-online-practice-code-runner.md](./12-online-practice-code-runner.md) | 在线实训 / 代码运行检查（Code Runner Worker） | 开发 / 架构 |
| 13 | [13-student-ai-assistant.md](./13-student-ai-assistant.md) | 学生 AI 助手（RAG + SSE） | 开发 / 产品 |
| 16 | [16-security-design.md](./16-security-design.md) | 认证、权限、密钥、脚本安全 | 全员 / 运维 |
| 17 | [17-release-checklist.md](./17-release-checklist.md) | **发布前检查清单** | 运维 / 交付 |
| 18 | [18-demo-script.md](./18-demo-script.md) | 7 分钟答辩演示脚本 | 产品 / 答辩 |
| — | [00-engineering-audit-report.md](./00-engineering-audit-report.md) | 部署前工程化审计报告 | 架构 / 交付 |

## 快速入口

```bash
# 本地开发（AI 批改需第三个终端启动 Worker）
cp .env.example .env   # DB_HOST=127.0.0.1, NODE_ENV=development
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
cd backend && npm run worker:grading:dev   # 终端 3：消费 grading job 队列

# 龙芯 VM 生产
cp .env.host.example .env && sudo bash scripts/install-autostart.sh
# 含 smart-grading-backend + smart-grading-grading-worker

# 云 ECS 生产
cp .env.example .env && docker compose up -d --build
```

默认管理员：`admin` / `admin123`（生产环境务必修改）。

## 文档规范

- 命名：`NN-topic.md`（两位序号 + 英文 kebab-case 主题）
- 单一事实来源：部署以 `04-deployment.md` 为准，配置以 `05-configuration.md` 为准
- 代码变更涉及行为差异时，同步更新对应文档
