# 智能实训作业批改管理系统 - 后端（归档）

> 本文件由仓库根目录 `backend/README.md` 迁入 `docs/legacy/`，仅作备份。**请以 `docs/PROJECT.md` 与 `backend/routes/*.js` 为准。**

## 技术栈
- Node.js + Express
- MySQL 8.0+
- JWT 身份验证
- Multer 文件上传

## 环境要求
- Node.js >= 18.0.0
- MySQL >= 8.0

## 安装依赖
```bash
npm install
```

## 数据库配置
1. 创建数据库并执行 `sql/init.sql`
2. 修改 `.env` 文件配置数据库连接信息

## 启动服务
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## API 接口（节选，历史）

完整路由以后端 `routes` 目录为准；管理员用户列表已拆分为 `GET /api/users/students`、`GET /api/users/teachers` 等。

### 用户管理
- POST /api/users/register - 学生注册
- POST /api/users/login - 用户登录
- GET /api/users/me - 获取当前用户信息

### 班级管理
- GET /api/classes - 获取班级列表
- POST /api/classes - 创建班级
- PUT /api/classes/:id - 更新班级
- DELETE /api/classes/:id - 删除班级

### 任务管理
- GET /api/tasks - 获取任务列表
- POST /api/tasks - 创建任务
- PUT /api/tasks/:id - 更新任务
- DELETE /api/tasks/:id - 删除任务

### 作业提交
- POST /api/submissions - 提交作业
- GET /api/submissions/task/:taskId - 获取任务的所有提交
- GET /api/submissions/student/me - 获取当前学生的提交记录

### 批改管理
- POST /api/grading/ai/:submissionId - AI 批改单个作业
- POST /api/grading/batch/:taskId - 批量 AI 批改
- PUT /api/grading/human/:submissionId - 人工复核

### 数据统计
- GET /api/dashboard/stats - 获取系统统计数据
- GET /api/dashboard/class/:classId - 获取班级统计
- GET /api/dashboard/class/:classId/export - 导出成绩表

## 默认账号
- 管理员：admin / admin123
- 教师：teacher1 / admin123
- 学生：student1 / admin123
