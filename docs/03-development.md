# 03 — 本地开发

## 3.1 环境要求

| 组件 | 版本 |
|------|------|
| Node.js | ≥ 18（推荐 20.x） |
| MariaDB / MySQL | 8.0+，utf8mb4 |
| Redis | 7.x（**必填**：图形验证码、找回密码、Socket.IO 跨进程、LangChain Step2 缓存） |
| Neo4j | 5.x（可选，知识图谱功能） |

Windows 可用于日常开发；生产环境见 [04-deployment.md](./04-deployment.md)。

## 3.2 初始化

```bash
# 1. 环境变量
cp .env.example .env
```

`.env` 开发关键项：

```env
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root          # 或 sg_user
DB_PASSWORD=你的密码
DB_NAME=smart_grading_system

REDIS_ENABLED=1
REDIS_HOST=127.0.0.1
REDIS_URL=redis://127.0.0.1:6379/0

PORT=3000             # 后端开发端口
JWT_SECRET=dev-secret-at-least-32-chars-long
JWT_EXPIRES_IN=8h     # 可选，JWT 有效期

# 找回密码（开发环境）
PUBLIC_APP_URL=http://localhost:5173
# SMTP_HOST=smtp.qq.com
# SMTP_PORT=587
# SMTP_SECURE=0
# SMTP_USER=your@qq.com
# SMTP_PASS=QQ邮箱授权码
# SMTP_FROM=龙芯智训 <your@qq.com>

# 可选
NEO4J_URI=bolt://127.0.0.1:7687
USE_LANGCHAIN_GRADING=1
```

> **注意**：勿保留 `backend/.env`，否则会覆盖根目录配置。

```bash
# 2. 数据库
mysql -u root -p < backend/sql/init.sql

# 3. 依赖
cd backend && npm install
cd ../frontend && npm install
```

## 3.3 启动

```bash
# 终端 1 — 后端（nodemon 热重载）
cd backend && npm run dev

# 终端 2 — 前端（Vite HMR）
cd frontend && npm run dev

# 终端 3 — AI 批改 Worker（使用 AI 批改时必填，否则 job 一直 pending）
cd backend && npm run worker:grading:dev
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173 |
| 后端 API | http://localhost:3000（以 `backend/.env` 或根 `.env` 的 `PORT` 为准） |
| 代理 | Vite 将 `/api`、`/uploads` 代理到后端端口 |

> **Redis：** 生产/联调 AI 批改时 Redis 必须可用；开发环境无 Redis 时 Worker 会降级内存队列（**仅单进程**）。图形验证码、找回密码、Socket 跨进程同样依赖 Redis。

## 3.4 大模型配置

开发环境 LLM 不在 `.env` 中配置：

1. 浏览器登录 **admin / admin123**
2. 进入「系统设置」
3. 填写 API Base、API Key、模型名
4. 点击「测试大模型连接」

通义千问视觉（可选）：在 `.env` 中设置 `QWEN_VL_API_KEY`。

## 3.5 登录、验证码与找回密码

1. 确保 **Redis 已启动**（验证码与重置令牌均存 Redis）
2. 登录页需输入 **4 位图形验证码**；点击图片可刷新
3. 配置 SMTP 后，登录页「忘记密码」可发重置邮件：
   - 开发环境 `PUBLIC_APP_URL=http://localhost:5173`
   - 邮件内链接在 QQ 邮箱客户端可能无法直接打开 localhost，可**复制链接**到浏览器
   - 生产环境改为 VM/域名对外 URL，如 `http://192.168.x.x`
4. 重置成功后会通过 `BroadcastChannel` 通知原登录标签页

## 3.6 常用调试

```bash
# 后端日志（生产 systemd）
journalctl -u smart-grading-backend -f
journalctl -u smart-grading-grading-worker -f

# 检查迁移（含 grading_jobs）
mysql -u sg_user -p smart_grading_system -e "SELECT * FROM migrations ORDER BY executed_at DESC LIMIT 10;"

# 集群模式本地验证
cd backend && USE_CLUSTER=1 CLUSTER_WORKERS=2 npm start
# 集群模式下仍需单独启动 Worker：
cd backend && npm run worker:grading
```

## 3.7 AI 批改回归测试

```bash
cd backend
npm run test:grading-contract          # 旧接口 JSON 契约单元测试
npm run regression:grading             # 默认 SAFE MODE（dryRun，不写 grading_jobs）

# LIVE AI（仅专用开发库，会创建真实批改任务）：
# npm run regression:grading:live

# HTTP 层（后端已启动，须 live 模式才 POST 批改）
$env:REGRESSION_HTTP=1
$env:REGRESSION_BASE_URL="http://127.0.0.1:3000"
npm run regression:grading:live

# 或
powershell -File scripts/run-regression-grading.ps1
```

详见 [07-test-plan.md](./07-test-plan.md) 第 6 节。

## 3.9 教师端 UI 与页面结构

近期前端优化（**不改 API / 批改 JSON 结构**）见专文：

**[09-frontend-teacher-ui.md](./09-frontend-teacher-ui.md)**

要点：

- **批改详情** `/teacher/grading/:submissionId`：首屏三栏（提交摘要 | 智能核查 | 修正+复核），下方折叠原始材料与深度分析
- **批改状态**：已提交无 `grading_results` → 列表显示「待批改」（`utils/gradingStatusDisplay.js`）
- **任务发布** `/teacher/tasks/create`：五步向导 + 右侧发布摘要
- 关键组件：`SubmissionSummaryCard`、`VerificationStepChecklistPanel`、`verificationStepUtils.js`

## 3.10 构建验证

```bash
cd frontend && npm run build    # 产出 frontend/dist
cd backend && npm start         # 生产模式；PORT 以 .env 为准（VM/Docker 多为 8080，本地开发 3000）
```

生产模式下需 Nginx 反代 `/api` 到后端，静态文件指向 `frontend/dist`；**生产环境需同时运行 grading Worker**（见 [04-deployment.md](./04-deployment.md)）。

## 3.11 相关文档

- 架构说明 → [02-architecture.md](./02-architecture.md)
- 环境变量全集 → [05-configuration.md](./05-configuration.md)
- 回归与验收清单 → [07-test-plan.md](./07-test-plan.md)
- 教师端页面 UI → [09-frontend-teacher-ui.md](./09-frontend-teacher-ui.md)
