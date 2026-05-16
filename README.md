# 智能实训作业批改管理系统（校企协同场景）

前后端分离的高职「高校–企业协同实训」成果评价：作业上传与解析、智能核查、多维评分、教师复核加权与 Excel/PDF 报表等。

## 文档（工程主入口）

**请先阅读：[docs/PROJECT.md](./docs/PROJECT.md)** — 功能说明、目录结构、本地开发与生产部署摘要、数据库与迁移指引。

补充材料（按需打开）：

- [docs/功能说明与需求对照.md](./docs/功能说明与需求对照.md)
- [docs/部署指南-麒麟LoongArch.md](./docs/部署指南-麒麟LoongArch.md)
- [docs/README-文档索引.md](./docs/README-文档索引.md)

数据库脚本位于 `backend/sql/`。若数据库早于某次功能升级创建，请按 `docs/PROJECT.md` 中的说明执行对应 `migration_*.sql` 或脚本。

## 快速开发

```bash
# 后端（需先配置 backend/.env 与 MySQL）
cd backend && npm install && npm run dev

# 前端
cd frontend && npm install && npm run dev
```

默认：前端 `http://localhost:5173`（Vite 将 `/api`、`/uploads` 代理到 `localhost:3000`）。

## 技术栈（摘要）

- 前端：Vue 3、Vite、Element Plus、ECharts、Pinia  
- 后端：Node.js、Express、MySQL、JWT、Multer、PDF/Office 解析、大模型兼容调用

详见 **`docs/PROJECT.md`**。
