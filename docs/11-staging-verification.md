# 11 — Staging / 龙芯部署验证清单

> **用途**：Staging 或龙芯 VM 上线前的逐步验证（非最终答辩报告）。  
> **最终留档报告**：`11-final-acceptance-report.md`（2026-06-04 Staging 验收通过，答辩 / 部署归档用）。

---

## 0. 环境模板

| 场景 | 模板 | 安装 |
|------|------|------|
| 龙芯 VM 宿主机 | `.env.host.example` | `sudo bash scripts/install-autostart.sh` |
| 云 ECS Docker | `.env.example` | `docker compose up -d --build` |
| 本地 Staging  rehearsal | 根目录 `.env` | 手动三终端（见下） |

**禁止**：保留 `backend/.env` 覆盖根 `.env`（见 `05-configuration.md`）。

---

## 1. 必改 `.env` 项（Staging / 生产）

```env
REDIS_ENABLED=1
REDIS_URL=redis://127.0.0.1:6379/0          # 龙芯 VM
KG_NEO4J_ENABLED=1
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<与 Neo4j 实际密码一致>
USE_LANGCHAIN_GRADING=1
QWEN_VL_API_KEY=<通义视觉，按需>
PUBLIC_APP_URL=http://<对外IP或域名>        # 勿带末尾 /
JWT_SECRET=<≥32位随机>
```

管理端 **系统设置**（`system_config`）另配：`llm_api_base` / `llm_api_key` / `llm_model`、`embedding_*`。

---

## 2. 一键环境检查

```powershell
cd backend
npm run staging:env-check
```

期望：MariaDB ✓、Redis ✓、Neo4j ✓、LLM ✓、Embedding ✓、Qwen-VL ✓。

**当前本机 rehearsal 结果（示例）**：Neo4j 认证失败 → 修正 `NEO4J_PASSWORD` 与 Neo4j 实例一致后重跑。

---

## 3. 服务启动顺序

### 3.1 龙芯 VM（systemd）

```bash
sudo systemctl enable --now mariadb redis nginx neo4j   # 或 smart-grading-neo4j
sudo systemctl restart smart-grading-backend smart-grading-grading-worker
systemctl status smart-grading-backend smart-grading-grading-worker
journalctl -u smart-grading-grading-worker -f        # 观察消费队列
```

### 3.2 本地 / Staging 手动三终端

```powershell
# 终端 1 — API
cd backend
npm run dev          # 或 npm start（生产模式）

# 终端 2 — 前端（开发）或 Nginx 托管 dist
cd frontend
npm run dev          # 或 nginx 指向 frontend/dist

# 终端 3 — AI 批改 Worker（必须）
cd backend
npm run worker:grading
```

**验收点**：教师触发 AI 批改后，Worker 日志出现 job 消费；页面不长时间卡在「批改中」。

---

## 4. Neo4j 连通

| 步骤 | 命令 / 操作 |
|------|-------------|
| 密码一致 | `.env` 的 `NEO4J_PASSWORD` = Neo4j 实际密码 |
| 端口 | `bolt://127.0.0.1:7687` 可达 |
| 浏览器 | `http://127.0.0.1:7474`（若启用 HTTP） |
| 应用 | 教师端知识图谱 / `GET /api/kg/sync-status` 不 500 |
| 降级 | Neo4j 不可用时页面提示降级，**不可崩溃** |

龙芯 Docker Neo4j segfault 时改宿主机安装：见 `04-deployment.md` §4.2.6。

---

## 5. 浏览器 E2E 主流程（7 条）

使用种子账号（`npm run seed:test`）或演示数据。

| # | 流程 | 账号 | 通过 |
|---|------|------|------|
| 1 | 登录 → 课程监管 → 教学班查看 | admin | ☐ |
| 2 | 发布任务 → 任务列表可见 | test-teacher-02 | ☐ |
| 3 | 实训中心 → 选教学班 → 上传成果 | test-student-01 | ☐ |
| 4 | AI 批改 → 教师复核 | test-teacher-02 | ☐ |
| 5 | 查看成绩报告 | test-student-01 | ☐ |
| 6 | 授权教学班 → 企业评分 | test-enterprise-01 | ☐ |
| 7 | 统计 / 数据大屏 | admin → `/admin/big-screen` 或 `/admin/dashboard` | ☐ |

---

## 6. AI 批改闭环 + 导出

| # | 检查项 | 通过 |
|---|--------|------|
| 1 | Word / PDF / 图片 / zip 上传 | ☐ |
| 2 | Qwen-VL 图片识别 | ☐ |
| 3 | 源码 zip 解析 | ☐ |
| 4 | AI 评分 + `dimension_scores` | ☐ |
| 5 | `verification_result` + 评语 / 建议 | ☐ |
| 6 | RAG 知识库依据（管理端上传文档后） | ☐ |
| 7 | Neo4j 图谱辅助或降级提示 | ☐ |
| 8 | 教师复核后综合分更新 | ☐ |
| 9 | 学生成绩报告为复核后结果 | ☐ |
| 10 | 导出 PDF / Excel / ZIP | ☐ |
| 11 | 批改完成通知 + 跳转 | ☐ |
| 12 | Worker 不阻塞页面（异步） | ☐ |

---

## 7. 自动化辅助（不替代 E2E）

```powershell
cd backend
npm run seed:test
npm run staging:env-check
npm run regression:teacher-permissions
npm run test:grading-contract
npm run phase-e:staging-e2e   # 需 API 已启动且 CODE_RUNNER_ENABLED=0
$env:REGRESSION_HTTP=1; npm run regression:grading   # 需 API 已启动
cd ../frontend && npm run build
```

**`phase-e:staging-e2e`**：在 `CODE_RUNNER_ENABLED=0` 下以 API 契约复验 Staging 7 条主流程（教学班、任务、实训提交、批改、报告、企业评分、数据大屏），并确认 code-run / online-practice 返回 503，不影响实训中心。详见 `docs/11-final-acceptance-report.md` §3.2。

---

## 8. 龙芯 VM 专项

- [ ] `curl -I http://127.0.0.1/` 200
- [ ] 刷新任意前端路由不 404（Nginx `try_files`）
- [ ] `client_max_body_size` 与后端上传限制协调（Nginx 100m，后端单文件 50m）
- [ ] `chmod 755` 项目路径及 `frontend/dist`
- [ ] 修改默认 `admin` 密码
- [ ] `journalctl -u smart-grading-grading-worker` 无持续报错

---

## 9. 完成后

全部 E2E + 闭环通过后，生成 **最终验收报告**（答辩留档），建议包含：

1. 测试时间与 Staging / 龙芯环境说明  
2. 测试账号与配置摘要（不含密钥）  
3. 通过 / 失败 / 风险项  
4. 截图或关键 API 结果  
5. 是否批准生产部署  

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-06-04 | 生成最终验收报告 `11-final-acceptance-report.md` |
