# 部署指南（银河麒麟 / LoongArch / 通用 Linux）

本文档仅描述**运行环境、安装、配置与运维**，不涉及业务功能说明（功能见 [功能说明与需求对照.md](./功能说明与需求对照.md)）。

---

## 一、运行环境与依赖

| 组件 | 建议版本 |
|------|-----------|
| Node.js | **≥ 18**（麒麟/龙芯可用官方或发行版自带 Node） |
| MySQL | **8.0+**，字符集 `utf8mb4` |
| 操作系统 | 麒麟 V10（x86/ARM/LoongArch 等）、或通用 Linux；Windows 仅推荐开发自测 |

**LoongArch 说明**：在龙架构上使用**发行版提供的 Node 与 npm**（或经验证的 Node 二进制）。依赖多为纯 JS；若 `npm install` 遇平台无预编译包，需在对应架构下构建少数原生模块（以实际镜像为准）。

---

## 二、数据库初始化

1. 安装并启动 MySQL，导入初始化脚本：

```bash
mysql -u root -p < backend/sql/init.sql
```

2. 若库已存在，按需执行 `backend/sql/migration_*.sql`。

3. 默认管理员：`admin` / `admin123` — **生产环境务必修改密码**。

---

## 三、后端配置与启动

### 3.1 环境变量（项目根目录 `.env`，由 `.env.example` 复制）

```env
PORT=3000
JWT_SECRET=请替换为足够长的随机字符串

DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=你的密码
DB_NAME=smart_grading_system

# 可选：上传目录绝对路径（默认 backend/uploads）
# UPLOAD_PATH=/var/smart-grading/uploads
```

### 3.2 安装与启动

```bash
cd backend
npm install
npm run start
```

开发模式：`npm run dev`（nodemon）。

### 3.3 大模型（生产建议）

在管理端「系统设置」填写 API Base、API Key、模型名后保存，并通过「测试大模型连接」验证出网与密钥。

---

## 四、前端构建与部署

### 4.1 开发

```bash
cd frontend
npm install
npm run dev
```

`vite.config.js` 将 `/api` 代理到 `http://localhost:3000`。

### 4.2 生产构建

```bash
cd frontend
npm run build
```

产物在 `frontend/dist`。将 `dist` 放到 Nginx 静态根目录，`/api` 反向代理到 Node（见下节）。

### 4.3 生产环境 API 地址

前后端不同域时，修改 `frontend/src/api/index.js` 中 `baseURL` 为实际 API 前缀（如 `https://your-domain.com/api`），再执行 `npm run build`。

---

## 五、Nginx 反向代理示例

```nginx
server {
    listen 80;
    server_name your.domain.com;

    root /var/www/smart-grading/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 55m;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 六、systemd 托管后端（可选）

`/etc/systemd/system/smart-grading-api.service`：

```ini
[Unit]
Description=Smart Grading API
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/smart-grading/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now smart-grading-api.service
sudo journalctl -u smart-grading-api -f
```

---

## 七、PDF 中文与图表说明

- 个人/班级 PDF：环境变量 **`PDF_CJK_FONT`** 指向 `.ttf/.ttc/.otf` 绝对路径（麒麟常见字体路径见 `reportController` 注释）。
- 班级 PDF 以**表格明细**为主；柱状图/饼图/雷达图在 Web「成绩统计」展示；Excel 含「统计摘要」工作表。

---

## 八、目录与权限

| 路径 | 用途 |
|------|------|
| `backend/uploads` | 学生上传（启动时或上传中间件自动创建） |
| `backend/exports` | Excel 导出临时文件（自动创建） |

运行用户需对上述目录有**读写权限**。

---

## 九、常见问题

1. **AI 批改超时**：前端已对批改类接口放宽超时；确保服务器可访问公网大模型 API。  
2. **中文文件名乱码**：数据库连接使用 `utf8mb4`；上传层已做文件名编码修正。  
3. **JWT 无效**：检查系统时间、`JWT_SECRET` 是否变更。  
4. **批改详情 404**：该提交尚无 `grading_results` 记录，需先执行「AI 批改」。

---

## 十、文档索引

项目还提供 [功能说明与需求对照.md](./功能说明与需求对照.md)；工程总览见 [PROJECT.md](./PROJECT.md)，文档列表见 [README-文档索引.md](./README-文档索引.md)。
