# 10 — 学生端实训中心 UI 说明

> 本文档描述**学生端实训中心**的前端展示与交互（不含 API / 权限规则变更）。任务数据仍来自既有 `GET /api/tasks`、教学班列表、行政班公告等接口。

## 10.1 路由与命名

| 项 | 值 |
|----|-----|
| 侧栏菜单 | **实训中心**（原「实训任务」） |
| 路由 path | `/student/tasks`（**未改**） |
| 路由 name | `StudentTasks` |
| 页面组件 | `frontend/src/views/student/TaskList.vue` |
| 布局标题 | `StudentLayout.vue` 中 `'/student/tasks': '实训中心'` |

任务详情 `/student/tasks/:id` 返回按钮文案：**返回实训中心**。

关联页面空状态跳转：

- `Submissions.vue`、`Results.vue` 空状态按钮：**去实训中心** → `/student/tasks`

---

## 10.2 我的学习空间

**区块标题：**「我的学习空间」

**卡片来源：** `buildLearningSpaceCards()`（`frontend/src/composables/useStudentLearningSpaces.js`）

| 卡片 | `key` | 展示条件 |
|------|-------|----------|
| 全部任务 | `all` | 始终存在（有班级或教学班数据时） |
| 我的行政班 | `legacy:{classId}` | 学生 `users.class_id` 非空 |
| 我加入的教学班 | `tc:{teachingClassId}` | `listTeachingClasses()` 返回的每条教学班 |

**组件：** `LearningSpaceCard.vue` — 默认展示摘要；悬停展开深色蒙层详情（无滚动条）。

**选中态：** 卡片右上角「当前查看」；下方 context-bar 显示「当前查看：{空间名}」。

---

## 10.3 空间切换与下方内容

选中空间后，下列区域**均基于当前 `selectedSpaceKey` 过滤**：

1. 公告面板（若满足展示规则）
2. 统计卡片（全部 / 待提交 / 待批改 / 已完成 / 即将截止）
3. 状态筛选 Tab + 关键词搜索
4. 推荐任务（仅「全部任务」或「行政班」空间）
5. 任务卡片列表

切换空间时重置 `statusFilter = 'all'`、`keyword = ''`。

---

## 10.4 任务过滤规则

**Composable：** `filterTasksForSpace(enrichedTasks, spaceKey, classId)`

| 空间 | 规则 |
|------|------|
| **全部任务** | 返回 API 聚合结果（行政班 OR 教学班可见任务），按 `task.id` 唯一，**不重复** |
| **行政班** | `!task.teaching_class_id` 且 `task.class_id === 学生 classId` |
| **教学班** | `task.teaching_class_id === 所选教学班 id` |

**说明：** 带 `teaching_class_id` 的任务仅出现在教学班视图与全部任务视图，不出现在行政班视图。

**状态 enrichment：** `enrichTasks()` 结合 `getStudentGradingResults()` 映射 `uiStatus`（未提交 / 已提交 / 待批改 / 已批改 / 已完成 / 已截止）。

---

## 10.5 公告展示规则

| 空间 | 行为 |
|------|------|
| 全部任务 | 展示行政班公告列表（标题「最新公告」）；无数据则不显示模块 |
| 行政班 | 展示行政班公告（标题「行政班公告」） |
| 教学班 | **不展示公告模块**（无教学班公告 API，不渲染空状态） |

**函数：** `shouldShowAnnouncementPanel()`、`announcementsForSpace()`

数据来源：`listClassAnnouncements(classId)` 或 `getLatestAnnouncementForStudent()` 回退。

---

## 10.6 任务卡片字段

**组件：** `StudentTaskCard.vue`

| 字段 | 说明 |
|------|------|
| **来源标签** | `行政班` / `教学班`（由 `teaching_class_id` 判定） |
| 状态标签 | `uiStatus` 对应中文 |
| 标题 / 简介 | `title`、`description` |
| 行政班 | 班级名、发布教师、截止、满分、得分 |
| 教学班 | 课程、教学班名、任课教师（`creator_name`，无则 `--`）、截止、满分、得分 |
| 主操作 | 未提交 → **上传成果**；已批改/已完成 → **查看报告**（有 `submission_id` 时跳成绩详情） |

**教学班任课教师：** 卡片级统计来自任务列表 `creator_name`；学习空间卡片 hover 行由 `inferTeacherFromTasks()` 从该班任务推断，无任务则 `--`。

---

## 10.7 空状态

| 场景 | 文案 |
|------|------|
| 未加入任何班级/教学班 | 「您尚未加入行政班或教学班，请等待教师添加后再查看任务。」 |
| 当前空间无任务 | 「暂无实训任务」+「当前学习空间暂未发布实训任务，请关注教师通知或切换其他空间查看。」 |
| 有任务但筛选无结果 | 「暂无符合条件的任务」+「请切换任务状态或清空搜索条件。」 |

---

## 10.8 回归测试点

### 命名与路由

- [ ] 侧栏显示「实训中心」，URL 仍为 `/student/tasks`
- [ ] 页头标题为「实训中心」；布局顶栏一致

### 学习空间

- [ ] 有行政班时出现「全部任务 + 行政班名」卡片
- [ ] 已加入教学班时出现对应「教学班」卡片
- [ ] 点击卡片后 context-bar、统计、列表同步切换

### 任务过滤

- [ ] 行政班空间不含 `teaching_class_id` 任务
- [ ] 教学班空间仅含对应 `teaching_class_id` 任务
- [ ] 全部任务无重复 `task.id`
- [ ] 每张任务卡片有「行政班 / 教学班」来源标签

### 公告

- [ ] 教学班空间不出现公告区块（含空占位）
- [ ] 行政班 / 全部任务有公告时正常展示

### 操作链路

- [ ] 未提交任务 → 详情页可上传成果
- [ ] 已批改/已完成 → 「查看报告」进入 `/student/results/:submissionId`
- [ ] 筛选 Tab、搜索、统计卡片仅作用于**当前选中空间**

### 实时刷新

- [ ] Socket 域 `tasks` / `grading` / `announcements` 等变更后列表自动 `loadTasks()`

### 推荐任务

- 数据来源：`getMyRecommendations()`（行政班维度）
- **展示空间：** 仅「全部任务」或「行政班」；教学班空间 `showRecommendations === false`
- **标题：**「行政班推荐任务」
- 无推荐数据时不渲染该区块

---

## 10.9 相关文件

| 文件 | 职责 |
|------|------|
| `frontend/src/views/student/TaskList.vue` | 实训中心主页面 |
| `frontend/src/composables/useStudentLearningSpaces.js` | 空间 key、过滤、卡片、公告规则 |
| `frontend/src/components/student/LearningSpaceCard.vue` | 学习空间卡片 |
| `frontend/src/components/student/StudentTaskCard.vue` | 任务卡片 |
| `frontend/src/components/student/StudentAnnouncementPanel.vue` | 公告面板 |
| `frontend/src/layouts/StudentLayout.vue` | 侧栏与顶栏标题 |
| `frontend/src/views/student/StudentArchive.vue` | 实训档案（任务筛选用 `getAllTasks`） |
| `frontend/src/views/student/TaskDetail.vue` | 任务详情与提交 |

---

## 10.10 Legacy API：`GET /api/tasks/class/:classId`

仍被以下前端调用（**非**实训中心主路径）：

| 调用方 | 用途 |
|--------|------|
| `TeacherExport.vue` | 行政班导出任务列表 |
| `TeacherKnowledgeGraph.vue` | 班级图谱关联任务 |

**口径（2026-05 收口）：** 仅返回 `class_id = :classId` **且** `teaching_class_id IS NULL` 的行政班任务；教学班任务不会混入。

学生端实训中心请使用 `GET /api/tasks` + `useStudentLearningSpaces` 过滤。
