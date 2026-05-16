# 智能实训作业批改管理系统 - 前端（归档）

> 本文件由仓库根目录 `frontend/README.md` 迁入 `docs/legacy/`，仅作备份。**请以 `docs/PROJECT.md` 为准。**

## 技术栈
- Vue 3 + Vite
- Element Plus
- Vue Router
- Pinia
- ECharts

## 环境要求
- Node.js >= 18.0.0
- npm >= 9.0.0

## 安装依赖
```bash
npm install
```

## 开发模式
```bash
npm run dev
```

## 生产构建
```bash
npm run build
```

## 项目结构
```
src/
├── api/           # API 请求封装
├── components/    # 公共组件
├── layouts/       # 布局组件
├── router/        # 路由配置
├── stores/        # Pinia 状态管理
├── views/         # 页面视图
│   ├── admin/     # 管理员页面
│   ├── teacher/   # 教师页面
│   └── student/   # 学生页面
├── App.vue        # 根组件
├── main.js        # 入口文件
└── style.css      # 全局样式
```

## 页面结构（历史说明；路由以 `src/router/index.js` 为准）
- 登录页 /login
- 注册页 /register
- 管理员：用户管理已拆分为 `/admin/users/students`、`/admin/users/teachers`（原 `/admin/users` 重定向至学生页）
- 教师、学生端见 `docs/PROJECT.md`

## 默认账号
- 管理员：admin / admin123
- 教师：teacher1 / admin123
- 学生：student1 / admin123
