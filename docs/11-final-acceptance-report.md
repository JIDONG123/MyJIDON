# 11 — Staging 最终验收报告（部署 / 答辩留档）

> **文档性质**：Staging 环境 rehearsal 完成后的正式留档报告。  
> **前置清单**：`docs/11-staging-verification.md`  
> **报告日期**：2026-06-05（Phase E 在线实训 / Code Runner 增补）  
> **验收结论**：**批准 Staging 环境部署与答辩演示**；龙芯 VM 生产部署需完成 §10 专项检查 + §11 待办后另做现场确认。

---

## 1. 测试环境与范围

### 1.1 环境说明

| 项 | 内容 |
|----|------|
| 场景 | 本地 Staging rehearsal（非龙芯 VM 实机） |
| 操作系统 | Windows 10（开发机） |
| 配置来源 | 项目根目录 `.env`（无 `backend/.env` 覆盖） |
| 数据库 | MariaDB 8.0.38 |
| 缓存 / 队列 | Redis（`REDIS_ENABLED=1`） |
| 知识图谱 | Neo4j（`KG_NEO4J_ENABLED=1`；**Phase E 本机未启动**，见 §11） |
| AI | OpenAI 兼容 LLM + Embedding；Qwen-VL 已配置 |
| LangChain 批改 | `USE_LANGCHAIN_GRADING=1` |
| Code Runner | `CODE_RUNNER_MODE=docker`（Windows 开发）；默认 `CODE_RUNNER_ENABLED=0` |

### 1.2 服务拓扑

| 进程 | 命令 | 说明 |
|------|------|------|
| 后端 API | `node server.js` / `npm run start:cluster` | `:3000` |
| 前端 Dev | `npm run dev` | `http://localhost:5173` |
| AI 批改 Worker | `npm run worker:grading` | Redis 队列消费 |
| Code Runner Worker | `npm run worker:code-runner` | 独立进程；`ENABLED=0` 时不启动 |

**答辩默认**：`CODE_RUNNER_ENABLED=0`，主流程走原 7 条 E2E；在线实训为附加演示（需 `=1` + Worker）。

### 1.3 一键环境检查

```powershell
cd backend
npm run staging:env-check
```

| 检查项 | 2026-06-04 | 2026-06-05 Phase E |
|--------|------------|---------------------|
| MariaDB | ✓ | ✓ |
| Redis | ✓ | ✓ |
| Neo4j | ✓ | **✗ 本机未启动**（`ECONNREFUSED :7687`） |
| LLM / Embedding / Qwen-VL | ✓ | ✓ |

---

## 2. 测试账号摘要（不含密钥）

| 角色 | 账号 | 密码 | 用途 |
|------|------|------|------|
| 管理员 | `admin` | `admin123` | 课程监管、数据大屏 |
| 教师 | `test-teacher-01` / `test-teacher-02` | `123456` | 任务、批改、在线实训模板 |
| 学生 | `test-student-01` … `test-student-08` | `123456` | 实训中心、在线实训 |
| 学生（sub #10 属主） | `test-student-03` | `123456` | 成绩报告 E2E |
| 企业导师 | `test-enterprise-02` | `123456` | 企业评分 |

种子：`npm run seed:test`（前缀 `测试-` / `test-`）。

---

## 3. 浏览器 E2E 主流程（7 条）

### 3.1 2026-06-04 浏览器 E2E

| # | 流程 | 账号 | 结果 |
|---|------|------|------|
| 1 | 课程监管 → 教学班 | admin | **通过** |
| 2 | 任务列表 | test-teacher-02 | **通过** |
| 3 | 实训中心上传 | test-student-02 | **通过** |
| 4 | AI 批改 → 教师复核 | test-teacher-02 | **通过**（sub #10） |
| 5 | 成绩报告 | test-student-03 | **通过**（final 83） |
| 6 | 企业评分 | test-enterprise-02 | **通过** |
| 7 | 统计 / 数据大屏 | admin | **通过** |

### 3.2 Phase E 回归（`CODE_RUNNER_ENABLED=0`）

```powershell
npm run phase-e:staging-e2e    # 需 API 已启动且 CODE_RUNNER_ENABLED=0
npm run check:code-runner-disabled          # 503 PASS
```

脚本 `backend/scripts/phase-e-staging-e2e-check.js` 已登记为长期回归命令 `phase-e:staging-e2e`：在 Code Runner 关闭时验证原 Staging 主流程 API 无回归。

**结果**：7 条主流程 API 契约 **12/12 通过**；code-run / online-practice 均 503，实训中心不受影响。

---

## 4. AI 批改闭环 + 导出（2026-06-04）

| 检查项 | 结果 |
|--------|------|
| Word / PDF / 图片 / ZIP 上传 | **通过** |
| Qwen-VL 图片识别 | **通过** |
| 源码 ZIP 解析 | **通过** |
| AI 评分 + dimension_scores | **通过** |
| verification_result + 评语 | **通过** |
| RAG 知识库 | **通过** |
| Neo4j sync-status | **通过**（2026-06-04；Phase E 本机未复测） |
| 教师复核 / 企业双轨 final | **通过** |
| 导出 PDF / Excel / ZIP | **通过** |
| Worker 异步 | **通过** |

---

## 5. 在线实训 + Code Runner（Phase A–E，2026-06-05）

### 5.1 功能范围

| 模块 | 说明 | 状态 |
|------|------|------|
| Code Runner Worker | Docker / Host adapter，五语言 | **通过** |
| `/api/code-run/*` | 异步 job + result | **通过** |
| `/api/online-practice/*` | 模板 CRUD + attempt + run | **通过** |
| 前端在线实训 | 学生工作台 + 教师模板页 | **通过** |
| Task 集成（Phase D） | submit hook、workText、Grading UI | **通过** |
| Feature flag | `ENABLED=0` 隐藏菜单 + 503 | **通过** |

### 5.2 自动化验收

| 命令 | 结果 |
|------|------|
| `npm run smoke:code-runner-languages` | **PASS**（Python/Node/C/C++/Java，transport=redis） |
| `npm run smoke:online-practice-api` | **PASS** |
| `npm run check:code-runner-disabled` | **PASS**（503） |
| `npm run regression:teacher-permissions` | **30/30** |
| `npm run test:grading-contract` | **4/4** |
| `frontend npm run build` | **通过** |

### 5.3 浏览器抽样（`ENABLED=1`）

- 教师：创建 `PhaseE-Python-Hello` → 发布 → 侧栏「在线实训模板」可见  
- 学生：`ENABLED=0` 侧栏隐藏 + 直链告警；实训中心正常  

---

## 6. Staging 期间问题与收口（历史）

| 项 | 状态 |
|----|------|
| sub #11 / job #43 nodemon 卡住 | **已关闭**（stale 回收 + retry） |
| `/admin/big-screen` 空白 | **已关闭** |
| dashboard 残留 job #34 | **已关闭** |
| Windows Docker 误用 `main.exe` | **已修复**（`executionPlatform: 'linux'`） |
| 多 Worker 进程消费旧代码 | **已收口**（验收前 kill 旧 worker 再启动） |

---

## 7. 自动化辅助命令索引

| 命令 | 用途 |
|------|------|
| `npm run seed:test` | 演示种子 |
| `npm run staging:env-check` | 环境连通 |
| `npm run phase-e:staging-e2e` | Phase E 主流程 API（ENABLED=0） |
| `npm run staging:env-check` | MariaDB / Redis / Neo4j / LLM |
| `npm run regression:teacher-permissions` | 教师权限 HTTP |
| `npm run test:grading-contract` | 批改契约 |
| `REGRESSION_HTTP=1 npm run regression:grading` | 批改 job 契约（可选） |
| `npm run smoke:code-runner-languages` | 五语言执行器 |
| `npm run smoke:online-practice-api` | 在线实训 API 闭环 |
| `npm run check:code-runner-disabled` | 503 安全开关 |
| `npm run worker:code-runner` | Code Runner Worker |

---

## 8. 风险与答辩前待办

| 级别 | 项 | 说明 | 建议 |
|------|-----|------|------|
| **中** | **Neo4j 本机未启动** | Phase E `staging:env-check` Neo4j ✗ | **答辩前**启动 Neo4j，重跑 `staging:env-check` + 图谱页面目视 |
| **中** | **龙芯 host 模式** | Windows 仅用 Docker；host adapter 未在龙芯实机 smoke | **答辩前**在龙芯 VM 设 `CODE_RUNNER_MODE=host`，跑 `smoke:code-runner-languages` |
| 中 | 龙芯 VM 部署 §10 | Nginx / systemd / 权限 | 按 `11-staging-verification.md` §8 逐项 |
| 中 | 默认 admin 密码 | 演示口令 | **生产必须修改** |
| 低 | Feature probe 缓存 | 切换 `ENABLED` 后需整页刷新侧栏 | 演示脚本说明 |
| 低 | Worker 勿用 nodemon | 仅 `worker:grading:dev` | 生产用 systemd |

---

## 9. 龙芯 VM 部署检查（待实机确认）

- [ ] `curl -I http://127.0.0.1/` 200  
- [ ] SPA 路由刷新不 404  
- [ ] 上传大小与 Nginx 协调  
- [ ] 项目路径及 `frontend/dist` 权限  
- [ ] 修改默认 `admin` 密码  
- [x] `smart-grading-grading-worker` / `smart-grading-code-runner` systemd（`install-autostart.sh`）
- [ ] 龙芯 VM 实机：`CODE_RUNNER_MODE=host` + `npm run smoke:code-runner-languages`

---

## 10. 验收结论

| 维度 | 结论 |
|------|------|
| Staging 主流程（7 条 E2E） | **通过** — Phase E 在 `ENABLED=0` 下无回归 |
| AI 批改闭环 | **通过**（2026-06-04） |
| 在线实训 + Code Runner | **通过** — Phase E 本地 Staging rehearsal |
| 权限 / 批改契约 | **通过** — 30/30 + 4/4 |
| 基础设施 | **条件允许** — Neo4j 答辩前补测 |
| Staging / 答辩演示 | **批准** |
| 龙芯 VM 生产 | **条件允许批准** — 完成 §9 + §11 待办 |

---

## 11. 答辩前待办清单（必做）

1. [ ] 启动本机 / Staging Neo4j → `npm run staging:env-check` 全绿  
2. [ ] 龙芯 VM：`CODE_RUNNER_MODE=host` + `npm run smoke:code-runner-languages`  
3. [ ] 确认答辩默认 `CODE_RUNNER_ENABLED=0`；演示在线实训时临时 `=1` 并启动 Worker  
4. [ ] 生产修改 `admin` 默认密码  

---

## 12. 相关文档

| 资源 | 路径 |
|------|------|
| Staging 逐步清单 | `docs/11-staging-verification.md` |
| 在线实训 / Code Runner | `docs/12-online-practice-code-runner.md` |
| 部署 / 配置 | `docs/04-deployment.md`、`docs/05-configuration.md` |
| 教师权限测试 | `docs/08-teacher-permission-tests.md` |

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-06-04 | Staging rehearsal 完成；主流程 + AI 闭环 |
| 2026-06-05 | Phase E：在线实训 / Code Runner 验收；Neo4j / 龙芯 host 列为答辩前待办 |
