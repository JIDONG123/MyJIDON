# 12 — 在线实训 / 代码运行检查（实施规格）

> **状态**：方案已认可（2026-06-04），待分 Phase 开发。  
> **原则**：不破坏实训中心 / 任务 / AI 批改 / 复核 / 报告主流程；不改 AI JSON 结构；不改权限模型；学生代码不在 Express 主进程执行。

---

## 1. 模块定位

| 模块 | 路由前缀 | 场景 |
|------|----------|------|
| **实训中心**（现有） | `/student/tasks` | 周期任务、多格式上传、正式批改 |
| **在线实训**（新增） | `/student/online-practice` | 课堂即时编码、试运行、可选提交到任务 |
| **代码运行检查**（新增） | `/api/code-run` | 任务提交后自动/手动编译运行，作 AI/教师辅助证据 |

与现有 **题库 Python 试运行**（`qbCodeRunner.js`，Express 内 spawn）**不共用执行路径**；二期可统一到 Code Runner Worker。

---

## 2. 架构

```
Express API ──► code_run_jobs (MariaDB) ──► Redis List (sg:code_run:jobs)
                                                    │
                                                    ▼
                              codeRunnerWorker.js（独立进程 / systemd）
                                                    │
                         ┌──────────────────────────┴──────────────────────────┐
                         ▼                                                      ▼
                 DockerRunnerAdapter (本地)                          HostRunnerAdapter (龙芯)
                 python/node/gcc/java 镜像                            code_runner 用户 + timeout
                         │                                                      │
                         └──────────────────────► code_run_results ◄───────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    ▼                               ▼                               ▼
           append workText (AI)            教师批改工作台 UI                  学生成绩报告 UI
           （不改 JSON schema）              只读折叠面板                        只读折叠面板
                    │
                    ▼
           grading_jobs（可选：运行完成后再入队）
```

---

## 3. 数据库

**迁移文件**：`backend/sql/migrations/004_code_runner_online_practice.sql`

| 表 / 列 | 说明 |
|---------|------|
| `online_practice_templates` | 教师课堂练习模板 |
| `online_practice_attempts` | 学生练习实例（每模板每生一条） |
| `code_run_jobs` | 异步运行任务 |
| `code_run_results` | stdout/stderr/编译日志/耗时 |
| `tasks.code_run_*` | 可选开关，**默认 0** |
| `submissions.code_run_result_id` | 最新运行结果指针 |

应用迁移：重启 backend 时 `bootstrap.js` 自动执行（已加入 `migrationList.js`）。

---

## 4. 环境变量

见根目录 `.env.example` §「代码运行 Worker」。摘要：

| 变量 | 默认 | 说明 |
|------|------|------|
| `CODE_RUNNER_ENABLED` | `0` | 总开关；0 时隐藏 UI、API 503 |
| `CODE_RUNNER_MODE` | `docker` | `docker` \| `host` |
| `CODE_RUNNER_JOBS_ROOT` | `/var/lib/smart-grading/code-runner/jobs` | host 模式 job 目录 |
| `CODE_RUNNER_USER` | `code_runner` | host 执行用户 |
| `CODE_RUNNER_QUEUE_KEY` | `sg:code_run:jobs` | Redis 队列 |
| `CODE_RUNNER_STALE_MINUTES` | `10` | running 孤儿回收 |
| `CODE_RUNNER_*_IMAGE` | 见 example | Docker 镜像 |

**龙芯 host 模式**（您已准备）：Python / Node / gcc / Java / timeout / zip、`code_runner` 用户、jobs 目录 `700`。

**本地 Docker**（您已准备）：`python:3.11-slim`、`node:20-slim`、`gcc:13`、`eclipse-temurin:21-jdk`。

---

## 5. 支持语言（第一版）

| 语言 | 入口文件 | 编译 | 运行 |
|------|----------|------|------|
| Python | `main.py` | — | `python3 -I -B main.py` |
| Node.js | `main.js` | — | `node main.js` |
| C | `main.c` | `gcc -O2 -std=c11 main.c -o main` | `./main` |
| C++ | `main.cpp` | `g++ -O2 -std=c++17 main.cpp -o main` | `./main` |
| Java | `Main.java` | `javac Main.java` | `java Main` |

Zip 提交：解压后按上表查找入口；找不到 → `failed` + 明确 `summary`。

---

## 6. API 规格

### 6.1 代码运行 `/api/code-run`

| 方法 | 路径 | 角色 | 请求体 / 说明 |
|------|------|------|----------------|
| POST | `/jobs` | student, teacher | `{ language, sourceCode?, submissionId?, practiceAttemptId?, stdin? }` |
| GET | `/jobs/:id` | 相关用户 | job 状态 |
| GET | `/jobs/:id/result` | 相关用户 | 完整 result |
| POST | `/jobs/:id/cancel` | student, teacher | 取消 pending |
| GET | `/jobs` | teacher, admin | `?taskId=&submissionId=&status=` |

**POST /jobs 响应（202）**：

```json
{
  "success": true,
  "data": {
    "jobId": 1,
    "status": "pending",
    "async": true
  }
}
```

**GET /jobs/:id/result 响应**：

```json
{
  "success": true,
  "data": {
    "jobId": 1,
    "status": "completed",
    "result": {
      "compileExitCode": 0,
      "runExitCode": 0,
      "stdout": "Hello\n",
      "stderr": "",
      "timedOut": false,
      "durationMs": 120,
      "entryFileFound": true,
      "summary": "运行通过 (exit 0)"
    }
  }
}
```

### 6.2 在线实训 `/api/online-practice`

| 方法 | 路径 | 角色 | 说明 |
|------|------|------|------|
| GET | `/templates` | teacher, student | 列表（教学班/行政班过滤） |
| POST | `/templates` | teacher | 创建 |
| GET | `/templates/:id` | teacher, student | 详情（学生无 solution_hint） |
| PUT | `/templates/:id` | teacher | 更新 |
| POST | `/templates/:id/publish` | teacher | draft → published |
| POST | `/templates/:id/close` | teacher | → closed |
| GET | `/attempts/mine` | student | 我的练习 |
| GET | `/attempts/:id` | student | 单条 attempt |
| PUT | `/attempts/:id/source` | student | 保存代码（不运行） |
| POST | `/attempts/:id/run` | student | 保存 + 创建 code_run_job |
| POST | `/attempts/:id/submit-to-task` | student | `{ taskId }` → 写 submissions |

权限：**复用** `studentCanAccessTask`、`teacherOwnsTaskForGrading`、教学班成员查询；不新增 role。

### 6.3 与现有 API 挂钩

| 钩子 | 行为 |
|------|------|
| `POST /api/submissions` | 若 `task.code_run_enabled=1`，成功后异步 `createCodeRunJobForSubmission` |
| `runSingleGrading` | 组装 `workText` 时 append `CODE_RUN_MARKER` 块（见 §7） |
| `POST /api/grading/ai/:id` | 若启用运行检查且 `grade_after_run=1` 且无 result，返回 400「等待运行检查」或内部排队 |

---

## 7. AI / 报告接入（不改 JSON）

在 `gradingQueue.runSingleGrading` 中，若存在 `code_run_results`：

```
---------- 代码运行检查 ----------
语言：python
入口：main.py
编译：成功 (exit 0)
运行：exit 0，耗时 120ms
标准输出：
...
标准错误：
...
结论：运行通过
```

- **不**向 `verification_result` 写固定新键。
- LLM 自行归纳；schema 与 Staging 一致。

UI：`Grading.vue`、`ResultDetail.vue` 只读展示 `code_run_results`；PDF 可选追加一段摘要。

---

## 8. 前端页面

### 8.1 路由（`frontend/src/router/index.js`）

| 路由 | 组件 |
|------|------|
| `/student/online-practice` | `OnlinePracticeList.vue` |
| `/student/online-practice/:templateId` | `OnlinePracticeWorkbench.vue` |
| `/teacher/online-practice` | `OnlinePracticeTemplates.vue` |
| `/teacher/online-practice/create` | `OnlinePracticeTemplateForm.vue` |
| `/teacher/online-practice/:id/edit` | `OnlinePracticeTemplateForm.vue` |

### 8.2 侧栏

- 学生：`StudentLayout` 在「实训中心」下增加 **在线实训**。
- 教师：`TeacherLayout` 增加 **在线实训模板**（或放在任务菜单下）。

### 8.3 组件

| 组件 | 职责 |
|------|------|
| `CodeEditor.vue` | Monaco，language 切换 |
| `CodeRunOutputPanel.vue` | stdout / stderr / compile |
| `CodeRunStatusBadge.vue` | 状态徽章 |
| `CodeRunJobProgress.vue` | Socket 订阅（对齐 GradingJobProgressPanel） |

### 8.4 现有页面增量

| 页面 | 改动 |
|------|------|
| `TaskForm.vue` | 代码运行检查折叠区 |
| `TaskDetail.vue` | 启用时深链在线实训 |
| `Grading.vue` / `ResultDetail.vue` | 运行结果折叠区 |
| 教师 `Submissions.vue` | `code_run_summary` 列 |

---

## 9. Worker 与部署

### 9.1 进程

```powershell
# 开发（不要用 nodemon）
cd backend
npm run worker:code-runner

# 生产
node workers/codeRunnerWorker.js
```

### 9.2 systemd（龙芯 VM，实施时添加）

单元名建议：`smart-grading-code-runner.service`  
依赖：MariaDB、Redis、网络；**不**依赖 Neo4j。

与现有三进程关系：

| 终端 / 单元 | 进程 |
|-------------|------|
| backend | API cluster |
| worker:grading | AI 批改 |
| **worker:code-runner** | **代码运行** |
| frontend / nginx | 静态 |

### 9.3 安全（实施必检）

- [ ] Express 无 `spawn` 学生代码路径（`qbCodeRunner` 除外，保持隔离）
- [ ] host：`runuser -u code_runner` 或等价
- [ ] Docker：`--network none`、内存/CPU 限制
- [ ] 每 job 独立目录，结束后删除
- [ ] timeout + 输出上限
- [ ] 静态正则拦截危险调用（Python/Node MVP）
- [ ] Zip 走 `safeZipArchive` 白名单

---

## 10. 实施 Phase 与检查清单

### Phase A — 基础设施（Backend）

- [x] 迁移 `004_code_runner_online_practice.sql` 应用成功
- [x] `codeRunJobQueue.js`（对标 gradingJobQueue）
- [x] `codeRunProcessor.js` + Docker/Host adapter
- [x] `workers/codeRunnerWorker.js`
- [x] `npm run worker:code-runner` script
- [x] stale running 回收
- [x] `.env.example` 文档化
- [x] `smoke:code-runner` Python inline 验证

### Phase B — API + 在线实训 CRUD

- [x] `routes/codeRunRoutes.js` + `controllers/codeRunController.js`
- [x] `services/codeRunService.js` API 层（create/list/get/result/cancel + accessControl）
- [x] `middleware/codeRunnerGate.js`（ENABLED=0 → 503）
- [x] `app.js` 挂载 `/api/code-run`
- [x] `smoke:code-runner-api`（POST → Redis → Worker → GET result）
- [x] `routes/onlinePracticeRoutes.js` + `services/onlinePracticeService.js`
- [x] `smoke:online-practice-api`（模板 CRUD + attempt + run）
### Phase C — 前端在线实训

- [x] 学生 `/student/online-practice` 列表 + 工作台
- [x] 教师 `/teacher/online-practice` 模板列表 + 表单
- [x] `CodeEditor` / `CodeRunOutputPanel` / `CodeRunStatusBadge`
- [x] 侧栏菜单（`probeCodeRunnerEnabled` 探测 503 时隐藏）
- [x] TaskForm / Grading 增量（Phase D）

### Phase C — 前端在线实训

- [x] 学生侧栏 + 列表 + 工作台
- [x] 教师模板 CRUD
- [x] 轮询 GET /jobs/:id（MVP）

### Phase D — 任务集成 + AI + 报告

- [x] TaskForm 开关（`code_run_enabled` / timeout / grade_after_run）
- [x] submit 后自动 code run（`codeRunSubmissionService`）
- [x] workText append（`CODE_RUN_MARKER` 块）
- [x] Grading / ResultDetail / Submissions 展示
- [x] 5 语言执行器（Docker + Host，`languageRunnerCore`）
- [ ] host 模式龙芯验证

### Phase E — 回归与文档

- [ ] `CODE_RUNNER_ENABLED=0` 时 Staging 7 条 E2E 无回归
- [ ] `regression:teacher-permissions` 全绿
- [ ] 更新 `02-architecture.md`、`04-deployment.md`、`05-configuration.md`
- [ ] Staging 补测条目（可选 code run 演示任务）

---

## 11. MVP 范围与排除项

**MVP 必做**：见 Phase A–D。

**不做（第一版）**：SPJ 判题、多文件工程、交互 stdin、替换 qb 试运行、修改 verification JSON schema、K8s 容器池。

---

## 12. Staging 风险控制

| 措施 | 说明 |
|------|------|
| `CODE_RUNNER_ENABLED=0` | 默认关闭，不影响已通过 E2E |
| `tasks.code_run_enabled=0` | 种子任务不启用 |
| 独立 Worker / 队列 | 不修改 grading worker |
| Feature flag 隐藏菜单 | 未启用时不显示「在线实训」 |
| 答辩 | 主流程仍走原 7 条 E2E；代码运行为附加演示 |

---

## 13. 相关文件（规划）

| 路径 | 说明 |
|------|------|
| `backend/sql/migrations/004_code_runner_online_practice.sql` | 迁移草案 |
| `backend/workers/codeRunnerWorker.js` | Worker 入口（待建） |
| `backend/utils/codeRunProcessor.js` | 处理器（待建） |
| `backend/adapters/dockerRunnerAdapter.js` | Docker（待建） |
| `backend/adapters/hostRunnerAdapter.js` | Host（待建） |
| `deploy/systemd/smart-grading-code-runner.service` | systemd Code Runner Worker |

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-06-04 | 方案认可；实施规格 + migration 004 草案 |
| 2026-05-19 | **Phase C 前端**：学生/教师在线实训页面 + codeRunner 组件 |

---

## Phase A 实施记录（2026-05-19）

### 已交付文件

| 路径 | 说明 |
|------|------|
| `backend/utils/codeRunConfig.js` | 环境变量与 jobs 根目录 |
| `backend/utils/codeRunJobQueue.js` | Redis List 队列（对标 gradingJobQueue） |
| `backend/utils/codeRunJobPaths.js` | 独立 job 目录创建/清理 |
| `backend/utils/codeRunLanguageSpec.js` | 入口文件、Python 静态拦截、摘要 |
| `backend/utils/processRunner.js` | timeout + 输出上限 spawn 封装 |
| `backend/utils/codeRunProcessor.js` | 单 job 执行 + stale running 回收 |
| `backend/adapters/dockerRunnerAdapter.js` | Docker 模式（`--network none`） |
| `backend/adapters/hostRunnerAdapter.js` | Host 模式（runuser + timeout） |
| `backend/adapters/index.js` | adapter 工厂 |
| `backend/services/codeRunService.js` | inline job 创建 + 入队（无 HTTP） |
| `backend/workers/codeRunnerWorker.js` | 独立 Worker 进程 |
| `backend/scripts/code-runner-smoke-test.js` | Python smoke test |

**未改动**：Express 路由、前端、任务发布、AI 批改、`grading_results` JSON。

### 运行方式

```powershell
# 终端 1 — Worker（生产勿用 nodemon）
cd backend
$env:CODE_RUNNER_ENABLED='1'
$env:CODE_RUNNER_MODE='docker'   # 龙芯 VM 改为 host
npm run worker:code-runner

# 终端 2 — Smoke test
# 完整队列路径（需 Redis + Worker 已启动）：
$env:CODE_RUNNER_ENABLED='1'
$env:NODE_ENV='development'
npm run smoke:code-runner

# 无 Redis 本地验 adapter（跳过队列，直接 processor，仅 Phase A 调试）：
$env:CODE_RUNNER_ENABLED='1'
npm run smoke:code-runner -- --sync
```

### Phase A 实测结果（本机 Windows + Docker）

| 用例 | job status | 说明 |
|------|------------|------|
| `print("Hello from Code Runner")` + `6*7` | `completed` | stdout 含 Hello 与 42，~522ms |
| `raise ValueError(...)` | `failed` | exit 1，summary=运行失败 |

**真实异步闭环（2026-05-19，Redis + 独立 Worker，非 `--sync`）**

| job_id | 入队 | Worker 消费 | result_id | status | stdout |
|--------|------|-------------|-----------|--------|--------|
| 4 | `redis` LPUSH | 是 | 3 | `completed` | `Hello from Code Runner\n42\n` |
| 5 | `redis` LPUSH | 是 | 4 | `failed` | `before error\n` + stderr traceback |

Redis 队列 `sg:code_run:jobs` 消费后长度 0。

迁移 `004_code_runner_online_practice.sql` 已自动应用；`code_run_jobs` / `code_run_results` 表可用。

### 回归（CODE_RUNNER_ENABLED=0）

| 脚本 | 结果 |
|------|------|
| `npm run regression:teacher-permissions` | PASS |
| `npm run test:grading-contract` | PASS（4/4） |

Express 主进程未引用任何 `codeRun*` 模块；默认开关为 0，Staging 主流程不受影响。

### 风险与限制

1. **沙箱非完整**：Docker `--network none` + 内存/CPU 限制 + Python 静态正则；非强隔离，生产需监控镜像与资源。
2. **无 Redis 时**：多进程 Worker 无法消费内存队列；生产必须 `REDIS_ENABLED=1`；本地可用 `--sync` 验 adapter。
3. **Host 模式**：龙芯需预装 `runuser`、`timeout`、`python3` 及 `code_runner` 用户；Windows host fallback 仅开发用。
4. **Phase A 语言**：仅 inline Python；Node/C/C++/Java 与 zip 留 Phase D。
5. **qbCodeRunner**：题库 Python 试运行仍在 Express 内，与 Code Runner 路径独立（Phase B+ 可评估统一）。

### Phase B 进入条件（建议）

- [x] 本机或 Staging 在 **Redis + 独立 Worker** 下跑通 `smoke:code-runner`（非 `--sync`）— 2026-05-19 job #4/#5
- [ ] 龙芯 VM 上 host 模式 smoke 通过（可选，可与 B 并行）
- [ ] 确认答辩演示仍保持 `CODE_RUNNER_ENABLED=0` 直至 B/C 前端就绪

满足后可进入 Phase B：`/api/code-run/*` 路由 + accessControl，仍不接入任务与 AI。

---

## Phase B 实施记录（2026-05-19）

### API 端点（`/api/code-run`）

| 方法 | 路径 | 角色 |
|------|------|------|
| POST | `/jobs` | admin, teacher, student |
| GET | `/jobs` | admin, teacher |
| GET | `/jobs/:id` | admin, teacher, student（须有权） |
| GET | `/jobs/:id/result` | 同上 |
| POST | `/jobs/:id/cancel` | 同上（仅 pending） |

`CODE_RUNNER_ENABLED=0` 时全部返回 **503** + `CODE_RUNNER_DISABLED`。

### API smoke（Redis + Worker + HTTP）

```powershell
# 终端 1
$env:CODE_RUNNER_ENABLED='1'; npm run worker:code-runner
# 终端 2
$env:CODE_RUNNER_ENABLED='1'; npm run dev
# 终端 3
$env:CODE_RUNNER_ENABLED='1'; npm run smoke:code-runner-api
```

实测 job #6：`POST 202` → `transport: redis` → Worker 消费 → `GET result` → `completed`，stdout 含 `API smoke OK`。

### 未接入（刻意保留）

- 任务发布 / 提交后自动 code run
- AI `workText` 注入
- 在线实训 `/api/online-practice/*`（下一批与 Phase C 前端）

---

## Phase B+ 实施记录（2026-05-19）

### API 端点（`/api/online-practice`）

| 方法 | 路径 | 角色 | 说明 |
|------|------|------|------|
| GET | `/templates` | admin, teacher, student | 列表（学生仅 published + 范围） |
| POST | `/templates` | admin, teacher | 创建 draft |
| GET | `/templates/:id` | admin, teacher, student | 详情（学生无 solutionHint） |
| PUT | `/templates/:id` | admin, teacher | 更新 |
| POST | `/templates/:id/publish` | admin, teacher | 发布 |
| POST | `/templates/:id/close` | admin, teacher | 关闭 |
| POST | `/templates/:id/open` | student | 获取/创建 attempt |
| GET | `/attempts/mine` | student | 我的练习 |
| GET | `/attempts/:id` | student | 单条（非本人 403） |
| PUT | `/attempts/:id/source` | student | 保存代码 |
| POST | `/attempts/:id/run` | student | **202**，内部调用 `codeRunService.createJobFromBody` |

`CODE_RUNNER_ENABLED=0` 时全部 **503**（与 `/api/code-run` 一致）。

### 权限

- 教师：仅管理 `created_by` 本人 / 所管教学班 / 所管行政班的模板
- 学生：仅见已发布且属于其教学班或行政班的模板；attempt 仅本人

### Smoke

```powershell
$env:CODE_RUNNER_ENABLED='1'; npm run smoke:online-practice-api
```

覆盖：教师创建→发布、学生列表/详情、其他学生 403、open/save/run、code-run 结果 completed。

### 未接入

- `submit-to-task`（在线实训一键提交到正式任务）
- 5 语言执行器（Node/C/C++/Java 仍仅配置项，执行路径 Phase A 仅 Python）
- 龙芯 host 模式现场 smoke

---

## Phase D 实施记录（2026-05-19）

### 后端钩子

| 位置 | 行为 |
|------|------|
| `POST /api/submissions` | 成功后 `enqueueSubmissionCodeRun(submissionId)` |
| `gradingQueue.runSingleGrading` | `workText` 追加 `---------- 代码运行检查 ----------` 块 |
| `gradingJobService.createSingleJob` | `grade_after_run=1` 且无结果 / 运行中时返回 400 |
| `taskController` create/update/get | `code_run_enabled` / `code_run_language` / `code_run_config` |
| `codeRunProcessor.saveResult` | 回写 `submissions.code_run_result_id` / `code_run_summary` |

新增模块：

- `backend/utils/taskCodeRunConfig.js`
- `backend/utils/codeRunWorkText.js`
- `backend/services/codeRunSubmissionService.js`

### 前端增量

| 页面 | 改动 |
|------|------|
| `TaskForm.vue` | 发布设置中「代码运行检查」折叠区（`probeCodeRunnerEnabled` 门控） |
| `Grading.vue` | `SubmissionCodeRunPanel` |
| `ResultDetail.vue` | 同上（学生报告） |
| `Submissions.vue` | `code_run_summary` 列（任务启用时显示） |

`npm run build` 已通过。

---

## 五语言执行器收口（2026-06-05）

### 架构

- 共享核心：`backend/adapters/languageRunnerCore.js`（compile/run 分步、timeout、输出截断）
- Docker：`dockerRunnerAdapter.js`（`executionPlatform: linux`，容器内不用 GNU timeout，由外层 `runWithLimits` 控时）
- Host：`hostRunnerAdapter.js`（Linux 用 `runuser` + `timeout`；Windows 开发 fallback）
- 物化：`backend/services/codeRunMaterialize.js`（单文件 + zip 入口查找）
- 任务 API：`code_run_language` **仅允许 python**（其他语言 400）；inline / 在线实训 API 允许五语言

### Smoke

```powershell
cd backend
$env:CODE_RUNNER_ENABLED='1'
$env:CODE_RUNNER_MODE='docker'   # 或 host
npm run smoke:code-runner-languages -- --sync
# 真实异步：另开 worker:code-runner，去掉 --sync
```

### 入口文件

| 语言 | 入口 |
|------|------|
| Python | main.py |
| Node.js | main.js |
| C | main.c → 编译为 main |
| C++ | main.cpp → 编译为 main |
| Java | Main.java，主类 Main |

失败类型：`compile_error` / `runtime_error` / `timeout` / `entry_missing`（写入 `error_message` 前缀 `[kind]`）

### 真实异步闭环（2026-06-05，Redis + 独立 Worker，非 `--sync`）

| job_id | lang | transport | Worker 消费 | result_id | status |
|--------|------|-----------|-------------|-----------|--------|
| 26 | python | redis | ✓ | 24 | completed |
| 27 | node | redis | ✓ | 25 | completed |
| 28 | c | redis | ✓ | 26 | completed |
| 29 | cpp | redis | ✓ | 27 | completed |
| 30 | java | redis | ✓ | 28 | completed |

Redis 队列 `sg:code_run:jobs` 消费后长度 **0**。`CODE_RUNNER_ENABLED=0` 时 `POST /api/code-run/jobs` → **503** `CODE_RUNNER_DISABLED`。

### 联调提示

1. 任务编辑页开启「代码运行检查」并保存。
2. 学生提交 `main.py` 或含 `.py` 的 zip。
3. 确认 `code-runner` Worker 消费且 `submissions.code_run_summary` 更新。
4. 教师发起 AI 批改：若勾选「须先完成运行」，运行完成前应返回 400。

---

## Phase C 实施记录（2026-05-19）

### 页面与路由

| 端 | 路由 | 组件 |
|----|------|------|
| 学生 | `/student/online-practice` | `OnlinePracticeList.vue` |
| 学生 | `/student/online-practice/:templateId` | `OnlinePracticeWorkbench.vue` |
| 教师 | `/teacher/online-practice` | `OnlinePracticeTemplates.vue` |
| 教师 | `/teacher/online-practice/create` | `OnlinePracticeTemplateForm.vue` |
| 教师 | `/teacher/online-practice/:id/edit` | `OnlinePracticeTemplateForm.vue` |

### 组件与 API

- `components/codeRunner/CodeEditor.vue`（等宽 textarea，Phase C 未引入 Monaco 以控制依赖）
- `components/codeRunner/CodeRunOutputPanel.vue`
- `components/codeRunner/CodeRunStatusBadge.vue`
- `api/onlinePractice.js` / `api/codeRun.js`
- `composables/useCodeRunnerFeature.js` — 探测 `/api/online-practice/templates` 非 503 则显示侧栏

### 本地联调

```powershell
# 后端 + Worker（CODE_RUNNER_ENABLED=1）
# 前端
cd frontend && npm run dev
# 浏览器：http://localhost:5173
# 教师 test-teacher-01 → 在线实训模板 → 发布
# 学生 test-student-01 → 在线实训 → 运行
```

`npm run build` 已通过。
