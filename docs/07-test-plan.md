# 龙芯智训·校企实训智慧评价平台 — 测试与回归清单

## 0. 环境准备

1. 数据库可连（`.env` 中 `DB_*`）
2. 迁移已执行：`migration_curriculum_teaching_v1.sql`（启动后端或 `bootstrapDatabase` 自动跑）
3. 写入测试数据：

```powershell
powershell -File scripts/run-seed-test-data.ps1
# 或
cd backend && npm run seed:test
```

4. 启动后端与前端，配置 LLM 后可测真实 AI 批改（种子数据已含模拟批改 JSON）

### 测试账号（种子新增，密码均为 `123456`）

| 角色 | 账号 |
|------|------|
| 企业导师 | `test-enterprise-01`、`test-enterprise-02` |
| 教师 | `test-teacher-01`、`test-teacher-02` |
| 学生 | `test-student-01` … `test-student-08` |

保留账号不变：`admin/admin123`，`teacher1`/`teacher2`/`student1`–`student5` 仍为 `123456`。

### 测试文件位置

`backend/uploads/test-seed/`（txt、md、zip）

---

## 1. 管理员端

- [ ] 登录 `admin` / `admin123`
- [ ] **课程监管**：专业 `测试-软件技术`、学期 `测试-2025-2026学年第二学期`、三门课程
- [ ] **教学班监管**：三个 `测试-* 实训 1 班`，可进成员页
- [ ] **项目模板**：三个 `测试-` 模板
- [ ] **企业账号**：`test-enterprise-01/02` 已授权教学班
- [ ] **任务管理**：可见 `测试-` 任务，发布对象/课程列正确
- [ ] **报表统计**：行政班 / 教学班 / 课程 scope 有数据

---

## 2. 教师端

- [ ] `teacher1` 或 `test-teacher-01` / `123456`
- [ ] **我的课程**、**我的教学班**
- [ ] **从模板发布任务**（种子已生成，可再 spawn 一条）
- [ ] **发布任务向导**：五步步骤条、右侧发布摘要、校验后下一步
- [ ] **成果批改 / 提交列表**：已提交未 AI 批改 → 状态 **待批改**（非空白/「没有批改」）
- [ ] **AI 批改复核工作台**（`/teacher/grading/:id`）：
  - [ ] 首屏可见：左提交摘要、中智能核查、右修正+复核（sticky）
  - [ ] 摘要区「查看全文 / 查看完整代码」抽屉；OCR 全文在下方折叠区
  - [ ] 步骤完成度为 `n / 总数`；步骤相关得分（若有）单独标注 `/100`
  - [ ] 教师逐步修正 +「保存核查修正」；最终复核分默认 AI 分；提交前确认
- [ ] **AI 批改**（需 LLM 配置）与 **人工复核**
- [ ] **AI 异步批改**：点击后不阻塞页面；右下角进度卡片；**批改任务**列表/详情
- [ ] **通知中心**：批改完成/部分失败/全部失败/取消 → 点击跳转批改任务详情
- [ ] **成绩与报表** + **批量导出** Excel
- [ ] **PDF 导出**（行政班 / 教学班 / 课程 scope）
- [ ] **能力画像/薄弱点**：选 `软件2101班` 有维度数据

---

## 3. 学生端

- [ ] `student1`：可见 **旧** `测试-行政班综合实训` + **新** 教学班任务
- [ ] 任务列表无重复、标签区分行政班/教学班
- [ ] `test-student-01` 提交/查看成绩
- [ ] 上传新文件（可选）
- [ ] **成绩详情**、**个人 PDF**（评价报告布局、核查与教师评语）

---

## 4. 企业导师端

- [ ] `test-enterprise-01` / `123456`
- [ ] 首页按教学班分组可见 `测试-Java Web 实训 1 班` 等
- [ ] 进入任务提交列表
- [ ] **企业评分**（`enterprise_collab` 场景任务）

---

## 5. 回归测试矩阵

| 场景 | 验证点 |
|------|--------|
| 旧 `class_id` 链路 | `测试-行政班综合实训` → student1/2 提交 → 批改 → 统计/导出 |
| 新 `teaching_class_id` | 三门课模板任务 → 教学班学生 → 教师/企业批改 → 报表 |
| 学生任务 UNION | 同一学生只见各自范围任务，无重复行 |
| 教师越权 | 非本班/非创建教学班任务不可见（教学班列表按 `created_by` 过滤） |
| 企业越权 | 未授权教学班不可见 |
| 导出 | Excel/PDF 含课程/教学班字段 |
| AI JSON | `dimension_scores`、`verification_result` 页面正常；教师工作台首屏核查与修正 |
| 批改状态 UI | 无 `grading_results` 的提交在列表显示「待批改」 |
| AI 异步 job | 旧 `POST /grading/ai/:id`、`POST /grading/batch/:taskId` 返回 `async/status/jobId`；dedup 不重复入队 |
| batch-progress | `GET /grading/batch-progress/:batchId` 旧字段 `total/grading/failed/done` 保留；新 job 含 `jobId` |
| 通知 grading_job | `ref_type=grading_job`；type=`grade_job_completed/partial/failed/cancelled` |

---

## 6. 自动化（辅助）

```powershell
powershell -File scripts/run-seed-test-data.ps1
cd backend && npm run seed:test:apply   # 写库；默认 seed:test 为 SAFE 提示
cd backend && npm run regression:grading
# 默认 SAFE MODE：不创建真实 AI 批改任务、不入 BullMQ、不调用 LLM
# LIVE AI（仅专用开发库，可能覆盖 AI 结果）：
# npm run regression:grading:live
# 或 PowerShell：$env:REGRESSION_LIVE_AI="1"; $env:REGRESSION_ALLOW_MUTATION="1"; npm run regression:grading
# HTTP 层（后端已启动，须 LIVE 模式才 POST 批改）：
# $env:REGRESSION_HTTP=1; npm run regression:grading:live

cd backend && npm run test:grading-contract
```

`regression:grading` 默认 **SAFE MODE**：权限/门禁/dryRun 资格检查、重复拦截逻辑、forceRegrade 逻辑、`grading_results` JSON 只读校验；**不**写入 `grading_jobs` / `grading_job_items`。通知中心与 HTTP POST 批改仅在 `regression:grading:live` 下运行。误创建的测试 job 可在管理端按创建时间识别，勿在演示库运行 live 模式。

仅模块加载 + 前端 build 见 `scripts/verify-curriculum-phase.ps1`，不替代上表手工回归。

---

## 7. 种子数据摘要

| 类型 | 标识 |
|------|------|
| 专业 | `TEST-SW`、`TEST-AI` |
| 学期 | `测试-2025-2026学年第二学期` |
| 课程 | `TEST-JAVA-WEB`、`TEST-VUE3`、`TEST-LLM-APP` |
| 教学班 | `TEST-JW-01`、`TEST-VUE-01`、`TEST-LLM-01` |
| 旧任务 | `测试-行政班综合实训（旧 class_id 链路）` |
| 新任务 | `测试-任务-测试-*`（每模板 1 条） |
