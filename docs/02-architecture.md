# 02 — 系统架构

## 2.1 部署拓扑

### 龙芯 VM（宿主机 + Neo4j Docker）

```
浏览器 ──► Nginx:80 ──► frontend/dist（静态）
              │
              ├── /api/*      ──► Node cluster:8080
              ├── /uploads/*  ──► Node:8080
              └── /socket.io/* ──► Node:8080
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              MariaDB:3306    Redis:6379    Neo4j Docker:7687
              (宿主机)         (宿主机)       (bolt://127.0.0.1)
```

托管方式：MariaDB / Redis / Nginx / Node 由 **systemd** 开机自启；Neo4j 由 **smart-grading-neo4j.service** 调用 `docker-compose.host.yml`。

### 云 ECS（Docker Compose 全栈）

```
浏览器 ──► sg-nginx:80 ──► 静态 dist + 反代
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         sg-backend     sg-mariadb      sg-redis      sg-neo4j
         :8080          :3306           :6379         :7687
```

编排文件：`docker-compose.yml`（六服务：mariadb、redis、neo4j、backend、frontend、nginx）。

## 2.2 应用架构

```
┌─────────────────────────────────────────────────────────┐
│  frontend (Vue 3 SPA)                                   │
│  router / pinia / axios / socket.io-client / echarts    │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP / WS
┌──────────────────────────▼──────────────────────────────┐
│  backend (Express + cluster.js)                         │
│  routes → controllers → services / utils                │
│  middleware: auth, upload, rateLimiter, postDedupe      │
│  socket: socketServer + Redis adapter                   │
└──────┬────────────┬────────────┬────────────┬───────────┘
       │            │            │            │
   MariaDB       Redis        Neo4j       LLM API
   (mysql2)    (ioredis)   (neo4j-driver) (OpenAI 兼容)
```

- **cluster.js**：主进程执行 DB bootstrap + 迁移，再 fork Worker；Worker 仅处理 HTTP / Socket.IO
- **loadEnv.js**：只读项目根目录 `.env`（`backend/.env` 会覆盖，生产环境勿保留）

## 2.3 仓库目录

```
<项目根>/
├── README.md
├── .env.example                 # 云 ECS Docker 模板
├── .env.host.example            # 龙芯 VM 宿主机模板
├── docker-compose.yml           # 云 ECS 全栈
├── docker-compose.host.yml      # 龙芯 VM 仅 Neo4j
├── deploy/
│   ├── docker/                  # 云镜像 Dockerfile + Nginx 配置
│   ├── nginx/host-native.conf   # VM 宿主机 Nginx
│   └── systemd/                 # backend / neo4j 开机自启
├── scripts/
│   ├── install-autostart.sh     # VM 一键安装
│   ├── update-from-zip.sh       # VM zip 热更新
│   └── detect-deploy-profile.sh # 云 ECS 资源档位
├── backend/
│   ├── server.js / app.js / cluster.js
│   ├── config/                  # database.js, loadEnv.js
│   ├── routes/                  # 16 个 API 路由模块（含 authRoutes）
│   ├── controllers/             # 业务控制器（含 authController）
│   ├── services/                # KG、VL、ZIP 等领域服务
│   ├── utils/                   # LLM、缓存、限流、题库、captcha/mail 等
│   ├── db/                      # bootstrap、migrationList
│   ├── sql/                     # init.sql + migration_*.sql
│   ├── socket/                  # Socket.IO 服务
│   └── uploads/                 # 运行时上传目录
├── frontend/
│   └── src/
│       ├── router/              # 四端路由
│       ├── views/               # admin / teacher / student / enterprise
│       │                        # 教师批改工作台 Grading.vue、TaskForm 向导等 → docs/09
│       ├── api/                 # Axios 封装（含 auth.js）
│       ├── utils/               # authStorage、gradingStatusDisplay、verificationStepUtils 等
│       ├── components/          # SubmissionSummaryCard、VerificationStepChecklistPanel、VL、KG…
│       └── socket/              # 实时客户端
└── docs/                        # 工程文档（本目录）
```

## 2.4 API 路由

| 前缀 | 模块 | 说明 |
|------|------|------|
| `/api/auth` | 认证扩展 | 图形验证码、忘记密码、邮件重置 |
| `/api/users` | 用户 | 登录（含验证码）、注册、/me、头像、账号与密码管理 |
| `/api/classes` | 班级 | CRUD、学生名单、批量入班 |
| `/api/tasks` | 任务 | 实训任务 CRUD |
| `/api/submissions` | 提交 | 作业上传与查询 |
| `/api/grading` | 批改 | AI 批改（旧 + job API）、人工复核、批量进度 |
| `/api/dashboard` | 看板 | 统计数据、班级导出 |
| `/api/settings` | 设置 | 系统配置（管理员） |
| `/api/reports` | 报表 | PDF 报告 |
| `/api/export` | 导出 | 扩展导出 |
| `/api/notifications` | 通知 | 消息通知 |
| `/api/kb` | 知识库 | 文档上传与 RAG |
| `/api/analytics` | 分析 | 学习画像等 |
| `/api/assistant` | AI 助手 | 学生会话 |
| `/api/qb` | 题库 | 题目、练习、考试 |
| `/api/kg` | 知识图谱 | 构建、查询、对账 |
| `/api/majors` | 专业 | 管理员 CRUD；教师/学生只读 |
| `/api/terms` | 学期 | 管理员 CRUD；教师/学生只读 |
| `/api/courses` | 课程 | 管理员 CRUD；教师 `/mine`、按权限列表 |
| `/api/teaching-classes` | 教学班 | CRUD、绑定教师/学生（`source_class_id` 可选） |
| `/api/project-templates` | 实训项目模板 | CRUD、`POST /:id/spawn-task` 一键生成任务 |
| `/api/schedules` | 实训日历 | `GET /calendar`、CRUD 轻量课表 |

任务表 `tasks` 兼容双轨：`class_id`（旧行政班）与 `teaching_class_id`（新教学班）二选一；学生任务列表为 UNION 可见。

企业导师除 `enterprise_class_access` 外，新增 `enterprise_teaching_class_access`（`PUT /api/users/enterprise-accounts/:id/teaching-classes`）。

### 课程教学班增强（Phase 3–4）

| 能力 | API / 模块 |
|------|------------|
| AI 批改注入课程/项目上下文 | `utils/taskGradingContext.js` → `aiGrading` / `langchainGradingService` |
| 实训统计/导出（行政班·教学班·课程） | `GET /api/dashboard/practice-stats`、`GET /api/dashboard/practice-export` |
| 批量导出教学班 | `GET /api/export/scores?teachingClassId=&taskId=` |
| 成果批改工作台 | `GET /api/submissions/teacher/workbench` |
| 学生推荐任务（含教学班） | `GET /api/analytics/student/me/recommendations` |
| 数据大屏教学班维度 | `GET /api/dashboard/big-screen?teachingClassId=` |
| 教学班任务列表 | `GET /api/tasks/teaching-class/:teachingClassId` |

### AI 批改任务调度中心（BullMQ + MySQL 业务状态）

**设计原则：** MySQL `grading_jobs` / `grading_job_items` 为业务状态权威；BullMQ 仅负责队列调度、并发、失败重试与 Worker 恢复；HTTP 入队后立即返回，不阻塞请求。

**双模式（`BULLMQ_ENABLED`）：**

| 模式 | Worker 命令 | 队列 |
|------|-------------|------|
| BullMQ（推荐） | `npm run worker:grading` | BullMQ `ai-grading`，**一个 job = 一个 grading_job_item** |
| Legacy fallback | `npm run worker:grading:legacy` | Redis List `sg:grading:jobs`，整 job 串行 |

**勿同时启动两种 Worker。**

```
教师 POST /grading/ai/:id 或 /grading/batch/:taskId
        ↓
gradingJobService → MySQL grading_jobs + grading_job_items（status: pending → queued）
        ↓
BullMQ queue.add('grading-item', { gradingJobId, gradingJobItemId, submissionId, taskId })
        ↓
gradingBullmqWorker（concurrency=AI_GRADING_ITEM_CONCURRENCY）
        ↓
gradingItemProcessor → runSingleGrading（RAG/任务上下文缓存、LLM timeout/retry）
        ↓
grading_results + 聚合 grading_jobs 进度 + Socket + 站内通知
        ↓
（可选）job 完成后异步 KG 构建（KG_ASYNC_AFTER_GRADING_JOB=1）
```

**Worker 健康检查：** `GET /api/grading/worker-health`（队列 waiting/active、Redis、worker 心跳）。

**数据表：** 迁移 `003_grading_jobs.sql` + `006_grading_bullmq_items.sql`（item stage、耗时指标、batch_mode 等）。

**旧接口（前端无需改 URL，响应新增 `jobId`）：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/grading/ai/:submissionId` | 单份入队；`data`: `async`, `submissionId`, `status`, `jobId`, `deduped` |
| POST | `/api/grading/batch/:taskId` | 批量入队；`data`: `async`, `taskId`, `queued`, `batchId`, `jobId` |
| GET | `/api/grading/batch-progress/:batchId` | 优先查 `grading_jobs.legacy_batch_id`；否则回落 `grading_results.ai_batch_id` |

**新 Job API（`/api/grading/jobs`，教师/管理员）：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/grading/jobs` | body: `{ mode: "single", submissionId }` 或 `{ mode: "batch", taskId }` |
| GET | `/api/grading/jobs` | 分页列表 `?page=&pageSize=&status=` |
| GET | `/api/grading/jobs/:id` | 详情 + items |
| POST | `/api/grading/jobs/:id/cancel` | 软取消（running 中 LLM 不中断） |
| POST | `/api/grading/jobs/:id/retry` | 失败项重新入队 |
| GET | `/api/grading/worker-health` | BullMQ 队列与 Worker 心跳 |

**Socket（`rt` 事件，`domain=grading_job`）：** 推送到 `user:{created_by}` 与 `role:admin`（不依赖 `class:{id}:t`，适配教学班 `class_id` 为空）。

**通知（`notifications` 表）：**

| type | 场景 | ref_type | 跳转 |
|------|------|----------|------|
| `grade_job_completed` | 全部成功 | `grading_job` | `/teacher\|admin/grading-jobs/:id` |
| `grade_job_partial` | 部分失败 | 同上 | 同上 |
| `grade_job_failed` | 全部失败 | 同上 | 同上 |
| `grade_job_cancelled` | 已取消 | 同上 | 同上 |
| `grade_ai` | 单份完成（学生） | `submission` | 学生成绩页 |

**前端页面：** `/teacher/grading-jobs`（列表）、`/teacher/grading-jobs/:id`（详情）；管理员 `/admin/grading-jobs*`；布局内 `GradingJobProgressPanel` 右下角卡片。

**关键模块：**

| 模块 | 路径 |
|------|------|
| 入队 / 权限 / dedup / batchMode | `services/gradingJobService.js` |
| BullMQ + Legacy 队列 | `utils/gradingJobQueue.js` · `utils/bullmqGradingConfig.js` |
| Item 处理 | `utils/gradingItemProcessor.js` · `utils/gradingJobAggregator.js` |
| BullMQ Worker | `workers/gradingBullmqWorker.js` |
| Legacy Worker | `workers/gradingJobWorker.js` · `utils/gradingJobProcessor.js` |
| RAG / 任务上下文缓存 | `utils/gradingRagCache.js` · `utils/gradingTaskContextCache.js` |
| LLM timeout/retry | `utils/llmClient.js` |
| Socket + 通知 | `utils/gradingJobNotify.js` · `utils/realtimeEmit.js` |
| LLM 执行 | `utils/gradingQueue.js` → `runSingleGrading` |

### 课程教学班增强（Phase 5–6）

| 能力 | API / 页面 |
|------|------------|
| 管理员仪表盘课程/教学班 KPI | `GET /api/dashboard/stats` 扩展 `courseCount`、`teachingClassCount`、`curriculumTaskCount` |
| 实训统计 PDF（行政班·教学班·课程） | `GET /api/reports/practice/pdf?scopeType=&scopeId=` |
| 管理员课程监管 | `/admin/curriculum`：教学班 CRUD、项目模板/实训日历总览 |
| 管理员教学班成员 | `/admin/teaching-classes/:id`（复用教学班详情，含教师/学生维护） |
| 管理员任务筛选 | `/admin/tasks` 按课程/教学班/发布类型过滤 |

静态资源：`/uploads/*` 由 Express 或 Nginx 反代提供。

### `/api/auth` 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/captcha` | 获取图形验证码（`captchaId` + `imageBase64`） |
| POST | `/api/auth/forgot-password` | 忘记密码（body: `username`, `email`） |
| POST | `/api/auth/reset-password` | 邮件令牌重置（body: `token`, `newPassword`, `confirmPassword`） |

登录接口 `POST /api/users/login` 额外要求 body 含 `captchaId`、`captchaCode`。

### 用户密码相关接口（`/api/users`）

| 方法 | 路径 | 角色 | 说明 |
|------|------|------|------|
| PATCH | `/api/users/me/credentials` | teacher / student | 修改用户名/密码（需当前密码） |
| GET | `/api/users/:id/password` | admin | 查看指定用户明文密码 |
| PUT | `/api/users/:id` | admin | 编辑用户（含用户名/密码） |

## 2.5 数据库与迁移

1. **首次初始化**：`backend/sql/init.sql`（Docker 空卷自动执行；VM 需手动导入）
2. **启动自检**：`backend/db/bootstrap.js` 检测 `users` 表，不存在则执行 init
3. **增量迁移**：扫描 `migration_*.sql` 与 `migrations/*.sql`，写入 `migrations` 表幂等执行
4. **顺序**：`backend/db/migrationList.js` 中 `PREFERRED_ORDER` 优先，其余按文件名

## 2.6 关键设计决策

| 决策 | 说明 |
|------|------|
| 龙芯不用 Node Docker 镜像 | `cr.loongnix.cn` Node 镜像已知崩溃，宿主机安装 Node 20.x |
| Neo4j 保留 Docker | Java 依赖复杂，单独容器 + systemd 自启 |
| LangChain 多步批改 | `USE_LANGCHAIN_GRADING=1` 启用链式编排，否则单步 LLM |
| 教师任务权限 | 任务列表/提交/批改/导出：**仅 `tasks.created_by`**；课程/教学班管理仍用 `teacherOwnsCourse` / `teacherManagesTeachingClass` |
| AI 批改 Worker 独立进程 | HTTP cluster 不入队消费；systemd `smart-grading-grading-worker` 运行 `gradingBullmqWorker.js` |
| BullMQ item-level 调度 | 一个 BullMQ job = 一个 `grading_job_item`；MySQL 仍为业务状态权威；`BULLMQ_ENABLED=0` 可回退 Legacy Redis List |
| LLM timeout / retry / backoff | `llmClient.js` 统一封装；环境变量 `AI_GRADING_TIMEOUT_MS` / `AI_GRADING_RETRY` / `AI_GRADING_BACKOFF_MS` |
| RAG / 任务上下文缓存 | 批量批改复用 `grading:rag:{teacherId}:{taskId}:{hash}` 与 `grading:taskContext:{taskId}`，任务/KB 更新时失效 |
| 知识图谱与批改解耦 | 批改主链路不阻塞 KG；可选 `KG_ASYNC_AFTER_GRADING_JOB=1` 在 job 完成后异步构建 |
| Socket.IO Redis 适配器 | 多 Worker 下跨进程广播；键前缀 `SOCKET_IO_REDIS_KEY` |
| LLM 配置入库 | 密钥不进 `.env`，管理端「系统设置」写入 `system_config` |
| 登录态 sessionStorage | Token 仅存当前浏览器会话，关窗后需重新登录 |
| 验证码 / 找回密码依赖 Redis | `captchaService`、`passwordResetService` 需 Redis 可用 |
| 管理员明文密码字段 | `password_plain` 便于实训账号分发；创建/改密时同步写入 |

## 2.7 相关文档

- 部署实施 → [04-deployment.md](./04-deployment.md)
- 环境变量 → [05-configuration.md](./05-configuration.md)
