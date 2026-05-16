# 智能实训作业批改与评价系统 — 工程说明

校企协同场景下的 Web 应用：**前后端分离**，管理员 / 教师 / 学生三端；任务按班级隔离，支持作业上传、大模型辅助批改、教师复核、统计与报表导出。

---

## 1. 技术栈与仓库边界

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3、Vite、Element Plus、Vue Router、Pinia、ECharts、Axios |
| 后端 | Node.js 18+、Express、MySQL 8、JWT、Multer（上传）、PDF/Office 解析、报表相关依赖 |
| 数据 | MySQL，`backend/sql/init.sql` 初始化；增量见 `backend/sql/migration_*.sql` |

本仓库**不包含** `node_modules` 文档；依赖说明以各包官方文档为准。

---

## 2. 功能概览（按角色）

### 管理员（`/admin/*`）

- 数据概览、班级 CRUD、**学生账号管理**与**教师账号管理**（分页、搜索、增删改；管理员账号不可删）
- 任务管理、作业列表与批改入口、报表统计、系统设置（含大模型等配置）

### 教师（`/teacher/*`）

- 数据概览、**仅本人负责班级**（`classes.teacher_id`）的班级工作台
- 任务发布与批改、成绩统计、我的设置（头像、部门、负责班级）
- 向本班添加学生：**仅展示未分班学生**，支持搜索、多选批量入班；已分班学生不可被其他班重复添加

### 学生（`/student/*`）

- 本班任务列表、提交、成绩查询；数据与任务严格按 `class_id` 隔离

### 核心业务约束（保持不变）

- 一名教师可管理多个班级；一名学生**只属于一个班级**（`users.class_id`）
- 任务绑定班级，学生仅可见本班任务；批改与提交按角色与班级鉴权

---

## 3. 仓库目录结构（全量说明）

下列为**本仓库业务代码与文档**的完整结构说明（**不含** `node_modules`、一般为构建产物的 `frontend/dist/`；二者可通过 `npm install` / `npm run build` 再生成）。

### 3.1 仓库根目录

| 路径 | 作用 |
|------|------|
| `README.md` | 仓库对外入口：快速开发命令、指向 `docs/PROJECT.md` 与补充文档。 |
| `docs/` | 全部 Markdown 文档（工程说明、部署、需求对照、历史 README 备份）。 |
| `backend/` | Node.js + Express 后端服务、SQL 脚本、上传存储目录。 |
| `frontend/` | Vue 3 + Vite 前端工程源码与构建配置。 |

若存在 `.gitignore`，用于忽略 `node_modules`、`.env`、本地 `uploads` 等不应入库的文件（以实际文件为准）。

---

### 3.2 `docs/` — 文档

| 路径 | 作用 |
|------|------|
| `docs/PROJECT.md` | **主文档**（本文件）：技术栈、功能、**完整目录说明**、部署摘要、API 导航。 |
| `docs/README-文档索引.md` | 文档导航表，指向 `PROJECT.md` 与可选延伸阅读。 |
| `docs/功能说明与需求对照.md` | 与竞赛/官方需求的对照、角色能力细化。 |
| `docs/部署指南-麒麟LoongArch.md` | 麒麟 OS、LoongArch 等环境下的安装、Nginx、systemd、常见问题。 |
| `docs/legacy/frontend-README.md` | 从原 `frontend/README.md` 迁入的备份，仅作参考。 |
| `docs/legacy/backend-README.md` | 从原 `backend/README.md` 迁入的备份，仅作参考。 |

---

### 3.3 `backend/` — 后端

| 路径 | 作用 |
|------|------|
| `backend/package.json` | NPM 依赖与脚本定义：`npm run dev`（nodemon）、`npm start`（生产 node）。 |
| `backend/package-lock.json` | 锁定依赖版本（若存在）。 |
| `backend/server.js` | **应用入口**：创建 Express 实例、挂载中间件、注册 `/api/*` 路由、静态目录 `/uploads`、统一错误 JSON 输出。 |
| `.env`（项目根目录） | **唯一环境配置**（通常不入库）：`DB_*`、`JWT_SECRET`、`PORT` 等；由 `.env.example` 复制；Docker 与 `backend` 启动共用。 |
| `backend/init-db.js` | 辅助脚本：与数据库初始化相关的便捷操作（若团队使用）。 |
| `backend/update-passwords.js` | 辅助脚本：批量或重置密码类运维（若团队使用）。 |

#### 3.3.1 `backend/config/`

| 路径 | 作用 |
|------|------|
| `backend/config/database.js` | MySQL 连接池（`mysql2/promise`），读取 `.env` 中的库配置，供各控制器使用。 |

#### 3.3.2 `backend/routes/` — HTTP 路由（与 `server.js` 中 `app.use('/api/...')` 对应）

| 路径 | 作用 |
|------|------|
| `backend/routes/userRoutes.js` | 用户：注册/登录、`/me`、头像上传、管理员学生/教师分页列表、教师搜未分班学生、`/:id` CRUD（管理员）、创建教师/学生等。 |
| `backend/routes/classRoutes.js` | 班级：列表、详情、创建/更新/删除（权限区分）、班级学生、加入学生、批量加入、`/public/names`、教师教学概览等。 |
| `backend/routes/taskRoutes.js` | 实训任务：列表、详情、增删改、按班级查任务等。 |
| `backend/routes/submissionRoutes.js` | 作业提交：学生提交、按任务/学生查询提交记录等。 |
| `backend/routes/gradingRoutes.js` | 批改：AI 批改、批量、教师人工复核、成绩相关查询等。 |
| `backend/routes/dashboardRoutes.js` | 数据看板：系统统计、按班级统计、导出等。 |
| `backend/routes/settingsRoutes.js` | 系统设置：大模型地址、密钥、综合分权重等可配置项的读写。 |
| `backend/routes/reportRoutes.js` | 报表：如按班级导出 PDF 等（与 `reportController` 配合）。 |

#### 3.3.3 `backend/controllers/` — 业务逻辑（被 routes 调用）

| 路径 | 作用 |
|------|------|
| `backend/controllers/userController.js` | 用户注册登录、当前用户信息、头像、管理员分页列表、教师搜学生、创建教师/学生、管理员改用户、删除（禁止删 admin）等。 |
| `backend/controllers/classController.js` | 班级 CRUD、教师可见班级、班级学生名单、添加/批量添加学生、公开班级名列表、教学概览等。 |
| `backend/controllers/taskController.js` | 任务的创建/查询/更新/删除及按角色过滤（教师/学生/管理员）。 |
| `backend/controllers/submissionController.js` | 提交记录创建与查询、文件与任务关联等。 |
| `backend/controllers/gradingController.js` | AI 批改流程、人工评分、结果写入与查询。 |
| `backend/controllers/dashboardController.js` | 首页/看板统计数据、班级维度统计与导出数据准备。 |
| `backend/controllers/settingsController.js` | 读取/保存系统级配置项（如大模型、评分权重）。 |
| `backend/controllers/reportController.js` | 报表生成（如 PDF）及下载相关逻辑。 |

#### 3.3.4 `backend/middleware/`

| 路径 | 作用 |
|------|------|
| `backend/middleware/auth.js` | JWT 校验 `authenticateToken`、基于角色的 `requireRole`。 |
| `backend/middleware/upload.js` | 作业等通用文件上传（Multer 配置、类型/大小限制）。 |
| `backend/middleware/uploadAvatar.js` | 用户头像专用上传（保存路径、文件名规则等）。 |

#### 3.3.5 `backend/utils/`

| 路径 | 作用 |
|------|------|
| `backend/utils/accessControl.js` | 学生班级 ID、教师是否管理某班、任务/提交归属校验等，**保证数据隔离**。 |
| `backend/utils/aiGrading.js` | 调用大模型 API、组装提示词、解析批改结果等（与设置中的模型配置配合）。 |
| `backend/utils/filenameEncoding.js` | 上传文件名编码修正，减少中文名乱码问题。 |

#### 3.3.6 `backend/sql/` — 数据库结构

| 路径 | 作用 |
|------|------|
| `backend/sql/init.sql` | **全新建库**：建库 `smart_grading_system`、全量表结构、索引、**演示种子数据**（管理员/教师/学生/班级/任务等）。 |
| `backend/sql/migration_user_avatar.sql` | 增量：为用户表增加 `avatar` 字段（存量库未执行过 init 全量时单独跑）。 |
| `backend/sql/migration_teacher_class_isolation.sql` | 增量：班级-教师绑定、任务不公开穿透等隔离相关更新。 |
| `backend/sql/migration_scenario_coop.sql` | 增量：任务表校企场景字段（如 `scenario_type`、`enterprise_standard`）。 |
| `backend/sql/migration_task_score_weights.sql` | 增量：任务 AI/人工分权重等字段。 |
| `backend/sql/migration_competition.sql` | 增量：与竞赛/评分扩展相关的表或字段（以脚本内注释为准）。 |

#### 3.3.7 `backend/scripts/` — 可执行迁移脚本

| 路径 | 作用 |
|------|------|
| `backend/scripts/run-migration-isolation.js` | Node 执行班级/教师隔离类迁移并打印结果（替代手工执行对应 SQL 的场景）。 |
| `backend/scripts/run-migration-scenario.js` | Node 执行校企场景类迁移（替代手工执行对应 SQL 的场景）。 |

#### 3.3.8 `backend/uploads/` — 运行时上传目录

| 路径 | 作用 |
|------|------|
| `backend/uploads/` | 默认上传根目录（可由 `UPLOAD_PATH` 指向其它绝对路径）。 |
| `backend/uploads/avatars/`（运行后可能出现） | 用户头像文件存储位置（相对路径写入数据库，URL 形如 `/uploads/avatars/...`）。 |
| 其它子目录 | 随业务产生的作业附件等（具体子路径以 `upload` 中间件与控制器约定为准）。 |

---

### 3.4 `frontend/` — 前端

| 路径 | 作用 |
|------|------|
| `frontend/package.json` | 前端依赖与脚本：`dev`（Vite）、`build`、`preview`。 |
| `frontend/package-lock.json` | 锁定依赖版本（若存在）。 |
| `frontend/vite.config.js` | Vite 配置：**开发代理** `/api`、`/uploads` → 后端（默认 `localhost:3000`），Vue 插件等。 |
| `frontend/index.html` | SPA 入口 HTML，挂载 `#app`，开发/构建入口。 |
| `frontend/dist/` | **`npm run build` 生成物**：静态资源 + `index.html`，供 Nginx 直接托管；**不必手改**。 |

#### 3.4.1 `frontend/src/` — 源码根

| 路径 | 作用 |
|------|------|
| `frontend/src/main.js` | 前端入口：创建 Vue 应用、注册 Pinia、Router、Element Plus、全局样式等。 |
| `frontend/src/App.vue` | 根组件：通常包含 `<router-view>` 与全局过渡。 |
| `frontend/src/router/index.js` | **路由表**：`/login`、`/register`、`/admin/*`、`/teacher/*`、`/student/*` 及路由守卫（按角色跳转）。 |

#### 3.4.2 `frontend/src/api/` — 后端接口封装

| 路径 | 作用 |
|------|------|
| `frontend/src/api/index.js` | Axios 实例：`baseURL: '/api'`、请求头带 Token、401 跳转登录、响应解包。 |
| `frontend/src/api/user.js` | 登录、注册、当前用户、头像、管理员学生/教师列表、创建学生、教师搜学生、用户 CRUD 等。 |
| `frontend/src/api/class.js` | 班级列表、详情、教学概览、加学生、批量加学生、管理员班级接口等。 |
| `frontend/src/api/task.js` | 任务列表、详情、创建/更新/删除、按班级任务列表。 |
| `frontend/src/api/submission.js` | 提交作业、查询提交记录。 |
| `frontend/src/api/grading.js` | AI 批改、人工复核、成绩列表等。 |
| `frontend/src/api/dashboard.js` | 看板统计数据接口。 |
| `frontend/src/api/settings.js` | 系统设置读写。 |
| `frontend/src/api/report.js` | 报表导出/下载相关接口。 |

#### 3.4.3 `frontend/src/stores/`

| 路径 | 作用 |
|------|------|
| `frontend/src/stores/user.js` | Pinia：登录态、`token`、`user` 信息、`fetchUserInfo`、`logout`、与 `localStorage` 同步。 |

#### 3.4.4 `frontend/src/layouts/` — 三端布局壳

| 路径 | 作用 |
|------|------|
| `frontend/src/layouts/AdminLayout.vue` | 管理员侧栏 + 顶栏 + `<router-view>`。 |
| `frontend/src/layouts/TeacherLayout.vue` | 教师侧栏 + 顶栏 + 用户头像入口。 |
| `frontend/src/layouts/StudentLayout.vue` | 学生侧栏 + 顶栏 + 用户头像入口。 |

#### 3.4.5 `frontend/src/views/` — 页面视图

**公共 / 认证**

| 路径 | 作用 |
|------|------|
| `frontend/src/views/Login.vue` | 登录页。 |
| `frontend/src/views/Register.vue` | 学生注册（可选班级等）。 |

**管理员 `views/admin/`**

| 路径 | 作用 |
|------|------|
| `Dashboard.vue` | 管理端数据概览。 |
| `ClassManagement.vue` | 班级增删改查、负责教师绑定等。 |
| `StudentUserManagement.vue` | 学生账号分页、搜索、增删改。 |
| `TeacherUserManagement.vue` | 教师账号分页、搜索、增删改。 |
| `TaskManagement.vue` | 全站任务管理视角。 |
| `Submissions.vue` | 某任务下作业列表（管理员入口）。 |
| `Grading.vue` | 批改详情页（管理员复用教师逻辑）。 |
| `SystemSettings.vue` | 大模型与综合分权重等系统参数。 |

**教师 `views/teacher/`**

| 路径 | 作用 |
|------|------|
| `Dashboard.vue` | 教师工作台数据概览。 |
| `TeacherClassList.vue` | 本人负责班级列表。 |
| `TeacherClassDetail.vue` | 班级工作台：学生名单、从未分班列表搜索/勾选/批量加入本班。 |
| `TaskList.vue` | 任务列表（可按班级筛选）。 |
| `TaskForm.vue` | 发布/编辑任务表单。 |
| `Submissions.vue` | 某任务提交列表。 |
| `Grading.vue` | 单份作业批改界面。 |
| `Statistics.vue` | 成绩统计图表。 |

**学生 `views/student/`**

| 路径 | 作用 |
|------|------|
| `TaskList.vue` | 本班任务列表与「我的班级」展示。 |
| `TaskDetail.vue` | 任务详情与上传提交。 |
| `Submissions.vue` | 我的提交记录。 |
| `Results.vue` | 成绩列表。 |
| `ResultDetail.vue` | 单次提交成绩详情。 |

**共享 `views/shared/`**

| 路径 | 作用 |
|------|------|
| `MySettings.vue` | 教师/学生「我的设置」：头像、基本信息、负责教师/班级等。 |

#### 3.4.6 `frontend/src/components/`

| 路径 | 作用 |
|------|------|
| `frontend/src/components/UserAvatar.vue` | 用户头像展示：图片或首字渐变占位、悬停动效。 |

#### 3.4.7 `frontend/src/composables/`

| 路径 | 作用 |
|------|------|
| `frontend/src/composables/useTableDensity.js` | 表格「标准/紧凑/宽松」密度切换，多列表页复用。 |

#### 3.4.8 `frontend/src/utils/`

| 路径 | 作用 |
|------|------|
| `frontend/src/utils/format.js` | 日期、分数等展示格式化。 |
| `frontend/src/utils/gradingLoading.js` | 批改流程中的加载提示或轮询辅助逻辑。 |

#### 3.4.9 `frontend/src/styles/`

| 路径 | 作用 |
|------|------|
| `frontend/src/styles/theme.css` | 全局设计变量（色板、圆角、侧栏渐变等）与 Element Plus 变量覆盖。 |
| `frontend/src/styles/auth-pages.css` | 登录/注册页专用样式。 |

---

### 3.5 全文目录树（便于检索）

> 说明：`node_modules/`、`frontend/dist/` 体积大且可重建，下列树**故意省略**；`backend/uploads/` 下文件为运行时产生，树中仅标出目录。

```
<项目根>/
├── README.md
├── docs/
│   ├── PROJECT.md
│   ├── README-文档索引.md
│   ├── 功能说明与需求对照.md
│   ├── 部署指南-麒麟LoongArch.md
│   └── legacy/
│       ├── frontend-README.md
│       └── backend-README.md
├── backend/
│   ├── package.json
│   ├── package-lock.json          （可选）
│   ├── server.js
│   ├── .env                       （本地自建，通常 gitignore）
│   ├── init-db.js
│   ├── update-passwords.js
│   ├── config/
│   │   └── database.js
│   ├── routes/
│   │   ├── userRoutes.js
│   │   ├── classRoutes.js
│   │   ├── taskRoutes.js
│   │   ├── submissionRoutes.js
│   │   ├── gradingRoutes.js
│   │   ├── dashboardRoutes.js
│   │   ├── settingsRoutes.js
│   │   └── reportRoutes.js
│   ├── controllers/
│   │   ├── userController.js
│   │   ├── classController.js
│   │   ├── taskController.js
│   │   ├── submissionController.js
│   │   ├── gradingController.js
│   │   ├── dashboardController.js
│   │   ├── settingsController.js
│   │   └── reportController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── upload.js
│   │   └── uploadAvatar.js
│   ├── utils/
│   │   ├── accessControl.js
│   │   ├── aiGrading.js
│   │   └── filenameEncoding.js
│   ├── sql/
│   │   ├── init.sql
│   │   ├── migration_user_avatar.sql
│   │   ├── migration_teacher_class_isolation.sql
│   │   ├── migration_scenario_coop.sql
│   │   ├── migration_task_score_weights.sql
│   │   └── migration_competition.sql
│   ├── scripts/
│   │   ├── run-migration-isolation.js
│   │   └── run-migration-scenario.js
│   └── uploads/                   （运行时目录；含 avatars 等子目录）
└── frontend/
    ├── package.json
    ├── package-lock.json          （可选）
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.js
        ├── App.vue
        ├── router/
        │   └── index.js
        ├── stores/
        │   └── user.js
        ├── api/
        │   ├── index.js
        │   ├── user.js
        │   ├── class.js
        │   ├── task.js
        │   ├── submission.js
        │   ├── grading.js
        │   ├── dashboard.js
        │   ├── settings.js
        │   └── report.js
        ├── layouts/
        │   ├── AdminLayout.vue
        │   ├── TeacherLayout.vue
        │   └── StudentLayout.vue
        ├── views/
        │   ├── Login.vue
        │   ├── Register.vue
        │   ├── admin/
        │   │   ├── Dashboard.vue
        │   │   ├── ClassManagement.vue
        │   │   ├── StudentUserManagement.vue
        │   │   ├── TeacherUserManagement.vue
        │   │   ├── TaskManagement.vue
        │   │   ├── Submissions.vue
        │   │   ├── Grading.vue
        │   │   └── SystemSettings.vue
        │   ├── teacher/
        │   │   ├── Dashboard.vue
        │   │   ├── TeacherClassList.vue
        │   │   ├── TeacherClassDetail.vue
        │   │   ├── TaskList.vue
        │   │   ├── TaskForm.vue
        │   │   ├── Submissions.vue
        │   │   ├── Grading.vue
        │   │   └── Statistics.vue
        │   ├── student/
        │   │   ├── TaskList.vue
        │   │   ├── TaskDetail.vue
        │   │   ├── Submissions.vue
        │   │   ├── Results.vue
        │   │   └── ResultDetail.vue
        │   └── shared/
        │       └── MySettings.vue
        ├── components/
        │   └── UserAvatar.vue
        ├── composables/
        │   └── useTableDensity.js
        ├── utils/
        │   ├── format.js
        │   └── gradingLoading.js
        └── styles/
            ├── theme.css
            └── auth-pages.css
```

---

## 4. 本地开发与调试

### 4.1 数据库

1. 安装 MySQL 8，创建库并执行 **`backend/sql/init.sql`**（会建库 `smart_grading_system` 及种子数据）。
2. 若库为旧版本增量升级，按需执行 `backend/sql/` 下各 **`migration_*.sql`** 或项目内说明的脚本（如教师班级隔离、头像字段、校企场景字段等）。

### 4.2 后端

```bash
cd backend
# 新建并编辑 .env：DB_HOST、DB_USER、DB_PASSWORD、DB_NAME、JWT_SECRET、PORT、UPLOAD_PATH 等
npm install
npm run dev            # nodemon；生产可用 npm start
```

默认监听 **`http://localhost:3000`**；静态资源 **`/uploads`** 与 API **`/api/*`** 同源。

### 4.3 前端

```bash
cd frontend
npm install
npm run dev            # Vite，默认 http://localhost:5173
```

开发环境下 **`/api` 与 `/uploads`** 由 Vite 代理到 `localhost:3000`，无需改前端 baseURL。

### 4.4 生产构建（前端）

```bash
cd frontend
npm run build          # 输出 dist/
```

生产部署需由 **Nginx（或其它网关）** 将 `/api` 反代到 Node 服务，并将 **`/uploads`** 指向后端可写目录或同一静态服务，与开发代理语义一致。

### 4.5 默认测试账号（以 init.sql 为准）

| 角色 | 用户名 | 密码（示例） |
|------|--------|----------------|
| 管理员 | admin | admin123 |
| 教师 | teacher1 | admin123 |
| 学生 | student1 | admin123 |

生产环境务必修改密码与 `JWT_SECRET`。

---

## 5. 部署与运维（摘要）

- **通用**：Node 18+、MySQL 8、进程管理（如 systemd）、反向代理（Nginx）、HTTPS、防火墙。
- **麒麟 / LoongArch**：详见 **`docs/部署指南-麒麟LoongArch.md`**（架构差异、依赖安装路径、常见问题等）。
- **环境变量**：后端 `.env` 中 `DB_*`、`JWT_SECRET`、`PORT`、`UPLOAD_PATH` 必配；大模型相关键名以 `settings` 接口及管理端配置为准。

---

## 6. API 与模块（后端挂载）

路由前缀均为 **`/api`**，例如：

- `POST /api/users/login`、`GET /api/users/me`、管理员 `GET /api/users/students`、`GET /api/users/teachers` 等
- `GET|POST|PUT|DELETE /api/classes/...`（含 `/:id/students` 批量入班等）
- `GET|POST|PUT|DELETE /api/tasks/...`
- `GET|POST /api/submissions/...`
- `GET|POST|PUT /api/grading/...`
- `GET /api/dashboard/...`、`GET|POST /api/settings/...`、`GET /api/reports/...`

完整列表以 **`backend/routes/*.js`** 与控制器为准；历史接口说明曾写在原 `backend/README.md`，已迁入 **`docs/legacy/backend-README.md`** 备查。

---

## 7. 其它文档

| 文件 | 用途 |
|------|------|
| `docs/功能说明与需求对照.md` | 需求对照与能力细化 |
| `docs/部署指南-麒麟LoongArch.md` | 麒麟 / LoongArch 专项部署 |
| `docs/legacy/frontend-README.md` | 原前端 README 备份 |
| `docs/legacy/backend-README.md` | 原后端 README 备份 |

日常以 **本文件 `PROJECT.md`** 为工程主文档即可。
