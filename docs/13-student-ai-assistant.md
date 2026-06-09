# 学生端 AI 答疑助手（Phase 1 + Phase 2）

> **文档性质**：模块说明与交付记录  
> **适用版本**：Phase 1（后端）+ Phase 2（前端）  
> **状态**：已复验通过  
> **最后更新**：2026-05-19

---

## 一、模块定位

学生端 **AI 答疑助手**（路由 `/student/assistant`）是面向实训场景的智能学习助手，主要服务于：

| 场景 | 说明 |
|------|------|
| **实训任务理解** | 解释当前行政班 / 教学班任务要求、提交要点 |
| **课程知识答疑** | 优先依据教师知识库回答课程与实训相关知识点 |
| **代码报错排查** | 协助分析报错原因、给出排查思路与示例 |
| **提交规范说明** | 说明 README、目录结构、提交格式等规范 |
| **学习建议** | 在资料不足时提供通用、可操作的学习建议（需明确标注） |

**不是**：开放式闲聊机器人、完整作业代写工具、权威评分系统。

**代码映射（摘要）**

| 层级 | 路径 |
|------|------|
| 前端页面 | `frontend/src/views/student/StudentAssistant.vue` |
| 前端组件 | `frontend/src/components/assistant/*` |
| 前端 API | `frontend/src/api/assistant.js` |
| 后端路由 | `backend/routes/assistantRoutes.js` → `/api/assistant` |
| 后端 Controller | `backend/controllers/assistantController.js` |
| 后端 Service | `backend/services/assistantService.js` |
| Prompt / Mode | `backend/utils/assistantPrompt.js` |
| RAG 检索 | `backend/utils/ragRetrieve.js` |

---

## 二、回答策略

采用 **「RAG 优先 + 任务上下文辅助 + 通用学习兜底」** 的受控开放策略：

```
用户提问
    │
    ├─► 教师知识库 RAG 检索（强命中） ──► 优先依据知识库回答 + 展示来源
    │
    ├─► 本班 / 教学班任务摘要 ──► 结合任务要求回答（问题与任务相关时）
    │
    ├─► 评分类 / 细则类问题且资料不足 ──► 提示需以教师发布要求为准
    │
    └─► 以上均不足 ──► 通用学习建议（必须标注「具体以教师要求为准」）
```

**原则摘要**

1. 知识库有强命中时，优先依据教师知识库，并展示引用来源。
2. 有任务摘要且问题与任务相关时，结合本班任务要求回答。
3. 知识库与任务均不足时，可提供通用学习建议，但必须标注为通用建议。
4. 涉及评分细则、标准答案、提交要求时，资料不足不得编造，应说明需以教师发布要求为准。
5. 不直接代写完整作业；可拆解思路、解释代码、协助排错。

---

## 三、回答模式（mode）

`POST /api/assistant/sessions/:sessionId/messages` 响应中扩展字段 `mode`，取值如下：

| mode | 中文标签 | 触发条件（规则层） |
|------|----------|-------------------|
| `knowledge_base` | 知识库命中 | RAG 强命中（见第四节阈值），`ragHit=true` |
| `task_context` | 任务要求 | 无强 KB 命中，问题与实训/任务/提交等相关，且任务摘要有内容；或评分类问题且任务摘要含对应细则 |
| `general_advice` | 通用学习建议 | 无强 KB 命中，问题与任务无关或任务上下文不足以支撑 |
| `need_teacher_confirm` | 需教师确认 | 评分类 / 细则类问题，且知识库与任务摘要均无法支撑，不编造 |

**响应示例（扩展字段）**

```json
{
  "success": true,
  "data": {
    "answer": "...",
    "mode": "knowledge_base",
    "ragHit": true,
    "sources": [ ... ]
  }
}
```

> 接口路径未变；`mode` / `ragHit` / `sources` 为 Phase 1 扩展字段，不入库。

---

## 四、RAG 来源展示

### 4.1 sources 结构

当知识库检索有结果且满足展示条件时，`sources` 为数组，每项包含：

| 字段 | 说明 |
|------|------|
| `documentId` | 知识库文档 ID |
| `title` | 文档标题 |
| `category` | 分类（guide / standard / example / pitfalls / other） |
| `chunkIndex` | 切块序号 |
| `snippet` | 片段摘要（截断展示） |
| `score` | 余弦相似度，0～1 |

### 4.2 命中阈值

- 检索阶段：从教师知识库取向量块，计算与问题的相似度，取 Top-K。
- **展示 / 模式判定**：`score ≥ 0.3` 的命中才计为「知识库命中」（`mode=knowledge_base`，`ragHit=true`，`sources` 展示）。
- 低于 0.3 的弱相关片段可能仍进入 LLM prompt 辅助生成，但不展示来源卡片、不标为知识库命中。

### 4.3 前端展示

- 有 `sources`：在 AI 回答下方展示「参考资料」卡片（标题、分类、摘要、相似度）。
- `mode=general_advice` 且无 sources：展示「未检索到直接相关的教师知识库内容，以下为通用学习建议，具体以教师要求为准」。
- `mode=need_teacher_confirm`：展示「涉及评分细则或标准答案，请以教师发布的任务要求与评分标准为准」类提示。

---

## 五、上下文范围

### 5.1 多轮对话

- 最近约 **5 轮**（最多 10 条 user/assistant 消息）进入 LLM `messages` 历史。
- 当前问题以 **enriched user message** 形式发送（含任务摘要 + RAG 片段 + 学生原问题）。
- 历史消息以原文进入 LLM，不重复附带 RAG / 任务块。

### 5.2 任务上下文

| 来源 | 规则 |
|------|------|
| **行政班任务** | 学生 `class_id` 对应班级，最近 8 条任务（`teaching_class_id IS NULL`），含要求摘要与评分摘要 |
| **教学班任务** | 学生所属教学班（`teaching_class_students`），最近 8 条任务，含要求摘要与评分摘要 |

### 5.3 知识库教师范围

RAG 检索与知识库教师 ID 聚合范围：

1. 行政班 `classes.teacher_id`
2. 学生所属教学班在 `teaching_class_teachers` 中的任课教师

**约束**：不跨班、不跨教师；仅检索该学生有权限关联的教师知识库。

### 5.4 权限

- 会话归属 `assistant_sessions.student_id`，仅本人可读写。
- 跨学生访问他人 `sessionId` 返回 404。

---

## 六、安全边界

| 边界 | 实现 |
|------|------|
| **不代写完整作业** | System prompt 约束；回答侧重思路、排错、知识点 |
| **不编造评分标准** | 评分类问题资料不足时 `need_teacher_confirm` + 文案提示 |
| **细则不确定** | 明确提示「以教师发布要求为准」 |
| **敏感词拦截** | `system_config.assistant_blocked_words`，命中则 400 |
| **跨学生会话** | 会话查询带 `student_id` 条件，越权拒绝 |
| **LLM 不可用** | 返回明确文案：「AI 服务暂不可用，请稍后重试或联系管理员检查模型配置」，不写入「（无回复）」 |

**本轮未改动**：AI 批改逻辑、知识库上传与切块逻辑、数据库表结构、教师/学生其他模块权限。

---

## 七、前端交互

页面形态：**AI 学习助手工作台**（`StudentAssistant.vue`，workspace 固定高度布局）。

| 区域 | 功能 |
|------|------|
| **左侧** | 会话历史：新对话、会话列表、当前高亮、时间展示 |
| **中间** | 聊天区：欢迎卡片、消息列表、输入框（Enter 发送 / Shift+Enter 换行）、底部免责声明 |
| **右侧** | 本次回答依据：模式、KB 命中、命中文档数、快捷问题、使用提醒 |

**交互要点**

- **快捷问题**：欢迎区与右侧均提供 7 条预设问题，点击填入或直发。
- **模式标签**：每条 AI 回答显示「知识库命中 / 任务要求 / 通用学习建议 / 需教师确认」。
- **来源卡片**：强 KB 命中时展示参考资料。
- **复制回答**：一键复制 AI 正文。
- **打字机效果**：非 SSE，前端展示层逐字渲染。
- **窄屏（≤1100px）**：隐藏右侧依据栏，避免挤压主体；中间聊天区内部滚动，不触发整页滚动。
- **mode/sources 缓存**：`sessionStorage` 按消息 ID 缓存；刷新后历史消息的模式与来源可能丢失（见第九节）。

---

## 八、复验结果

Phase 1 + Phase 2 联调复验记录（2026-05-19）：

| 项 | 结果 |
|----|------|
| `npm run test:grading-contract` | **4/4 通过** |
| `npm run regression:teacher-permissions` | **30/30 通过** |
| `npm run regression:grading` | **8/8 通过** |
| `npm run smoke:assistant-api` | **25/25 通过**（含 HTTP：建会话、发消息、跨学生会话拒绝、响应字段） |
| `frontend npm run build` | **通过** |

**assistant 专项 smoke 覆盖摘要**

- 会话创建、消息发送、`answer/mode/ragHit/sources` 响应结构
- 多轮 prompt 结构（历史进入 LLM messages）
- 教学班任务进入 `taskContext`、KB 教师范围不跨班
- `retrieveTeacherKbHits` 结构化返回 + `retrieveTeacherKbContext` 批改兼容

---

## 九、当前限制

| 限制 | 说明 |
|------|------|
| **mode / sources 不入库** | 仅 POST 响应 + 前端 `sessionStorage`；**刷新页面或换设备后，历史消息的模式标签与来源卡片可能丢失**（正文仍保留） |
| **无 SSE 流式** | 一次性返回完整 `answer`；前端打字机仅为展示效果 |
| **多轮语义** | 历史结构已进 prompt；是否真正理解上文依赖 LLM 能力 |
| **KB 质量** | 命中与回答质量依赖教师知识库内容、向量配置与切块质量 |
| **弱命中不展示** | score &lt; 0.3 不标知识库命中、不展示 sources |
| **发送耗时** | RAG + LLM 可能需十秒至数十秒；前端发送接口超时已设为 120 秒 |
| **本轮未做** | 删除会话、重命名会话（库内）、文件上传问答、语音输入 |

---

## 十、后续计划（可选）

以下均为可选迭代，**尚未排期**：

| 方向 | 说明 |
|------|------|
| **metadata_json 持久化** | 将 `mode` / `sources` 写入 `assistant_messages` 扩展字段，刷新后仍可展示来源 |
| **SSE 流式输出** | 逐 token 推送，降低首字等待体感 |
| **删除会话** | 后端 DELETE 接口 + 前端入口 |
| **重命名会话** | 持久化标题至数据库 |
| **文件问答** | 学生上传代码/文档片段提问 |
| **更细粒度引用** | 段落级高亮、跳转知识库原文 |

---

## 附录：API 一览（未改路径）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/assistant/sessions` | 会话列表 |
| POST | `/api/assistant/sessions` | 新建会话 |
| GET | `/api/assistant/sessions/:sessionId/messages` | 消息列表 |
| POST | `/api/assistant/sessions/:sessionId/messages` | 发送消息（响应含 `answer/mode/ragHit/sources`） |

**联调脚本**：`backend/scripts/assistant-api-smoke-test.js`（`npm run smoke:assistant-api`）  
**单元测试**：`backend/utils/assistantPrompt.test.js`（`npm run test:assistant-prompt`）

**相关文档**：改造前评估见 `docs/14-student-ai-assistant-assessment.md`。
