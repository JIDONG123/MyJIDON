# 05 — 环境配置

## 5.1 配置原则

| 原则 | 说明 |
|------|------|
| 单一来源 | 项目根目录 `.env` 为唯一运行时配置 |
| 模板选择 | 龙芯 VM → `.env.host.example`；云 ECS → `.env.example` |
| 禁止覆盖 | **勿保留 `backend/.env`**，`loadEnv.js` 会以它覆盖根配置 |
| LLM 密钥 | API Base / Key / Model 存于数据库 `system_config`，管理端维护 |
| 注释项 | 带 `#` 的变量未写入 `.env` 时，后端使用代码内默认值 |

## 5.2 模板对照

| 变量 | 龙芯 VM（宿主机） | 云 ECS（Docker） |
|------|-------------------|------------------|
| `DB_HOST` | `localhost` | `mariadb` |
| `REDIS_HOST` | `127.0.0.1` | `redis` |
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | `redis://redis:6379/0` |
| `NEO4J_URI` | `bolt://127.0.0.1:7687` | `bolt://neo4j:7687` |
| `PORT` | `3000`（本地开发） | `8080`（Nginx 反代 `127.0.0.1:8080`） |
| `CODE_RUNNER_MODE` | `host`（龙芯 VM 推荐） | `docker`（容器内执行） |
| `CODE_RUNNER_ENABLED` | `1`（演示） | `0` | 龙芯全功能演示模板默认 `1`；答辩仅主流程时改 `0` |
| `ONLINE_PRACTICE_AI_REVIEW_ENABLED` | `1`（演示） | `0` | 龙芯演示模板默认 `1`；依赖管理端 LLM |
| Neo4j 内存 | `NEO4J_HEAP_*`（host compose） | `NEO4J_MEM_LIMIT` 等 |

## 5.3 必改项（生产）

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | ≥ 32 位随机字符串 |
| `JWT_EXPIRES_IN` | JWT 有效期，默认 `8h` |
| `PUBLIC_APP_URL` | 找回密码邮件内链接前缀（生产填对外 URL，勿带末尾 `/`） |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | 找回密码邮件（按需） |
| `DB_PASSWORD` | 应用数据库用户密码 |
| `MARIADB_ROOT_PASSWORD` | 仅云 Docker，MariaDB root |
| `NEO4J_PASSWORD` | Neo4j 认证，与 `NEO4J_AUTH` 一致 |
| `QWEN_VL_API_KEY` | 通义视觉 API（按需） |

## 5.4 分组说明

### 基础运行

| 变量 | 默认 | 说明 |
|------|------|------|
| `NODE_ENV` | `production` | |
| `ENABLE_BACKEND_CORS` | `0` | 生产由 Nginx 同源，保持 0 |
| `PORT` | `8080` | 后端监听端口（龙芯 VM / Docker 生产；Nginx 反代目标） |

### 数据库

| 变量 | 说明 |
|------|------|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MariaDB 连接 |
| `DB_POOL_CONNECTION_LIMIT` | 连接池上限，默认 50 |
| `DB_POOL_QUEUE_LIMIT` | 等待队列，默认 100 |

### Redis / Socket.IO

| 变量 | 说明 |
|------|------|
| `REDIS_ENABLED` | `1` 启用 |
| `REDIS_URL` / `REDIS_HOST` | 连接地址 |
| `SOCKET_IO_REDIS_KEY` | 适配器键前缀，默认 `sg:socket.io` |
| `SOCKET_IO_REDIS_DEV_PROBE` | 开发探测本地 Redis；生产设 `0` |

### 集群

| 变量 | 说明 |
|------|------|
| `USE_CLUSTER` | `1` 启用多 Worker |
| `CLUSTER_WORKERS` | Worker 数，默认按 CPU |
| `BCRYPT_ROUNDS` | 密码哈希成本，默认 10 |

### 身份认证与邮件

| 变量 | 默认 | 说明 |
|------|------|------|
| `JWT_EXPIRES_IN` | `8h` | JWT 过期时间（如 `24h`、`7d`） |
| `PUBLIC_APP_URL` | 开发 `http://localhost:5173` | 重置密码邮件链接前缀；龙芯 VM 填 `http://<本机IP>` |
| `SMTP_HOST` | — | SMTP 服务器，如 `smtp.qq.com` |
| `SMTP_PORT` | `587` | SMTP 端口 |
| `SMTP_SECURE` | `0` | `1` 表示 SSL（465 端口） |
| `SMTP_USER` | — | 发件邮箱账号 |
| `SMTP_PASS` | — | SMTP 授权码（非登录密码） |
| `SMTP_FROM` | 同 `SMTP_USER` | 发件人显示名，如 `龙芯智训 <xxx@qq.com>` |
| `PWD_RESET_TOKEN_TTL_SEC` | `900` | 重置令牌有效期（秒） |
| `PWD_RESET_RATE_TTL_SEC` | `120` | 同账号发信间隔（秒） |
| `CAPTCHA_TTL_SEC` | `300` | 图形验证码 Redis 有效期（秒） |

> 验证码与找回密码**依赖 Redis**；未配置 SMTP 时「忘记密码」接口返回配置错误。

### LangChain 多步批改

| 变量 | 默认 | 说明 |
|------|------|------|
| `USE_LANGCHAIN_GRADING` | `1` | 启用链式编排 |
| `LANGCHAIN_SUBMISSION_MAX_CHARS` | `14000` | 送入 LLM 最大字符 |
| `CACHE_TTL_LC_STEP2` | `1800` | Step2 Redis 缓存秒数 |

### AI 异步批改队列（BullMQ + Legacy fallback）

| 变量 | 默认 | 说明 |
|------|------|------|
| `BULLMQ_ENABLED` | `0` | `1` 启用 BullMQ item-level 调度；`0` 使用 Legacy Redis List |
| `BULLMQ_PREFIX` | `smart-grading` | BullMQ Redis key 前缀 |
| `AI_GRADING_QUEUE_NAME` | `ai-grading` | BullMQ 队列名 |
| `AI_GRADING_JOB_CONCURRENCY` | `2` | 兼容项；未设 `AI_GRADING_ITEM_CONCURRENCY` 时作为 Worker 并发 |
| `AI_GRADING_ITEM_CONCURRENCY` | 同左 | BullMQ Worker 同时处理的 item 数（龙芯 VM 建议 `1`–`2`） |
| `AI_GRADING_TIMEOUT_MS` | `90000` | LLM 单次调用超时 |
| `AI_GRADING_RETRY` | `1` | LLM 瞬态错误重试次数 |
| `AI_GRADING_BACKOFF_MS` | `2000` | LLM / BullMQ 退避基数（毫秒） |
| `AI_GRADING_RAG_CACHE_TTL` | `1800` | 标准路径 RAG 缓存 TTL（秒） |
| `AI_GRADING_TASK_CONTEXT_CACHE_TTL` | `1800` | 任务批改上下文缓存 TTL（秒） |
| `KG_ASYNC_AFTER_GRADING_JOB` | `0` | `1` 时 job 完成后异步触发 KG 构建 |
| `GRADING_JOB_QUEUE_KEY` | `sg:grading:jobs` | Legacy Redis List 队列键名 |
| `GRADING_JOB_BRPOP_SEC` | `5` | Legacy Worker `BRPOP` 阻塞超时（秒） |

> **生产环境 Redis 必填：** HTTP cluster 只入队不消费。`BULLMQ_ENABLED=1` 时运行 `npm run worker:grading`；Legacy 模式运行 `npm run worker:grading:legacy`。**勿同时启动两种 Worker。** 健康检查：`GET /api/grading/worker-health`。

### 代码运行 Worker（在线实训 / 任务代码检查）

| 变量 | 龙芯 VM 默认 | 云 ECS 默认 | 说明 |
|------|--------------|-------------|------|
| `CODE_RUNNER_ENABLED` | `0` | `0` | `1` 启用；Express 仅读开关，**不在主进程执行学生代码** |
| `CODE_RUNNER_MODE` | `host` | `docker` | 龙芯 VM 用宿主机 `runuser`；云 ECS / Windows 开发用 Docker |
| `CODE_RUNNER_JOBS_ROOT` | `/var/lib/smart-grading/code-runner/jobs` | 同左或容器卷 | 每 job 独立目录 |
| `CODE_RUNNER_USER` | `code_runner` | — | 仅 `host` 模式降权运行 |
| `CODE_RUNNER_QUEUE_KEY` | `sg:code_run:jobs` | 同左 | Redis List 队列 |
| `CODE_RUNNER_DEFAULT_TIMEOUT_SEC` | `10` | `10` | 单次运行超时（秒） |
| `CODE_RUNNER_MAX_OUTPUT_BYTES` | `65536` | `65536` | stdout/stderr 上限 |
| `CODE_RUNNER_STALE_MINUTES` | `10` | `10` | running 超时回收 |
| `CODE_RUNNER_IMAGE_*` | 仅 `docker` 模式 | 见 `.env.example` | Python / Node / C / C++ / Java 镜像 |

> **生产须独立 Worker：** `npm run worker:code-runner` 或 systemd `smart-grading-code-runner`（与 grading worker 分离）。`ENABLED=0` 时 API 返回 503，侧栏隐藏「在线实训」，**不影响**实训中心主流程。详见 [12-online-practice-code-runner.md](./12-online-practice-code-runner.md)。

### Neo4j 知识图谱

| 变量 | 说明 |
|------|------|
| `KG_NEO4J_ENABLED` | 是否启用 |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | 连接与认证 |
| `KG_RECONCILE_*` | 定时对账间隔、语义阈值、批大小 |
| `NEO4J_HEAP_*` | 容器内存（VM host compose） |

### 通义 / Embedding

| 变量 | 说明 |
|------|------|
| `QWEN_VL_API_KEY` / `QWEN_VL_API_BASE` / `QWEN_VL_MODEL` | 视觉识别 |
| `DASHSCOPE_API_KEY` / `EMBEDDING_API_BASE` | 向量 embedding |

### 缓存 TTL（可选，见模板注释）

`CACHE_KEY_PREFIX`、`CACHE_TTL_USER_ME`、`CACHE_TTL_CLASSES`、`CACHE_TTL_DASHBOARD` 等。

### 限流（可选，见模板注释）

`RATE_LIMIT_API_*`、`RATE_LIMIT_LOGIN_*`、`RATE_LIMIT_GRADING_*`、`RATE_LIMIT_QB_*` 等。

### 安全与解压（可选，见模板注释）

`POST_DEDUPE_WINDOW_MS`、`ZIP_MAX_*`、`QB_SCORE_ENC_KEY`、`QB_PYTHON_BIN`。

### 云 ECS 资源档位

| 变量 | medium（4c8g） |
|------|----------------|
| `DEPLOY_PROFILE` | `medium` |
| `NEO4J_HEAP_MAX` | `1G` |
| `BACKEND_MEM_LIMIT` | `1536m` |
| `REDIS_MAXMEMORY` | `256mb` |

运行 `bash scripts/detect-deploy-profile.sh` 可自动写入。

## 5.5 快速复制

```bash
# 龙芯 VM
cp .env.host.example .env

# 云 ECS
cp .env.example .env
```

完整变量列表以 `.env.host.example` / `.env.example` 为准。

## 5.6 相关文档

- 部署步骤 → [04-deployment.md](./04-deployment.md)
- 架构说明 → [02-architecture.md](./02-architecture.md)
- 在线实训 / Code Runner → [12-online-practice-code-runner.md](./12-online-practice-code-runner.md)
