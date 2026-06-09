# 导出功能评估文档（PDF / Excel / ZIP）

> **文档性质**：只读扫描结论 + 改造评估清单，供产品/教学侧评审。  
> **扫描日期**：2026-05-19  
> **状态**：待确认，**尚未开始代码改造**。

---

## 1. 背景与目标

当前系统在教师端、学生端、统计页均提供导出能力，但导出文件在**排版、表格样式、字段规范、中文业务状态、空值占位、归档观感**等方面与高校教学归档材料存在差距，不适合录屏展示与答辩提交。

本轮目标：

1. 梳理全部导出相关功能、接口、依赖与字段现状；
2. 列出问题与改造方向；
3. 供评审后按优先级分批实施模板优化。

**本轮约束（评审通过前不改）：**

- 不改后端接口路径
- 不改数据库
- 不改权限规则
- 不改评分计算逻辑
- 不改 AI 批改 JSON 结构
- 不改导出数据范围
- 不改学生/教师/企业评分逻辑

---

## 2. 技术栈与依赖

### 2.1 当前使用的库

| 库 | 后端 | 前端 | 用途 |
|---|---|---|---|
| **pdfkit** | ✅ | — | 全部 PDF 生成 |
| **xlsx** (SheetJS) | ✅ | ✅ | Excel 导出；前端题库导入模板 |
| **archiver** | ✅ | — | 作业附件 ZIP 打包 |
| **adm-zip** | ✅ | — | 代码运行/文件解析解压（**非**导出 ZIP） |
| **pdf-parse** | ✅ | — | PDF **解析**（批改输入），非生成 |

### 2.2 未使用的常见导出库

`pdfmake`、`puppeteer`、`exceljs`、`docx` — 当前项目均未引入。

### 2.3 中文字体（PDF）

- 工具：`backend/utils/pdfChineseFont.js`
- 机制：环境变量 `PDF_CJK_FONT` 或 bundled / 系统字体（Windows 黑体/微软雅黑等）
- 缺失时：接口返回 503，提示配置字体

---

## 3. 导出功能总览

| # | 导出名称 | 前端入口 | 后端接口 | 核心实现文件 | 格式 | 建议优先级 |
|---|---|---|---|---|---|---|
| 1 | 学生个人成绩单 PDF | 学生 `ResultDetail.vue`；教师/管理员 `Grading.vue` | `GET /api/reports/personal/:submissionId/pdf` | `reportController.js` | PDF | **P1** |
| 2 | 班级/教学班/课程汇总 Excel | 教师 `Statistics.vue` | `GET /api/dashboard/practice-export` | `dashboardController.js` | XLSX | **P2** |
| 3 | 任务维度成绩 Excel | `Submissions.vue`、`TeacherExport.vue` | `GET /api/export/scores` | `exportController.js` | XLSX | **P3** |
| 4 | 班级/教学班/课程汇总 PDF | 教师 `Statistics.vue` | `GET /api/reports/practice/pdf` | `reportController.js` | PDF | **P4** |
| 5 | 行政班汇总 PDF（遗留） | **无前端入口** | `GET /api/reports/class/:classId/pdf` | `reportController.js` | PDF | P4（合并） |
| 6 | 作业附件 ZIP | `Submissions.vue`、`TeacherExport.vue` | `GET /api/export/submissions-zip` | `exportController.js` | ZIP | **P5** |
| 7 | 在线考试成绩 Excel | `QbExams.vue` | `GET /api/qb/exams/:id/export-scores` | `qbExamController.js` + `qbExcel.js` | XLSX | 低（可选） |
| 8 | 题库导入模板 | `QbQuestions.vue` | 模板 API / 静态文件 | `qbExcel.js` | XLSX | 非成绩导出 |

### 3.1 路由挂载

```
/api/export/*     → exportRoutes.js
/api/reports/*    → reportRoutes.js
/api/dashboard/*  → dashboardRoutes.js（含 practice-export、class/:id/export）
/api/qb/exams/*   → qb 模块
```

### 3.1 前端 API 封装

| 文件 | 函数 |
|---|---|
| `frontend/src/api/report.js` | `downloadPersonalPdf`、`downloadPracticePdf` |
| `frontend/src/api/export.js` | `downloadScoresExcel`、`downloadSubmissionsZip` |
| `frontend/src/api/dashboard.js` | `exportPracticeScores`、`exportClassScores` |
| `frontend/src/api/qb.js` | `exportExamScores` |

---

## 4. 各导出类型详细评估

### 4.1 学生个人成绩单 PDF（P1）

**接口**：`GET /api/reports/personal/:submissionId/pdf`  
**权限**：学生本人 / 任务所属教师 / 管理员  
**实现**：`exportPersonalPdf` → 按角色分支：

- 学生：`renderStudentPersonalPdf`（标题「个人实训成绩报告单」）
- 教师/管理员：`renderTeacherTranscriptPdf`（标题「学生实训成绩单（单人）」）

**数据来源 SQL**：`grading_results` + `submissions` + `tasks` + `users` + `classes` + 发布教师 + 企业导师。

**当前排版**：

- PDFKit 纯文本流：居中封面标题 → 蓝色小节标题 + 下划线 → `标签：值` 单行 → 多行段落
- **无表格网格、无页眉页脚、无签章区**

**当前字段对照**

| 字段 | 学生版 | 教师版 | 备注 |
|---|---|---|---|
| 姓名 | ✅ | ✅ | |
| 学号 | ✅ | ✅ | |
| 班级（行政班） | ✅ | ✅ | |
| 课程 | ❌ | ❌ | SQL 未 JOIN |
| 教学班 | ❌ | ❌ | |
| 学期 | ❌ | ❌ | |
| 实训项目 | ❌ | ❌ | 仅有任务名称 |
| 任务名称 | ✅ | ✅ | |
| AI 分 | ✅ | ✅ | |
| 教师分 | ✅ | ✅ | |
| 企业导师评分 | 条件显示 | ✅ | |
| 综合分/最终得分 | ✅ | ✅ | |
| 维度得分 | ✅ bullet 列表 | ✅ bullet 列表 | 非表格 |
| 批改状态 | ❌ | ✅ | 学生版无 |
| 提交时间 | ✅ | ✅ | |
| 查重结果 | ❌ | ✅ | 学生版无 |
| 附件名 | ✅ | ✅ | |
| 教师评语 | ✅ | ✅ | |
| AI 评语 | ✅ | ✅ | |
| 企业导师评语 | 条件 | ✅ | |
| 企业导师署名 | ❌ | ✅ | |
| 智能核查 JSON | ✅ 段落展开 | ✅ 含原始 JSON 修正 | 教师版含 `JSON.stringify` |
| 导出时间 | ✅ 页脚 | ✅ 页脚+正文 | |

**主要问题**

1. 观感像「结构化纯文本」，不像正式成绩单/报告单；
2. 维度得分、核查内容为段落堆叠，答辩录屏可读性一般；
3. 缺少课程/学期/教学班等归档常见元数据；
4. 教师版直接输出核查修正 JSON，不适合对外展示。

**建议改造方向**

- 统一模板骨架 + 学生/教师字段分层；
- 封面块（校名/课程/学期/任务/导出时间，校徽待确认）；
- 基本信息、成绩概览、维度得分改为**表格布局**；
- 评语区固定版式（标题栏 + 正文框）；
- 签章/确认栏占位（教师签名、日期）；
- 空值统一 `—`。

---

### 4.2 班级/教学班/课程汇总 Excel（P2）

**接口**：

- 主：`GET /api/dashboard/practice-export?scopeType&scopeId&...`
- 兼容：`GET /api/dashboard/class/:classId/export`（内部转 practice-export）

**前端**：`Statistics.vue` → `exportPracticeScores(practiceStatsParams())`  
**范围**：`legacy_class` | `teaching_class` | `course`（教师权限由 `practiceStatsScope.js` 校验）

**数据来源**：

- 仅 **已有 submission** 的记录（**不含未提交学生**）；
- 教师仅导出自己创建的任务。

**Sheet 结构**

| Sheet | 内容 |
|---|---|
| 成绩明细 | 主数据表 |
| 统计摘要 | 行数、有效分数行数、平均分、最高、最低 |

**当前字段**

| 列名 | 来源 | 问题 |
|---|---|---|
| 姓名 | `users.real_name` | 空为 `''` |
| 学号 | `users.student_no` | |
| 课程 | `courses.course_name` | |
| 教学班 | `teaching_classes.class_name` | |
| 学期 | `terms.name` | |
| 实训项目 | `training_project_templates.project_name` | |
| 任务 | `tasks.title` | |
| AI分 | `grading_results.total_score` | |
| 教师分 | `grading_results.human_score` | |
| 综合分 | `COALESCE(final, human, total)` | |
| 批改状态 | `grading_results.status` | **⚠️ 原始 DB 值** |
| 提交时间 | `submissions.submitted_at` | 字符串，非 Excel 日期 |

**格式能力检查**

| 能力 | 现状 |
|---|---|
| 表头样式 | ❌ |
| 列宽 | ❌ |
| 日期格式 | ❌ |
| 冻结表头 | ❌ |
| 自动筛选 | ❌ |
| 中文状态映射 | ❌ |
| 空值占位 | ❌ 空字符串 |

**其他实现细节**

- 使用 `xlsx.writeFile` 写入 `backend/exports/` 临时目录，下载后删除；
- 文件名：`实训成绩_{scopeType}_{scopeId}_{timestamp}.xlsx`（后端）；
- 前端另设下载名：`实训成绩_{statScope}_{selectedScopeId}.xlsx`。

**建议改造方向**

1. **批改状态**映射为中文（见 §6 状态字典）；
2. 表头样式、列宽、日期列格式、冻结首行、筛选；
3. 空值统一 `—` 或「未提交」；
4. 首行/封面信息区：统计范围、导出时间、导出账号（只读展示）；
5. 统计摘要 sheet 格式化（数字格式、标题行）。

---

### 4.3 任务维度成绩 Excel（P3）

**接口**：`GET /api/export/scores?taskId=&classId=` 或 `teachingClassId=`  
**前端**：

- `TeacherExport.vue`：支持行政班 / 教学班（`exportOpts()`）
- `Submissions.vue`：**仅传 `classId`**（教学班任务可能导出失败 — 见 §7 已知问题）

**数据来源**：

- 任务 roster **LEFT JOIN** submission（**含未提交学生**）；
- 权限：任务创建者 / admin。

**当前字段**

| 列名 | 说明 |
|---|---|
| 姓名 | |
| 学号 | |
| 课程 | |
| 教学班 | 任务关联教学班名 |
| 学期 | |
| 实训项目 | |
| 分数 | `final_score` 或 `total_score` 单列，**非 AI/教师分列** |
| 提交时间 | 字符串 |
| 批改状态 | 部分映射（见下） |

**状态映射**（`gradeStatusLabel`）

| DB 值 | 导出文案 |
|---|---|
| 无 submission | 未提交 |
| null / pending | 待批改 |
| ai_graded | AI已批改 |
| human_graded | 教师已复核 |
| 其他 | **原样字符串** |

**格式能力**：同 P2，全部 ❌。

**前端文案与实导不一致**

`TeacherExport.vue`「导出内容字段」宣称包含：

- 评价维度、AI 评语、教师复核评语、代码运行结果

**实际 Excel 均不包含上述字段**（仅 ZIP 含附件）。

**建议改造方向**

1. 分列：AI分 / 教师分 / 综合分（与汇总 Excel 对齐）；
2. 补行政班列（legacy 任务场景）；
3. 完整状态映射 + 空值占位 + Excel 样式；
4. 对齐或修正 `TeacherExport.vue` 说明文案；
5. `Submissions.vue` 教学班传参修复（前端 only，不改接口）。

---

### 4.4 班级/教学班/课程汇总 PDF（P4）

**接口**：`GET /api/reports/practice/pdf`  
**前端**：`Statistics.vue`「导出 PDF」

**排版**：居中标题 + 副标题 + 导出时间 → 小节「学生×任务成绩明细」→ **编号纯文本行**：

```
1. [课程·项目·] 张三 ｜ 任务A ｜ 成绩：85 ｜ 状态：人工已复核 ｜ 提交：2026/5/19 10:00:00
```

**字段**：姓名、任务、综合分、状态（`statusZh` 部分映射）、提交时间；scope 不同前缀拼接课程/教学班/项目。

**遗留接口**：`GET /api/reports/class/:classId/pdf`（`exportClassPdf`）— 逻辑类似、字段更少，**无前端调用**。

**建议改造方向**

- 正式汇总表（序号 / 学号 / 姓名 / 任务 / AI / 教师 / 综合 / 状态 / 提交时间）；
- 表头重复、分页、页眉页脚；
- 与 Excel 汇总字段、状态文案一致；
- 考虑合并 `exportClassPdf` 与 `exportPracticePdf` 模板，避免双维护。

---

### 4.5 作业附件 ZIP（P5）

**接口**：`GET /api/export/submissions-zip`  
**库**：archiver

**目录结构**：扁平，无子文件夹

```
{学号}_{姓名}_{原文件名}
{学号}_{姓名}_{原文件名}
...
```

**特殊情况**：若 0 个有效文件，包内仅 `readme.txt` 说明。

**不包含**：成绩表、manifest、提交说明、查重信息。

**建议改造方向**

- 根目录 `README.txt`（任务名、班级/教学班、导出时间、文件数）；
- 可选内嵌同次导出的成绩 Excel；
- 按 `学号_姓名/` 分子目录；
- 文件名增加任务简称前缀。

---

### 4.6 在线考试成绩 Excel（可选，低优先级）

**接口**：`GET /api/qb/exams/:id/export-scores`  
**实现**：`qbExcel.buildScoresExportBuffer`

**结构**：标题行 → 空行 → 统计行 → 空行 → 表头 → 数据

**字段**：学号、姓名、用户名、客观分、主观分、总分、排名、交卷时间

**格式**：无样式、无列宽、日期字符串。与实训导出风格不一致，可后续统一。

---

## 5. 字段覆盖矩阵（归档需求对照）

图例：✅ 已有 · ⚠️ 部分/有问题 · ❌ 无 · — 不适用

| 字段 | 个人 PDF | 汇总 Excel | 任务 Excel | 汇总 PDF | ZIP |
|---|---|---|---|---|---|
| 学生姓名 | ✅ | ✅ | ✅ | ✅ | 文件名中 |
| 学号 | ✅ | ✅ | ✅ | ❌ | 文件名中 |
| 班级（行政班） | ✅ | ❌ | ❌ | ❌ | ❌ |
| 课程 | ❌ | ✅ | ✅ | ⚠️ 前缀 | ❌ |
| 教学班 | ❌ | ✅ | ✅ | ⚠️ | ❌ |
| 学期 | ❌ | ✅ | ✅ | ❌ | ❌ |
| 实训项目 | ❌ | ✅ | ✅ | ⚠️ | ❌ |
| 任务 | ✅ | ✅ | — | ✅ | ❌ |
| AI 分 | ✅ | ✅ | ❌ 合并 | ⚠️ 仅综合 | ❌ |
| 教师分 | ✅ | ✅ | ❌ 合并 | ⚠️ | ❌ |
| 企业导师评分 | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| 综合分 | ✅ | ✅ | ⚠️ 单列「分数」 | ✅ | ❌ |
| 维度得分 | ✅ 列表 | ❌ | ❌ | ❌ | ❌ |
| 批改状态 | ⚠️ 教师版 | ❌ raw | ⚠️ 部分 | ⚠️ 部分 | ❌ |
| 提交时间 | ✅ | ⚠️ 字符串 | ⚠️ 字符串 | ✅ | ❌ |
| 查重结果 | ⚠️ 教师版 | ❌ | ❌ | ❌ | ❌ |
| 附件名 | ✅ | ❌ | ❌ | ❌ | ✅ 文件本身 |
| 教师评语 | ✅ | ❌ | ❌ | ❌ | ❌ |
| AI 评语 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 企业导师签名 | ⚠️ 教师版 | ❌ | ❌ | ❌ | ❌ |
| 导出时间 | ✅ | ❌ | ❌ | ✅ | ❌ |

---

## 6. 批改状态字典（建议统一）

当前代码中存在两套映射，且均不完整：

| DB / 业务值 | 任务 Excel (`gradeStatusLabel`) | PDF (`statusZh`) | 汇总 Excel |
|---|---|---|---|
| 无 submission | 未提交 | — | — |
| pending / null | 待批改 | 待批改 | **原样或空** |
| ai_grading | **原样** | **原样** | **原样** |
| ai_graded | AI已批改 | AI 已批改 | **human_graded 等原样** |
| human_graded | 教师已复核 | 人工已复核 | **原样** |
| ai_failed | **原样** | **原样** | **原样** |

**评审建议**：抽取统一函数 `gradingStatusLabel(status, hasSubmission)`，PDF 与全部 Excel 共用，文案需产品确认（如「AI 批改中」「批改失败」等）。

---

## 7. 已知问题与风险

| # | 问题 | 影响 | 改造时是否动接口 |
|---|---|---|---|
| 1 | `Submissions.vue` 导出只传 `classId`，教学班任务需 `teachingClassId` | 教学班任务导出 400/403 | 否，仅前端传参 |
| 2 | `TeacherExport.vue` 字段说明与实际 Excel 不符 | 用户预期偏差 | 否，文案或扩字段 |
| 3 | `exportClassPdf` 无前端入口 |  dead code / 双维护 | 否，合并模板即可 |
| 4 | 汇总 Excel/PDF 仅含已提交记录，任务 Excel 含全班 roster | 同一班级两种导出范围不同 | **按约束不改范围**，文档说明即可 |
| 5 | PDF 依赖服务器中文字体 | 部署环境无字体则 503 | 否，运维/文档 |
| 6 | SheetJS 无样式 API 便利 | Excel 美化需 exceljs 或手写 cell style | 技术选型 |

---

## 8. 建议改造顺序与工作量粗估

| 顺序 | 项 | 主要改动面 | 粗估 |
|---|---|---|---|
| 1 | 学生个人 PDF | `reportController.js` + 可选 PDF 表格 helper | 中 |
| 2 | 班级汇总 Excel | `dashboardController.exportPracticeScores` + 状态/样式 helper | 中 |
| 3 | 任务 Excel | `exportController.exportScoresExcel` + 前端 Submissions 传参 | 中 |
| 4 | 班级汇总 PDF | `exportPracticePdf`（+ 合并 class PDF） | 中 |
| 5 | 作业 ZIP | `exportSubmissionsZip` + README/目录 | 小 |

**可选技术决策（需评审）**

| 选项 | 优点 | 缺点 |
|---|---|---|
| 引入 **exceljs** | 列宽、样式、日期、冻结、筛选 API 完整 | 新依赖、与 xlsx 导入并存 |
| 继续 **xlsx** + 手写样式 | 无新依赖 | 代码冗长、能力有限 |
| PDFKit 自绘表格 | 无 headless 浏览器 | 表格布局代码量较大 |
| puppeteer HTML→PDF | 排版灵活 | 部署重、资源占用高 |

**推荐**：PDF 继续 PDFKit + 表格 helper；Excel 引入 exceljs **仅用于导出路径**，导入仍用 xlsx。

---

## 9. 评审确认清单

请逐项勾选或备注：

- [ ] **优先级**：是否同意 P1→P2→P3→P4→P5？
- [ ] **视觉规范**：是否有校徽/校名/固定页眉？还是通用「高校实训归档」模板？
- [ ] **Excel 技术栈**：是否同意导出侧引入 exceljs？
- [ ] **状态文案**：§6 字典是否需补充/调整？
- [ ] **任务 Excel 字段**：是否扩展 AI/教师/综合分列？是否扩展维度/评语（会显著加宽表）？
- [ ] **TeacherExport 文案**：删减说明 vs 扩展 Excel 字段，选哪种？
- [ ] **汇总导出范围**：仅已提交 vs 全班 roster — 确认维持现状？
- [ ] **ZIP**：是否需要内嵌成绩 Excel + README？
- [ ] **在线考试 Excel**：是否纳入本轮统一风格？
- [ ] **Submissions 教学班传参**：是否纳入 P3 一并修复？

---

## 10. 关键代码索引

```
backend/controllers/exportController.js      # 任务 Excel、作业 ZIP
backend/controllers/reportController.js      # 个人/班级/实训 PDF
backend/controllers/dashboardController.js   # 汇总 Excel (exportPracticeScores)
backend/controllers/qbExamController.js      # 在线考试成绩 Excel
backend/utils/qbExcel.js                     # 题库模板 + 考试成绩 buffer
backend/utils/pdfChineseFont.js              # PDF 中文字体
backend/utils/practiceStatsScope.js          # 统计/导出范围与权限
backend/routes/exportRoutes.js
backend/routes/reportRoutes.js
backend/routes/dashboardRoutes.js

frontend/src/api/export.js
frontend/src/api/report.js
frontend/src/api/dashboard.js
frontend/src/views/teacher/Statistics.vue
frontend/src/views/teacher/Submissions.vue
frontend/src/views/teacher/TeacherExport.vue
frontend/src/views/teacher/Grading.vue
frontend/src/views/student/ResultDetail.vue
frontend/src/views/admin/Grading.vue
frontend/src/views/teacher/QbExams.vue
```

---

## 11. 下一步

1. 评审本文档 §9 确认清单；
2. 确认后从 **P1 学生个人成绩单 PDF** 开始实施；
3. 每完成一项导出类型，提供样例文件供录屏/答辩目检。

---

*文档版本：v1.0 · 扫描完成，待评审*
