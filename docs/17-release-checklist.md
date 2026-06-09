# 发布前检查清单

部署、演示或评审前逐项勾选。详细说明见 [04-deployment.md](./04-deployment.md)、[05-configuration.md](./05-configuration.md)、[07-test-plan.md](./07-test-plan.md)。

## 一、配置与密钥

- [ ] `.env` / `.env.host` 已在目标机配置，**未提交 Git**
- [ ] `JWT_SECRET` 已更换为强随机值（非 `dev-secret`）
- [ ] 数据库、Redis、Neo4j 密码已设置且非示例值
- [ ] LLM / DashScope API Key 已配置且未泄露到仓库
- [ ] 默认账号 `admin` / `admin123` 已改密（生产）
- [ ] `PUBLIC_APP_URL` / 前端 `VITE_*` 与真实域名一致

## 二、基础设施

- [ ] MariaDB 可连接，迁移/bootstrap 已成功
- [ ] Redis 可连接（BullMQ 批改依赖）
- [ ] Neo4j 已按需启用（图谱功能可选）
- [ ] Nginx `sudo nginx -t` 通过
- [ ] Nginx 已 reload
- [ ] 后端端口与 Nginx `proxy_pass` 一致（宿主机默认 **8080**）
- [ ] SSE：`location ^~ /api/assistant/` 已配置 `proxy_buffering off`

## 三、进程

- [ ] `smart-grading-backend` 已启动
- [ ] `smart-grading-grading-worker`（BullMQ）已启动
- [ ] **未**同时启动 `worker:grading:legacy` 与 BullMQ worker
- [ ] Code Runner Worker 已按需启动
- [ ] 开机自启已 enable（龙芯 VM：`install-autostart.sh`）

## 四、目录与权限

- [ ] `uploads/` 存在且进程可写
- [ ] `logs/` 存在且可写
- [ ] 前端 `dist/` 已部署到 Nginx root

## 五、构建与测试

- [ ] `cd frontend && npm run build` 通过
- [ ] `npm run test:login-identifier` 通过
- [ ] `npm run test:assistant-stream` 通过
- [ ] `npm run test:submission-feedback` 通过
- [ ] `npm run test:grading-contract` 通过
- [ ] `npm run regression:teacher-permissions` 通过
- [ ] `npm run regression:grading` 通过（**SAFE MODE**，执行前后 `grading_jobs` 数量不变）
- [ ] `npm run staging:env-check` 通过（可选）

## 六、功能抽测

- [ ] 登录 / 验证码 / 单端登录踢出正常
- [ ] 学生多附件提交、内容安全状态正常
- [ ] AI 批改单份/批量入队，Worker 消费完成
- [ ] 重复批改被拦截；重新批改（forceRegrade）仅教师主动触发
- [ ] AI 助手 SSE：`curl -N` 经 Nginx **逐段**输出 delta
- [ ] 附件下载权限：跨教师 403
- [ ] 反馈 / 申请重交流程正常

## 七、演示准备

- [ ] 演示账号与密码已整理（见 [18-demo-script.md](./18-demo-script.md)）
- [ ] 演示数据已整理（无半成品任务、无失败 job 堆积）
- [ ] 7 分钟演示脚本已排练
- [ ] 误触发的测试批改任务（如历史 #130/#131）已识别或忽略

## 八、文档

- [ ] [docs/README.md](./README.md) 链接可访问
- [ ] 运维知晓 `regression:grading:live` 不可在演示库默认执行
- [ ] 龙芯 / 麒麟部署步骤已交接

---

**签字 / 日期**（可选）：__________ / __________
