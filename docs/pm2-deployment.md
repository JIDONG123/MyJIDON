# PM2 企业级部署说明（Windows / Linux / 龙芯 LoongArch + 银河麒麟）

本文档配合项目根目录 `backend/pm2.config.js` 使用，**不修改任何业务代码**；多进程仍由现有 `cluster.js` 按 CPU 自动 fork Worker，PM2 仅托管 **1 个主进程**，避免与自建集群重复倍增进程。

## 1. 安装 PM2（全局）

```bash
npm install -g pm2
pm2 -v
```

- **龙芯 / 麒麟**：使用与系统架构匹配的 Node.js（如 `linux-loong64` 官方或发行版仓库），再执行同上命令即可；PM2 为纯 JS，无额外二进制架构依赖。

## 2. 一键命令（在 `backend` 目录）

| 场景 | 命令 |
|------|------|
| 生产启动 | `npm run pm2:start` |
| 开发环境（限制 2 Worker） | `npm run pm2:start:dev` |
| 停止 | `npm run pm2:stop` |
| 重启 | `npm run pm2:restart` |
| 查看状态 | `npm run pm2:status` |
| 实时日志 | `npm run pm2:logs` |
| 仅错误日志 | `npm run pm2:logs:err` |
| 监控面板 | `npm run pm2:monit` |
| 持久化进程列表（开机自启前必做） | `npm run pm2:save` |

等价裸命令：

```bash
cd backend
pm2 start pm2.config.js --env production
```

## 3. 日志目录与切割

- **错误日志**：`backend/logs/pm2/smart-grading-api-error.log`
- **标准输出**：`backend/logs/pm2/smart-grading-api-out.log`

PM2 内置写入上述文件；**按大小切割**建议安装官方模块（一次性执行）：

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
```

修改后执行 `pm2 save`（若已配置开机自启）。

## 4. 崩溃 / 内存重启策略（已在 pm2.config.js）

- `autorestart: true`：异常退出自动拉起。
- `max_memory_restart`：主进程 RSS 超限重启（cluster **primary** 进程通常占用很小；Worker 为子进程，极端场景请配合主机监控或 APM）。
- `min_uptime` + `max_restarts` + `restart_delay` + `exp_backoff_restart_delay`：短时间连续崩溃会退避并熔断，避免死循环重启。

业务侧 Redis / MySQL / 队列 **无需改配置**；仅进程托管方式变化。

## 5. 服务器重启后自动拉起（Linux / 麒麟）

在部署用户下（与运行 Node 的用户一致）：

```bash
pm2 startup
# 按输出提示执行一条以 sudo 开头的命令（systemd）
pm2 start pm2.config.js --env production
pm2 save
```

验证：`sudo reboot` 后执行 `pm2 status`，应看到 `smart-grading-api` 为 **online**。

## 6. Windows 开发 / 生产常驻

- **关闭终端不退出**：使用 PM2 托管后，进程脱离当前终端生命周期（勿用「仅当前 CMD 窗口」直接 `node cluster.js`）。
- **开机自启**：Windows 无官方 `pm2 startup` 同源方案，可选用：
  - [pm2-windows-service](https://github.com/jon-hall/pm2-windows-service) 等将 PM2 注册为服务；或
  - **任务计划程序**：用户登录/系统启动时执行 `pm2 resurrect`（需先 `pm2 save`）。

生产环境仍建议使用 **Linux/麒麟 + systemd + pm2 startup**。

## 7. 与现有架构的边界

| 组件 | 说明 |
|------|------|
| `cluster.js` | 继续负责 Worker 数量（`USE_CLUSTER`、`CLUSTER_WORKERS`、CPU 上限 64）。 |
| PM2 | 仅 **1 实例 fork** `cluster.js`，**不要**再开 PM2 `cluster_mode` 多实例。 |
| Redis / MySQL | 连接池与队列逻辑不变；多 Worker 下注意连接池总量 ≤ 数据库 `max_connections`。 |

## 8. 环境变量

生产建议在系统环境或 `.env` 中配置密钥与数据库；`pm2.config.js` 中 `env_production` 已设置 `NODE_ENV=production`、`USE_CLUSTER=1`。可选在服务器上导出：

```bash
export NODE_ENV=production
export USE_CLUSTER=1
# 不设 CLUSTER_WORKERS 则按 CPU 核心数自动适配
```

---

若升级 PM2 主版本，请以 [PM2 官方文档](https://pm2.keymetrics.io/) 为准核对 ecosystem 字段。
