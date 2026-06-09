# 04 — 部署与运维

## 4.1 部署路径选型

| 路径 | 适用场景 | 编排 | 模板 |
|------|----------|------|------|
| **A. 龙芯 VM 宿主机** | LoongArch64 / 麒麟，大赛验收机 | Node + MariaDB + Redis + Nginx 宿主机；Neo4j Docker | `.env.host.example` |
| **B. 云 ECS Docker** | 阿里云 / 腾讯云 amd64，4 核 8G | `docker-compose.yml` 六服务 | `.env.example` |

---

## 4.2 路径 A：龙芯 VM 宿主机

### 4.2.1 前置条件

- Node.js **20.x**（宿主机安装，**勿用** LoongArch Node Docker 镜像）
- MariaDB、Redis、Nginx、Docker（仅 Neo4j）
- 项目目录示例：`/home/vmuser/B1`

### 4.2.2 首次安装

```bash
cd /home/vmuser/B1
cp .env.host.example .env
# 编辑：DB_PASSWORD、JWT_SECRET、NEO4J_PASSWORD
# 若启用找回密码：PUBLIC_APP_URL=http://<本机IP>，SMTP_* 见 05-configuration §身份认证与邮件

# 初始化数据库（首次）
mysql -u root -e "
  CREATE DATABASE IF NOT EXISTS smart_grading_system CHARACTER SET utf8mb4;
  CREATE USER IF NOT EXISTS 'sg_user'@'localhost' IDENTIFIED BY '你的密码';
  GRANT ALL ON smart_grading_system.* TO 'sg_user'@'localhost';
  FLUSH PRIVILEGES;
"
mysql -u root smart_grading_system < backend/sql/init.sql

sudo bash scripts/install-autostart.sh
```

安装脚本执行内容：

1. 修正 `.env` 中 Docker 服务名为 `localhost`
2. 构建 `frontend/dist`、安装后端生产依赖
3. 安装 Nginx 配置（`deploy/nginx/host-native.conf`）
4. 启用 MariaDB、Redis、Nginx systemd
5. 启动 Neo4j 容器并注册 `smart-grading-neo4j.service`
6. 注册并启动 `smart-grading-backend.service`、`smart-grading-grading-worker.service`、**`smart-grading-code-runner.service`**
7. `CODE_RUNNER_MODE=host` 时创建 `code_runner` 用户与 jobs 目录

### 4.2.3 验证

```bash
systemctl status smart-grading-backend smart-grading-grading-worker \
  smart-grading-code-runner smart-grading-neo4j nginx mariadb redis
docker ps | grep neo4j
curl -I http://127.0.0.1/
```

访问：`http://<本机IP>/`，登录 `admin / admin123`。

### 4.2.4 热更新（zip 包）

```bash
bash scripts/update-from-zip.sh /path/to/update.zip
```

保留现有 `.env`，重建前后端，重启 backend、**grading-worker**、**code-runner** 与 nginx。

### 4.2.5 常见问题

| 现象 | 处理 |
|------|------|
| 后端 waiting for database | `DB_HOST=localhost`；删除 `backend/.env` |
| Nginx 500 Permission denied | `chmod 755` 项目路径及 `frontend/dist` |
| vite Permission denied | `cd frontend && rm -rf node_modules && npm install` |
| 脚本 `$'\r'` 错误 | `sed -i 's/\r$//' scripts/*.sh` |
| AI 批改一直 pending | 确认 `smart-grading-grading-worker` active；`redis-cli ping` 返回 PONG；`.env` 中 `BULLMQ_ENABLED=1` 时用 `npm run worker:grading`（非 legacy）；`journalctl -u smart-grading-grading-worker -f`；`GET /api/grading/worker-health` |
| 在线实训运行无结果 | `CODE_RUNNER_ENABLED=1`；`smart-grading-code-runner` active；host 模式需 `python3`/`gcc`/`runuser`；`journalctl -u smart-grading-code-runner -f` |
| AI 代码点评失败 | `ONLINE_PRACTICE_AI_REVIEW_ENABLED=1`；管理端 LLM 已配置；至少运行过一次代码 |
| Neo4j 未自启 | 宿主机：`systemctl enable neo4j`；Docker：`systemctl enable smart-grading-neo4j docker` |
| AI 助手流式一次性出字 | Nginx 须对 `/api/assistant/` 关闭 `proxy_buffering` 与 `gzip`；见 §4.2.10 |

### 4.2.10 AI 助手流式输出 Nginx 配置

AI 助手使用 **SSE**（`POST /api/assistant/sessions/:sessionId/messages/stream`）。若经过 Nginx 反向代理且未关闭缓冲，会出现**后端逐段推送、前端最后一次性显示**的现象。

项目已在以下模板中加入专用 location（**优先于**通用 `location /api/`）：

- `deploy/nginx/host-native.conf`（龙芯 VM 宿主机）
- `deploy/docker/nginx.default.conf`（Docker Compose）

关键项：

| 指令 | 作用 |
|------|------|
| `proxy_buffering off` | 关闭响应缓冲 |
| `proxy_cache off` | 禁用缓存 |
| `proxy_request_buffering off` | 请求体不攒包 |
| `gzip off` | 不对 SSE 压缩 |
| `proxy_read_timeout 3600s` | 长连接超时 |
| `add_header X-Accel-Buffering no always` | 提示 Nginx 不缓冲 |

安装或更新配置后：

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart smart-grading-backend
```

**验证（`-N` 禁用 curl 缓冲，应看到 `event: delta` 逐段出现）：**

```bash
# 1. 直连后端（默认端口 8080，按 .env 中 PORT 调整）
curl -N \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"content":"请用三段话解释 Java Web 路由"}' \
  http://127.0.0.1:8080/api/assistant/sessions/<sessionId>/messages/stream

# 2. 经 Nginx（与浏览器同路径）
curl -N \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"content":"请用三段话解释 Java Web 路由"}' \
  http://127.0.0.1/api/assistant/sessions/<sessionId>/messages/stream
```

若直连正常、经 Nginx 仍一次性输出：检查是否 reload 了正确 conf、是否存在更外层 frp/负载均衡缓冲。

后端 SSE 补充：响应头含 `X-Accel-Buffering: no`；每 15s 发送 `: ping` 心跳；写入后 `flush`。Express **未启用** `compression` 中间件，普通 API 不受影响。

### 4.2.6 Neo4j 宿主机安装（龙芯推荐，替代 Docker）

Docker 镜像 `cr.loongnix.cn/.../neo4j-community` 在 LoongArch 上可能 segfault，可改用 **`/opt/neo4j` 宿主机安装**：

```bash
# 1. 停掉 Docker Neo4j，避免占 7687
docker stop sg-neo4j 2>/dev/null
docker update --restart=no sg-neo4j 2>/dev/null
systemctl disable smart-grading-neo4j 2>/dev/null

# 2. .env 配置（与 Neo4j 实际账号一致）
# KG_NEO4J_ENABLED=1
# NEO4J_URI=bolt://127.0.0.1:7687
# NEO4J_USER=neo4j
# NEO4J_PASSWORD=你的密码
# 删除或注释 NEO4J_AUTH=none（仅 Docker 用）

# 3. 注册开机自启（模板 deploy/systemd/smart-grading-neo4j-native.service）
sudo cp deploy/systemd/smart-grading-neo4j-native.service /etc/systemd/system/neo4j.service
# 按实际 JAVA_HOME / 安装路径修改后：
sudo systemctl daemon-reload
sudo systemctl enable --now neo4j

# 4. 重启后端
sudo systemctl restart smart-grading-backend smart-grading-grading-worker smart-grading-code-runner
```

验证：`curl http://127.0.0.1:7474`；日志无 `unauthorized due to authentication failure` 即密码与 `.env` 一致。

### 4.2.8 全功能演示（在线实训 + AI 点评）

龙芯验收机若需演示 **实训中心 + 在线实训 + 代码运行 + AI 代码点评**，`.env` 建议（`.env.host.example` 已默认）：

```env
CODE_RUNNER_ENABLED=1
CODE_RUNNER_MODE=host
ONLINE_PRACTICE_AI_REVIEW_ENABLED=1
PUBLIC_APP_URL=http://<本机IP>
```

安装后四个 systemd 单元与 Windows 四终端对应：

| Windows 开发 | 龙芯 systemd |
|--------------|--------------|
| `npm run dev`（backend） | `smart-grading-backend` |
| `npm run worker:grading` / `worker:grading:dev` | `smart-grading-grading-worker`（BullMQ） |
| `npm run worker:grading:legacy` | Legacy 回退（仅 `BULLMQ_ENABLED=0`） |
| `worker:code-runner` | `smart-grading-code-runner` |
| `frontend npm run dev` | `nginx` + `frontend/dist` |

演示前检查：

```bash
systemctl is-active smart-grading-backend smart-grading-grading-worker smart-grading-code-runner nginx
grep -E '^(CODE_RUNNER_ENABLED|ONLINE_PRACTICE_AI_REVIEW_ENABLED)=' .env
# 管理端 → 系统设置 → LLM API Base / Key / Model
```

浏览器流程：`test-teacher-01` 创建并发布在线实训模板（可开 AI 点评）→ `test-student-01` 进入工作台运行代码 → 点击「AI 代码规范参考分」。

若仅答辩原 7 条 E2E、不演示在线实训：设 `CODE_RUNNER_ENABLED=0` 即可，侧栏隐藏「在线实训」，code-runner 单元仍可运行（空闲）。

### 4.2.9 登录验证码与找回密码（生产）

龙芯 VM 更新代码后需重新构建前端并重启服务：

```bash
cd /home/vmuser/B1/frontend && npm run build
sudo systemctl restart smart-grading-backend smart-grading-grading-worker smart-grading-code-runner nginx
```

`.env` 关键项：

```env
# 对外访问地址（重置邮件链接，勿带末尾 /）
PUBLIC_APP_URL=http://192.168.x.x

# SMTP（示例：QQ 邮箱）
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your@qq.com
SMTP_PASS=QQ邮箱授权码
SMTP_FROM=龙芯智训 <your@qq.com>
```

| 能力 | 依赖 |
|------|------|
| 登录图形验证码 | Redis（`CAPTCHA_TTL_SEC`，默认 300s） |
| 忘记密码邮件 | Redis + SMTP + `PUBLIC_APP_URL` |
| 登录会话 | 前端 sessionStorage；`JWT_EXPIRES_IN` 默认 8h |

数据库迁移 `migration_password_plain.sql` 会在后端启动时自动执行（管理员可查看实训账号明文密码）。

---

## 4.3 路径 B：云 ECS Docker

### 4.3.1 前置条件

- Docker Engine + Compose v2
- 推荐规格：4 核 8G
- 开放 80 端口（或修改 `.env` 中 `HTTP_PORT`）

### 4.3.2 部署

```bash
cp .env.example .env
# 编辑：JWT_SECRET、DB_PASSWORD、MARIADB_ROOT_PASSWORD、NEO4J_PASSWORD

bash scripts/detect-deploy-profile.sh   # 可选，按内存写入资源档位

docker compose up -d --build
docker compose ps
curl -I http://127.0.0.1/
```

服务清单：`sg-mariadb`、`sg-redis`、`sg-neo4j`、`sg-backend`、`sg-frontend`、`sg-nginx`。

### 4.3.3 运维命令

```bash
docker compose logs -f backend
docker compose restart backend
docker compose down              # 停止，保留数据卷
docker compose down -v           # 停止并清空数据库（慎用）
docker compose up -d --build     # 升级重建
```

数据卷：`mariadb_data`、`redis_data`、`neo4j_data`、`backend_uploads`。

### 4.3.4 数据库重置

```bash
docker compose down
docker volume rm smart-grading_mariadb_data smart-grading_redis_data \
  smart-grading_neo4j_data smart-grading_backend_uploads
docker compose up -d --build
```

---

## 4.4 开机自启检查（龙芯 VM）

```bash
systemctl is-enabled mariadb redis nginx smart-grading-backend \
  smart-grading-grading-worker smart-grading-code-runner smart-grading-neo4j docker
```

均应返回 `enabled`。

## 4.5 安全 checklist（生产）

- [ ] 修改 `admin` 及所有测试账号密码
- [ ] 替换 `JWT_SECRET`（≥ 32 位随机）
- [ ] 配置 `PUBLIC_APP_URL` 与 SMTP（启用找回密码时）
- [ ] 确认 Redis 运行（验证码、找回密码、Socket 适配器、**AI 批改队列**）
- [ ] `smart-grading-grading-worker` 已 enable 且 active（与 backend 同机部署）
- [ ] `smart-grading-code-runner` 已 enable 且 active（在线实训演示时 `CODE_RUNNER_ENABLED=1`）
- [ ] 演示全开：`.env.host.example` 中 `CODE_RUNNER_ENABLED=1`、`ONLINE_PRACTICE_AI_REVIEW_ENABLED=1`；管理端 LLM 已配置
- [ ] 配置防火墙，仅开放 80/443
- [ ] 大模型 API Key 通过管理端配置，不入库到 git
- [ ] 确认无 `backend/.env` 覆盖根配置
- [ ] HTTPS：在 Nginx 层配置 SSL 证书

## 4.6 相关文档

- 环境变量 → [05-configuration.md](./05-configuration.md)
- 系统架构 → [02-architecture.md](./02-architecture.md)
