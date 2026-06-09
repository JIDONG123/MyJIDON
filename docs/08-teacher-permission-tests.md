# 08 — 教师端任务权限测试清单

教师端任务相关权限统一规则：**`tasks.created_by = 当前教师 ID`**。  
课程负责人 / 教学班任课身份**不**自动获得他人任务的查看、批改、导出权限。

---

## 测试账号准备

| 角色 | 建议账号 | 用途 |
|------|----------|------|
| 课程负责人 A | `test-teacher-01` | 某课程 `leader_id`，未必在该班任课 |
| 任课教师 B | `test-teacher-02` | 同一课程下某教学班 `teaching_class_teachers` |
| 行政班班主任 C | `teacher1` | 行政班 `classes.teacher_id` |
| 学生 | `test-student-01` | 验证学生端不变 |
| 企业导师 | `test-enterprise-01` | 验证企业端不变 |
| 管理员 | `admin` | 验证全局监管不变 |

**前置：** 教师 B 在教学班 T 发布任务 `task-B`；课程负责人 A **未**创建该班任务。  
行政班场景：班主任 C 以外教师 D 在 C 的班发布 `task-D`。

---

## 1. 课程可见（应保持）

| # | 操作 | 账号 | 期望 |
|---|------|------|------|
| 1.1 | 打开「我的课程」 | A | 可见负责课程 + 任课班所属课程 |
| 1.2 | 打开「我的课程」 | B | 可见任课教学班所属课程 |
| 1.3 | 打开教学班详情（成员/课表） | A | 可查看基础信息（非任务批改） |
| 1.4 | 打开教学班详情 | B | 可查看 |

---

## 2. 任务列表（收紧）

| # | API / 页面 | 账号 | 期望 |
|---|------------|------|------|
| 2.1 | `GET /api/tasks` | B | 仅含 B 创建的 `task-B` |
| 2.2 | `GET /api/tasks` | A | **不含** `task-B`（B 创建） |
| 2.3 | `GET /api/tasks/teaching-class/:T` | A | 空或仅 A 自建任务 |
| 2.4 | `GET /api/tasks/teaching-class/:T` | B | 仅 B 自建任务 |
| 2.5 | 教师端 `/teacher/tasks` | A | 列表无 B 的任务 |

---

## 3. 提交与批改（403）

| # | 操作 | 账号 | 期望 |
|---|------|------|------|
| 3.1 | `GET /api/tasks/:id`（B 的任务） | A | **403** 无权查看 |
| 3.2 | `GET /api/submissions/task/:taskId` | A | **403** |
| 3.3 | `GET /api/tasks/:id/submission-overview` | A | **403** |
| 3.4 | `POST /api/grading/ai/:submissionId` | A | **403** |
| 3.5 | `POST /api/grading/batch/:taskId` | A | **403** |
| 3.6 | `POST /api/grading/jobs` | A | **403** |
| 3.7 | `GET /api/grading/:submissionId` 人工复核 | A | **403** |
| 3.8 | 同上 | B（创建者） | **200** |
| 3.9 | 查重 / VL 识别 | A | **403** |

---

## 4. 批改 Job

| # | 操作 | 账号 | 期望 |
|---|------|------|------|
| 4.1 | `GET /api/grading/jobs` | A | 不含 B 触发的 job |
| 4.2 | `GET /api/grading/jobs/:id`（B 的 job） | A | **403/404** |
| 4.3 | B 触发 AI 批改后列表 | B | 可见自己的 job |

---

## 5. 统计与导出（仅创建者数据）

| # | 操作 | 账号 | 期望 |
|---|------|------|------|
| 5.1 | `GET /api/export/scores?taskId=&teachingClassId=` | A | **403**（非创建者） |
| 5.2 | 打包 ZIP 导出 | A | **403** |
| 5.3 | `GET /api/dashboard/practice-stats?teachingClassId=` | A | 仅统计 A 自建任务（或无数据） |
| 5.4 | 教师数据大屏 `big-screen` | A | 不含 B 任务提交 |
| 5.5 | 班级 PDF 导出 | 非创建者 | 仅含本人任务成绩 |
| 5.6 | 同上 | 创建者 B | 正常导出 |

---

## 6. 发布权限（保持）

| # | 操作 | 账号 | 期望 |
|---|------|------|------|
| 6.1 | 向教学班 T 发布任务 | B（任课） | **201** |
| 6.2 | 向教学班 T 发布任务 | A（仅负责人未任课） | 若 `teacherManagesTeachingClass` 通过则 **201**；发布后仅 A 可管 |
| 6.3 | 向无权限教学班发布 | 任意无权限教师 | **403** |

---

## 7. 学生 / 企业 / 管理员（不变）

| # | 操作 | 账号 | 期望 |
|---|------|------|------|
| 7.1 | 学生任务列表 | 学生 | 可见本行政班 + 已加入教学班任务 |
| 7.2 | 企业查看授权班提交 | 企业 | 可见，可企业评分 |
| 7.3 | 企业 AI 批改 | 企业 | **403**（若接口限制） |
| 7.4 | 管理员任务/提交/批改 | admin | 全部可见可操作 |

---

## 8. 旧行政班任务

| # | 场景 | 期望 |
|---|------|------|
| 8.1 | 班主任 C 创建 `class_id` 任务 | 仅 C 在列表/提交/批改可见 |
| 8.2 | 同班其他教师 | 无法查看 C 的任务提交 |

---

## 快速回归命令

```powershell
cd backend
npm run test:grading-contract
npm run regression:teacher-permissions   # 需 backend 已启动 + seed:test
```

手动测试时可在浏览器 Network 中确认越权接口返回 **403** 且响应 `message` 含「无权」。

---

## 实现要点（开发对照）

| 模块 | 规则 |
|------|------|
| `teacherTaskVisibilityWhere` | `t.created_by = ?` |
| `teacherOwnsTaskForGrading` / `teacherOwnsSubmissionTask` | 创建者校验 |
| `getAllTasks`（teacher） | 同上 SQL |
| `getTasksByTeachingClass/Class`（teacher） | 附加 `created_by` |
| `exportController` | `teacherIsTaskCreator` |
| `practiceStatsScope.buildScopeSql` | 教师附加 `t.created_by` |
| 课程 / 教学班 CRUD | 仍用 `teacherManagesTeachingClass` / `teacherOwnsCourse` |
