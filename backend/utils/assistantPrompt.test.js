const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveAnswerMode,
  buildLlmMessages,
  LLM_UNAVAILABLE_MESSAGE,
  filterHitsForMode,
} = require('./assistantPrompt');

describe('resolveAnswerMode', () => {
  it('returns knowledge_base when hits present', () => {
    const r = resolveAnswerMode({
      hits: [{ documentId: 1 }],
      taskCtx: 'x'.repeat(100),
      userQuestion: 'hello',
    });
    assert.equal(r.mode, 'knowledge_base');
    assert.equal(r.ragHit, true);
  });

  it('returns general_advice when no hits and no task', () => {
    const r = resolveAnswerMode({ hits: [], taskCtx: '', userQuestion: 'Vue 路由怎么配置？' });
    assert.equal(r.mode, 'general_advice');
    assert.equal(r.ragHit, false);
  });

  it('returns need_teacher_confirm for scoring question without scoring info', () => {
    const r = resolveAnswerMode({
      hits: [],
      taskCtx: '【行政班任务 1】实训\n要求摘要：完成登录页面',
      userQuestion: '这次任务创新扩展占多少分？',
    });
    assert.equal(r.mode, 'need_teacher_confirm');
    assert.equal(r.ragHit, false);
  });

  it('returns task_context when task has scoring detail matching question', () => {
    const r = resolveAnswerMode({
      hits: [],
      taskCtx:
        '【行政班任务 1】实训\n要求摘要：完成登录\n评分摘要：创新扩展占 20 分，功能完整 30 分',
      userQuestion: '创新扩展占多少分？',
    });
    assert.equal(r.mode, 'task_context');
  });

  it('returns need_teacher_confirm when scoring asked but term missing in task ctx', () => {
    const r = resolveAnswerMode({
      hits: [],
      taskCtx: '【行政班任务 1】实训\n要求摘要：完成登录\n评分摘要：功能完整 30 分',
      userQuestion: '创新扩展占多少分？',
    });
    assert.equal(r.mode, 'need_teacher_confirm');
  });

  it('returns general_advice for unrelated programming question even with tasks', () => {
    const r = resolveAnswerMode({
      hits: [],
      taskCtx: '【行政班任务 1】实训\n要求摘要：完成登录页面',
      userQuestion: 'Vue 组合式 API 和选项式 API 区别？',
    });
    assert.equal(r.mode, 'general_advice');
  });

  it('returns task_context when question relates to training task', () => {
    const r = resolveAnswerMode({
      hits: [],
      taskCtx: '【行政班任务 1】实训\n要求摘要：完成登录页面',
      userQuestion: '解释当前任务要求',
    });
    assert.equal(r.mode, 'task_context');
  });
});

describe('buildLlmMessages', () => {
  it('includes prior user/assistant turns and enriched final user message', () => {
    const history = [
      { role: 'user', content: 'Python 列表怎么求平均值？' },
      { role: 'assistant', content: '可以用 sum(lst)/len(lst)' },
      { role: 'user', content: '那如果列表为空怎么办？' },
    ];
    const msgs = buildLlmMessages({
      systemPrompt: 'sys',
      historyRows: history,
      enrichedUserMessage: 'ENRICHED',
      maxHistoryMessages: 10,
    });
    assert.equal(msgs[0].role, 'system');
    assert.equal(msgs[1].content, history[0].content);
    assert.equal(msgs[2].content, history[1].content);
    assert.equal(msgs[msgs.length - 1].role, 'user');
    assert.equal(msgs[msgs.length - 1].content, 'ENRICHED');
    assert.equal(msgs.length, 4);
  });

  it('excludes current user row from history (last row) when building prior', () => {
    const history = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2-current' },
    ];
    const msgs = buildLlmMessages({
      systemPrompt: 'sys',
      historyRows: history,
      enrichedUserMessage: 'ENRICHED-q2',
    });
    assert.deepEqual(
      msgs.filter((m) => m.role !== 'system').map((m) => m.content),
      ['q1', 'a1', 'ENRICHED-q2']
    );
  });
});

describe('filterHitsForMode', () => {
  it('keeps only hits above threshold', () => {
    const hits = [
      { score: 0.45, title: 'a' },
      { score: 0.12, title: 'b' },
    ];
    assert.equal(filterHitsForMode(hits).length, 1);
    assert.equal(filterHitsForMode(hits)[0].title, 'a');
  });
});

describe('LLM_UNAVAILABLE_MESSAGE', () => {
  it('is explicit and not placeholder', () => {
    assert.match(LLM_UNAVAILABLE_MESSAGE, /AI 服务暂不可用/);
    assert.doesNotMatch(LLM_UNAVAILABLE_MESSAGE, /无回复/);
  });
});
