# 09 — 教师端关键页面与 UI 说明

> 本文档描述**前端展示与交互**（不含 API / 数据结构变更）。业务数据仍来自 `grading_results`、`verification_result`、`verification_teacher_override` 等既有字段。

## 9.1 路由与入口

| 路由 | 页面 | 说明 |
|------|------|------|
| `/teacher/grading-queue` | 成果批改 | 跨任务提交列表，入口「批改」 |
| `/teacher/submissions/:taskId` | 提交列表 | 单任务下全部提交 |
| `/teacher/grading/:submissionId` | **AI 批改复核工作台** | 智能核查 + 教师修正 + 最终复核 |
| `/teacher/grading-jobs` | 批改任务 | 异步 AI job 列表 |
| `/teacher/tasks/create` | 发布任务 | 五步向导 |
| `/teacher/tasks/:id/edit` | 编辑任务 | 同上向导 |

从「提交列表 / 成果批改」进入批改详情时，可通过 query `className` 在顶栏展示班级名（无则显示 `—`）。

---

## 9.2 批改状态文案（列表统一）

工具：`frontend/src/utils/gradingStatusDisplay.js`

| 后端 `status` | 列表/详情展示 | 标签色 |
|---------------|---------------|--------|
| `null`（已提交、尚无 `grading_results`） | **待批改** | warning |
| `pending` | 待批改 | warning |
| `ai_grading` | AI批改中 | warning |
| `ai_failed` | 批改失败 | danger |
| `ai_graded` | AI已批改 | warning |
| `human_graded` | 人工已复核 | success |

**说明：** 学生已提交但 LEFT JOIN 无批改记录时，`status` 为 `null`，不得显示「没有批改」或空白。

涉及页面：成果批改、提交列表、学生提交/成绩列表、教师/管理员批改详情。

---

## 9.3 AI 批改复核工作台（`/teacher/grading/:id`）

**文件：** `frontend/src/views/teacher/Grading.vue`

### 信息层级

```
┌─ 顶部任务摘要 ─────────────────────────────────────────┐
│ 任务名、学生、班级、批改状态、AI/教师/综合分、查重、操作 │
└────────────────────────────────────────────────────────┘
┌─ 首屏三栏（核心）──────────────────────────────────────┐
│ 左：学生提交摘要 │ 中：智能核查结果 │ 右：修正 + 复核   │
└────────────────────────────────────────────────────────┘
┌─ 原始材料与深度分析（默认折叠）────────────────────────┐
│ 全文附件 / OCR / AI评语详情 / LangChain / 图谱 / 雷达  │
└────────────────────────────────────────────────────────┘
```

### 首屏三栏

| 栏位 | 内容 | 组件 |
|------|------|------|
| **左** | 学生姓名、班级、提交时间、附件、**提取摘要**（截断）；按钮「查看全文」「查看完整代码」「预览附件」 | `SubmissionSummaryCard.vue` |
| **中** | 与任务要求对比、逻辑与错误识别、**步骤完成度总览**、核查摘要、**维度得分简表**；视觉强调（蓝色边框） | 内嵌 `VerificationStepChecklistPanel` `variant="summary"` |
| **右 sticky** | **教师修正核查**（逐步骤改判 + 保存核查修正）+ **最终复核**（AI 建议分、教师分、评语、快捷评语、草稿/提交/清除） | `VerificationStepChecklistPanel` `variant="correction"` + 复核表单 |

右栏 `position: sticky`，滚动时修正与复核操作保持可见；步骤卡片过多时右栏内可滚动（`max-height: 52vh`）。

### 下方二级信息（`el-collapse`，默认收起）

- 学生提交全文与附件 — `SubmissionWorkDisplay`（长文可折叠）
- 图片识别 OCR 全文 — `VlRecognitionPanel` `variant="report"`
- AI 批改详情 — 评语、问题分析、改进建议、校企标准、代码规范审查
- AI 深度分析过程 — `LangchainDeepPanel`
- 知识图谱参考 — `KgGradingEnhancePanel`
- 维度雷达图 — ECharts（展开时渲染）

### 教师复核交互（仅前端）

- 教师复核分默认带入 **AI 总分**（`total_score`）
- 与 AI 分相差 **>10 分** 时，提交前须在评语中说明原因
- 提交前二次确认；成功后提示「复核已完成，学生可在成绩与报告中查看结果」
- 草稿存浏览器 `localStorage`（键 `grading-review-draft-{submissionId}`），不写后端

### 未生成批改结果

无 `grading_results` 时仍展示提交摘要，提示「发起 AI 批改」；异步 job 与右下角 `GradingJobProgressPanel` 行为不变。

---

## 9.4 步骤核查与教师修正

**组件：** `frontend/src/components/VerificationStepChecklistPanel.vue`  
**工具：** `frontend/src/utils/verificationStepUtils.js`

### 组件 variant

| variant | 用途 |
|---------|------|
| `full` | 完整（总览 + 对照 + 保存），兼容旧嵌入 |
| `summary` | 仅智能核查总览（中栏「步骤完成度」） |
| `correction` | 仅步骤对照与保存（右栏） |

### 智能核查总览指标

- 任务步骤总数、AI 确认完成、证据不足、教师已修正
- **步骤完成度**：`已完成数 / 步骤总数`（如 `3 / 6`）及百分比
- **步骤相关得分**（若有）：单独显示 `n / 100`，与完成**数量**区分，避免与总分混淆

### 单步骤 AI 判断文案（正式表述）

| 判断 | 展示 | 依据文案 |
|------|------|----------|
| 已完成 | 绿色 | 识别到相关证据，与步骤要求匹配 |
| 未完成 | 红色 | AI判断该步骤可能未完成 |
| 证据不足 | 橙色 | 未识别到明确证据，建议教师结合提交内容复核 |

### 教师修正保存

- 接口不变：`PATCH /api/grading/:submissionId/verification`（body 为 `verification_teacher_override` JSON）
- 字段：`stepOverrides`、`stepNotes`（逐步骤修正说明）、`logicIssueNotes`、`teacherNote`、`stepCompletenessScoreOverride`（无步骤清单时可选）
- 不改变 AI 原始 `verification_result` 文本

---

## 9.5 发布 / 编辑任务向导

**文件：** `frontend/src/views/teacher/TaskForm.vue`

五步：**基础信息 → 任务要求 → 评价规则 → 发布设置 → 确认发布**

- 自定义步骤条（非默认 `el-steps` error 态）：当前步高亮、已完成显示 ✓，仅点击「下一步」校验失败后才标警告
- 双栏：左侧表单 + 右侧「发布摘要 / 检查清单」
- 已完成步骤可点击回退；草稿可存本地（确认页）

---

## 9.6 相关学生端页面（同期 UI 优化）

| 路由 | 文件 | 要点 |
|------|------|------|
| `/student/tasks/:id` | `TaskDetail.vue` | 双栏：任务概览 +  sticky 提交区；步骤向导式提交 |
| `/student/results/:submissionId` | `ResultDetail.vue` | 实训评价报告布局；雷达图生命周期修复；教师评语多来源展示 |

学生端**不依赖**教师工作台布局，共用同一批改 API 与 JSON 结构。

---

## 9.7 关键前端文件索引

```
frontend/src/
├── views/teacher/
│   ├── Grading.vue              # AI 批改复核工作台
│   ├── GradingQueue.vue         # 成果批改列表
│   ├── Submissions.vue          # 任务提交列表
│   └── TaskForm.vue             # 任务发布向导
├── components/
│   ├── SubmissionSummaryCard.vue
│   ├── SubmissionWorkDisplay.vue
│   ├── VerificationStepChecklistPanel.vue
│   ├── VerificationTeacherOverridePanel.vue  # 管理员等场景仍可用
│   ├── VlRecognitionPanel.vue
│   └── LangchainDeepPanel.vue
└── utils/
    ├── gradingStatusDisplay.js
    └── verificationStepUtils.js
```

---

## 9.8 视觉规范（教务风格）

| 项 | 值 |
|----|-----|
| 页面背景 | `#F5F7FA` |
| 卡片 | 白底、圆角 12px、边框 `#E5EAF2`、轻阴影 |
| 主色 | `#1D5FD6` |
| 完成 / 成功 | `#16A34A` |
| 待确认 / 警告 | `#F59E0B` |
| 问题 / 危险 | `#DC2626` |

核查结果区：`panel-card--focus`；教师修正区：`panel-card--action`。

---

## 9.9 相关文档

- 批改流水线与 API → [02-architecture.md](./02-architecture.md) §2.4、grading_jobs
- 手工验收 → [07-test-plan.md](./07-test-plan.md) §2
- 需求 M06 → [06-requirements.md](./06-requirements.md) §6.5.6
