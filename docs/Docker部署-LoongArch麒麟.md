# Docker 全环境部署指南（LoongArch + 麒麟高级服务器版 / x86 / arm64）

本文档面向**大赛验收**：使用 **Docker + docker compose** 部署，数据库为 **MariaDB**（兼容原 MySQL 协议与 `mysql2` 驱动，**端口 3306 不变**），缓存与 Socket.IO 跨进程使用 **Redis 6379**，后端 **Node 原生 cluster** 监听 **3000**，**不使用 PM2、不使用 Nginx**。

---

## 一、架构说明

| 服务 | 镜像（默认） | 容器名 | 端口 |
|------|----------------|--------|------|
| MariaDB | `mariadb:11.4` | sg-mariadb | 3306 |
| Redis | `redis:7-bookworm` | sg-redis | 6379 |
| 后端 API + Socket.IO | 自建 `backend/Dockerfile` | sg-backend | 3000 |
| 前端 | 自建 `frontend/Dockerfile`（vite preview） | sg-frontend | 5173 |

所有服务位于自定义网络 **`sg-net`**，后端通过主机名 `mariadb`、`redis` 访问数据库与缓存；前端将 `/api`、`/uploads`、`/socket.io` 代理到 `http://backend:3000`。

**环境变量**：仅根目录 **`.env`**（由 `.env.example` 复制）对 Docker 生效；**`.env.example` 本身不会被程序读取**。

---

## 二、龙芯麒麟虚拟机：安装 Docker 与 Compose

以下以**银河麒麟高级服务器版**、**LoongArch** 为例（需 `root` 或 `sudo`）。

### 2.1 安装 Docker Engine

```bash
# 若赛方已预装 Docker，可跳过
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
# 或 dnf / apt，以现场镜像源为准

sudo systemctl enable --now docker
sudo docker version
```

若官方源无 Docker，可使用赛方提供的离线包或龙芯社区文档安装，确保：

```bash
docker compose version
# 或 docker-compose version（V2 推荐 compose 子命令）
```

### 2.2 配置镜像加速（可选）

龙芯云虚拟机若拉取 Hub 较慢，可按赛方要求配置 `/etc/docker/daemon.json` 中的 `registry-mirrors`，然后：

```bash
sudo systemctl restart docker
```

### 2.3 架构自检

```bash
uname -m
# 期望：loongarch64

docker info | grep -i architecture
```

若拉取镜像报 **`exec format error`**，请使用本文 **第八节** 的 LoongArch 覆盖 compose 文件。

---

## 三、获取代码与生成 `.env`

```bash
cd /path/to/项目根目录

cp .env.example .env
# 编辑 .env，至少修改：
#   MARIADB_ROOT_PASSWORD、DB_PASSWORD、JWT_SECRET
```

**切勿**只改 `.env.example` 而不复制为 `.env`。

---

## 四、一键构建与启动

```bash
# 在项目根目录（含 docker-compose.yml）
docker compose up -d --build
```

龙芯环境若 Hub 镜像不兼容：

```bash
docker compose -f docker-compose.yml -f docker-compose.loongarch.yml up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f backend
```

期望日志含：

- `[cluster] primary ... spawning N workers`
- `[socket] Redis adapter ON ...`（**不应**长期停留在 in-memory skipped）

---

## 五、端口占用清理（宿主机）

若 3000 / 5173 / 3306 / 6379 已被占用：

```bash
# 查看占用（麒麟 / 通用 Linux）
sudo ss -tlnp | grep -E '3000|5173|3306|6379'

# 按 PID 结束（示例）
sudo kill -9 <PID>
```

或先停止本项目的 compose：

```bash
docker compose down
```

Windows 开发机：

```powershell
netstat -ano | findstr ":3000"
taskkill /PID <pid> /F
```

---

## 六、MariaDB 初始化与建库

### 6.1 首次启动（自动）

`docker-compose.yml` 已将 `backend/sql/init.sql` 挂载到：

`docker-entrypoint-initdb.d/01-init.sql`

**仅当数据卷为空时**自动执行，创建库 `smart_grading_system` 及全部基础表。

默认账号（由 `.env` 中 `MARIADB_*` / `DB_*` 决定）：

| 用途 | 变量 |
|------|------|
| 应用连接 | `DB_USER` / `DB_PASSWORD` / `DB_NAME` |
| 管理员维护 | `MARIADB_ROOT_PASSWORD` |

`init.sql` 内默认管理员：`admin` / `admin123` — **验收后务必修改**。

### 6.2 验证数据库

```bash
docker exec -it sg-mariadb mariadb -usg_user -p smart_grading_system
# 输入 .env 中 DB_PASSWORD

SHOW TABLES;
SELECT id, username, role FROM users LIMIT 5;
exit
```

### 6.3 增量 migration（旧库升级时）

全新 Docker 部署**一般不需要**。若从旧版 MySQL 迁移，可在宿主机执行：

```bash
chmod +x docker/scripts/apply-migrations.sh
export MARIADB_ROOT_PASSWORD='与 .env 一致'
./docker/scripts/apply-migrations.sh
```

或手工导入单个文件：

```bash
docker exec -i sg-mariadb mariadb -uroot -p smart_grading_system < backend/sql/migration_xxx.sql
```

---

## 七、容器运维命令

```bash
# 重启全部
docker compose restart

# 仅重建后端
docker compose up -d --build backend

# 停止（保留数据卷）
docker compose stop

# 停止并删除容器（保留卷）
docker compose down

# 停止并删除容器 + 数据卷（清空数据库！）
docker compose down -v

# 查看日志
docker compose logs -f mariadb
docker compose logs -f redis
docker compose logs -f backend
docker compose logs -f frontend
```

---

## 八、LoongArch 镜像不兼容处理

1. 确认已安装 **Docker 20.10+** 且支持当前架构。  
2. 使用覆盖文件（镜像名可在 `.env` 中覆盖）：

```bash
docker compose -f docker-compose.yml -f docker-compose.loongarch.yml up -d --build
```

3. 在 `.env` 中可指定（示例，以赛方龙芯源为准）：

```env
NODE_IMAGE=loongnix/node:20
MARIADB_IMAGE=loongnix/mariadb:11
REDIS_IMAGE=loongnix/redis:7
```

4. 仍失败时：向赛方索取 **loongarch64** 版 `mariadb` / `redis` / `node` 镜像 tar，执行 `docker load -i xxx.tar` 后，将 `.env` 中镜像名改为加载后的名称。

**说明**：应用仍使用 `mysql2` 连接 `mariadb:3306`，**无需改 SQL 与业务代码**。

---

## 九、前后端启动验证

### 9.1 后端

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/uploads/
# 200 或 404 均可，说明进程已监听

docker compose logs backend | tail -n 30
```

### 9.2 前端

浏览器访问（将 IP 换为虚拟机地址）：

```text
http://<虚拟机IP>:5173
```

登录：`admin` / `admin123`（若未改）。

### 9.3 Socket.IO + Redis

打开浏览器开发者工具 → Network → WS，应看到 `/socket.io` 连接成功。  
后端日志应含 **`Redis adapter ON`**，且 `REDIS_ENABLED=1`、`REDIS_URL=redis://redis:6379/0` 已随 compose 注入。

### 9.4 集群模式

`.env` 中 `USE_CLUSTER=1`，`CLUSTER_WORKERS` 建议 2～4（按 CPU 核数）。  
`docker compose logs backend` 可见多个 worker pid。

---

## 十、Windows x86 本地开发（同一套 compose）

```powershell
cd 项目根目录
copy .env.example .env
docker compose up -d --build
```

访问 `http://localhost:5173`。本地不用 Docker 时，同样使用根目录 `.env`（将 `DB_HOST`、`REDIS_HOST` 改为 `127.0.0.1`），在 `backend` 目录执行 `npm run start`。

---

## 十一、文件清单

| 文件 | 说明 |
|------|------|
| `docker-compose.yml` | 主编排（MariaDB / Redis / backend / frontend） |
| `docker-compose.loongarch.yml` | 龙芯可选镜像覆盖 |
| `.env.example` | **模板，不生效** |
| `.env` | **实际配置（需自建）** |
| `backend/Dockerfile` | 后端镜像，`CMD node cluster.js` |
| `frontend/Dockerfile` | 前端构建 + vite preview |
| `backend/config/loadEnv.js` | 从根目录 `.env` 加载（兼容旧 `backend/.env` 覆盖） |
| `docker/scripts/apply-migrations.sh` | 可选增量 SQL |

---

## 十二、常见问题

**Q：后端连不上数据库？**  
检查 `docker compose ps` 中 mariadb 是否为 healthy；`docker compose exec backend env | grep DB_`。

**Q：Socket 仍是 in-memory？**  
确认 compose 已传 `REDIS_URL`；`docker compose exec backend env | grep REDIS`。

**Q：前端 502 / 接口失败？**  
确认 `sg-frontend` 与 `sg-backend` 同网；`docker compose logs frontend`。

**Q：想改用宿主机已有 MariaDB？**  
可只启动 `redis` + `backend` + `frontend`，在 `.env` 将 `DB_HOST` 改为宿主机 IP（需自行处理网络，大赛建议全容器化）。

---

验收检查清单：

- [ ] `.env` 已从 `.env.example` 复制并修改密钥  
- [ ] `docker compose ps` 四个服务均为 running / healthy  
- [ ] 浏览器可打开 5173 并登录  
- [ ] 后端日志含 Redis adapter ON、cluster workers  
- [ ] MariaDB 3306、Redis 6379、API 3000 端口符合赛规  
