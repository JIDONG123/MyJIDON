# 安全设计

> 龙芯智训 · 校企实训智慧评价平台

## 1. 认证与会话

- **JWT** 存于前端 `localStorage`（或项目约定存储），请求头 `Authorization: Bearer`
- **单端登录**：`user_sessions` 表 + Socket.IO 踢出旧会话
- **图形验证码**：登录防暴力破解
- **SMTP 找回密码**：令牌有时效，不暴露用户是否存在（统一提示）
- **初始密码强制修改**：导入学生账号首次登录改密

生产必须设置强随机 `JWT_SECRET`，禁用默认 `dev-secret`。

## 2. 授权与数据隔离

| 角色 | 范围 |
|------|------|
| admin | 全校 |
| 课程负责人 / 教学班教师 | 所属课程、教学班任务与提交 |
| 行政班教师 | 行政班链路任务（legacy） |
| 企业导师 | 授权企业维度提交与评价 |
| 学生 | 本人提交、报告、AI 助手 |

教师 **仅任务创建者**（及 admin）可 AI 批改、导出、复核他人任务 — 见 `regression:teacher-permissions`。

## 3. 附件与下载

- 下载接口校验 `teacherOwnsSubmissionTask` / 学生本人 / 企业授权
- 上传：类型、大小、扩展名校验；ZIP 解压防路径穿越（`safeZipArchive`）
- **内容安全**：敏感词/策略审核；`pending_review` 状态禁止 AI 批改

## 4. AI 与外部服务

- **LLM API Key** 仅存环境变量或管理端加密配置，不入库明文、不进 Git
- **AI 批改**：BullMQ 异步；防重复入队；`forceRegrade` 需显式参数
- **AI 助手 SSE**：Nginx 关闭缓冲；响应头 `X-Accel-Buffering: no`
- **RAG**：教师知识库按课程/任务隔离检索

## 5. 密钥与配置

| 项 | 要求 |
|----|------|
| `.env` | 仅本地/服务器，**不提交 Git** |
| `.env.example` | 仅占位符 |
| 数据库/Redis/Neo4j | 强密码，内网访问 |
| DashScope / Qwen | 轮换泄露过的 Key |

## 6. 脚本与运维安全

| 脚本 | 默认 |
|------|------|
| `npm run regression:grading` | SAFE，不写 grading_jobs |
| `npm run regression:grading:live` | LIVE，显式警告 |
| `npm run seed:test` | 需 `SCRIPT_ALLOW_MUTATION=1` |
| smoke 导入测试 | 需 mutation，会 DELETE 测试用户 |

**禁止**在演示库/生产库默认运行 LIVE 回归或 seed。

## 7. 依赖与部署

- HTTPS 由 Nginx 终止（生产）
- CORS 按部署域名配置
- Worker 与 API 分离进程，Redis 不暴露公网
- 日志不含密码与完整 JWT

## 8. 事件响应

若密钥泄露：轮换密钥 → 重启 backend/worker → 强制用户重新登录 → 检查异常 grading_jobs / 导入批次。
