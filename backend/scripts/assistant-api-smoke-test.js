#!/usr/bin/env node
/**
 * AI 答疑助手 smoke
 *
 * 默认 SAFE（不调用 LLM、不创建长会话、不写 assistant_messages）：
 *   npm run smoke:assistant-api
 *
 * LIVE（真实 generateAssistantReply / HTTP 发消息，可能消耗 LLM）：
 *   SCRIPT_LIVE_AI=1 npm run smoke:assistant-api
 *   或 ASSISTANT_SMOKE_LIVE=1 npm run smoke:assistant-api
 *
 * HTTP 层（需后端已启动）：
 *   ASSISTANT_HTTP=1 npm run smoke:assistant-api
 */
require('../config/loadEnv').loadEnv();

const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { printModeBanner } = require('./lib/scriptSafety');
const {
  resolveAnswerMode,
  buildLlmMessages,
  LLM_UNAVAILABLE_MESSAGE,
} = require('../utils/assistantPrompt');
const { isAssistantStreamEnabled } = require('../utils/sseHelper');
const {
  kbTeacherIdsForStudent,
  taskContextForStudent,
  generateAssistantReply,
} = require('../services/assistantService');
const { retrieveTeacherKbHits, retrieveTeacherKbContext } = require('../utils/ragRetrieve');

const LIVE_AI =
  process.env.SCRIPT_LIVE_AI === '1' || process.env.ASSISTANT_SMOKE_LIVE === '1';
const HTTP = process.env.ASSISTANT_HTTP === '1' || process.env.ASSISTANT_HTTP === 'true';
const BASE = process.env.ASSISTANT_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed += 1;
  console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`);
}

async function tokenFor(username) {
  const [rows] = await pool.query('SELECT id, username, role FROM users WHERE username=? LIMIT 1', [
    username,
  ]);
  if (!rows[0]) throw new Error(`user not found: ${username}`);
  return jwt.sign(
    { id: rows[0].id, username: rows[0].username, role: rows[0].role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function api(method, path, token, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assertResponseShape(data) {
  const errors = [];
  if (typeof data?.answer !== 'string' || !data.answer.trim()) errors.push('answer missing');
  if (!['knowledge_base', 'task_context', 'general_advice', 'need_teacher_confirm'].includes(data?.mode)) {
    errors.push(`invalid mode: ${data?.mode}`);
  }
  if (typeof data?.ragHit !== 'boolean') errors.push('ragHit not boolean');
  if (!Array.isArray(data?.sources)) errors.push('sources not array');
  for (const s of data?.sources || []) {
    for (const k of ['documentId', 'title', 'category', 'chunkIndex', 'snippet', 'score']) {
      if (s[k] === undefined) errors.push(`source missing ${k}`);
    }
  }
  return errors;
}

async function findStudentWithKbTeachers() {
  const [rows] = await pool.query(`
    SELECT u.id, u.username
    FROM users u
    WHERE u.role = 'student'
      AND EXISTS (
        SELECT 1 FROM kb_chunks c
        WHERE c.teacher_id IN (
          SELECT c2.teacher_id FROM classes c2 WHERE c2.id = u.class_id
          UNION
          SELECT tct.teacher_id FROM teaching_class_students tcs
          JOIN teaching_class_teachers tct ON tct.teaching_class_id = tcs.teaching_class_id
          WHERE tcs.student_id = u.id
        )
        AND c.embedding IS NOT NULL
      )
    LIMIT 1
  `);
  return rows[0] || null;
}

async function testModeResolutionUnit() {
  console.log('\n[unit] mode resolution');
  const kb = resolveAnswerMode({ hits: [{ id: 1 }], taskCtx: '', userQuestion: 'x' });
  if (kb.mode === 'knowledge_base' && kb.ragHit) ok('knowledge_base');
  else fail('knowledge_base', JSON.stringify(kb));

  const gen = resolveAnswerMode({ hits: [], taskCtx: '', userQuestion: 'Vue 路由怎么配置？' });
  if (gen.mode === 'general_advice') ok('general_advice');
  else fail('general_advice', JSON.stringify(gen));

  const confirm = resolveAnswerMode({
    hits: [],
    taskCtx: '【任务】\n要求摘要：做页面',
    userQuestion: '这次任务创新扩展占多少分？',
  });
  if (confirm.mode === 'need_teacher_confirm') ok('need_teacher_confirm');
  else fail('need_teacher_confirm', JSON.stringify(confirm));
}

async function testMultiTurnMessagesUnit() {
  console.log('\n[unit] multi-turn llm messages');
  const history = [
    { role: 'user', content: 'Python 列表怎么求平均值？' },
    { role: 'assistant', content: '使用 sum/len' },
    { role: 'user', content: '那如果列表为空怎么办？' },
  ];
  const msgs = buildLlmMessages({
    systemPrompt: 'sys',
    historyRows: history,
    enrichedUserMessage: 'ENRICHED-round3',
  });
  const contents = msgs.filter((m) => m.role !== 'system').map((m) => m.content);
  if (contents[0]?.includes('平均值') && contents[1]?.includes('sum') && contents[2] === 'ENRICHED-round3') {
    ok('history includes round1/2 + enriched round3');
  } else {
    fail('multi-turn messages', JSON.stringify(contents));
  }
}

async function testSseHelperUnit() {
  console.log('\n[unit] SSE helper');
  if (typeof isAssistantStreamEnabled() === 'boolean') ok('isAssistantStreamEnabled callable');
  else fail('isAssistantStreamEnabled');
}

async function testTeacherScope(studentId) {
  console.log('\n[db read-only] teacher scope & task context');
  const teacherIds = await kbTeacherIdsForStudent(studentId);
  if (Array.isArray(teacherIds)) ok(`kbTeacherIds count=${teacherIds.length}`);
  else fail('kbTeacherIdsForStudent');

  const taskCtx = await taskContextForStudent(studentId);
  if (typeof taskCtx === 'string') {
    ok(`taskContext length=${taskCtx.length}`);
    if (/教学班任务/.test(taskCtx)) ok('teaching class tasks in context');
    else console.log('  · 该学生暂无教学班任务摘要（跳过教学班断言）');
  } else fail('taskContextForStudent');

  if (teacherIds.length) ok('teacher scope query ok');
}

async function testRagStructured(teacherIds) {
  console.log('\n[db read-only] structured RAG retrieval (no LLM)');
  const q = '实训 提交 规范 README';
  const hits = await retrieveTeacherKbHits(teacherIds.slice(0, 3), q, 4);
  if (hits && typeof hits.contextText === 'string' && Array.isArray(hits.hits)) {
    ok('retrieveTeacherKbHits shape');
    if (hits.hits.length) {
      const h = hits.hits[0];
      if (h.documentId != null && h.title && h.snippet != null && h.score != null) ok('hit fields');
      else fail('hit fields', JSON.stringify(h));
    } else {
      console.log('  · 无 KB 命中（跳过 hit 字段断言）');
    }
  } else fail('retrieveTeacherKbHits shape');

  const legacy = await retrieveTeacherKbContext(teacherIds[0], q, 4);
  if (typeof legacy === 'string') ok('retrieveTeacherKbContext backward compatible');
  else fail('retrieveTeacherKbContext');
}

async function testGenerateReply(studentId, sessionId, question, expect) {
  const r = await generateAssistantReply({ studentId, sessionId, question });
  const shapeErr = assertResponseShape(r);
  if (shapeErr.length) {
    fail(`shape ${question.slice(0, 12)}`, shapeErr.join('; '));
    return null;
  }
  ok(`reply shape ok: ${question.slice(0, 16)}… mode=${r.mode}`);

  if (expect?.mode && r.mode !== expect.mode) {
    fail(`mode expect ${expect.mode} got ${r.mode}`, question);
  } else if (expect?.mode) {
    ok(`mode=${expect.mode}`);
  }
  if (expect?.ragHit != null && r.ragHit !== expect.ragHit) {
    fail(`ragHit expect ${expect.ragHit} got ${r.ragHit}`);
  }
  if (expect?.minSources != null && (r.sources?.length || 0) < expect.minSources) {
    fail(`sources length ${r.sources?.length}`);
  }
  if (r.answer.includes('（无回复）')) fail('answer contains placeholder 无回复');
  if (!r.answer.trim()) fail('empty answer');
  return r;
}

async function testServiceLayerLive(student) {
  console.log('\n[service LIVE] generateAssistantReply (calls LLM)');
  const studentId = student.id;
  const [ins] = await pool.query(
    `INSERT INTO assistant_sessions (student_id, title) VALUES (?, 'smoke-test-live')`,
    [studentId]
  );
  const sessionId = ins.insertId;

  try {
    await pool.query(`INSERT INTO assistant_messages (session_id, role, content) VALUES (?, 'user', ?)`, [
      sessionId,
      'Python 列表怎么求平均值？',
    ]);
    await pool.query(
      `INSERT INTO assistant_messages (session_id, role, content) VALUES (?, 'assistant', ?)`,
      [sessionId, '可以用 sum(lst)/len(lst)，注意空列表。']
    );
    await pool.query(`INSERT INTO assistant_messages (session_id, role, content) VALUES (?, 'user', ?)`, [
      sessionId,
      '那如果列表为空怎么办？',
    ]);

    await testGenerateReply(studentId, sessionId, '那如果列表为空怎么办？', {});

    await pool.query(`INSERT INTO assistant_messages (session_id, role, content) VALUES (?, 'user', ?)`, [
      sessionId,
      '能不能给我一个简单例子？',
    ]);
    const round3 = await testGenerateReply(studentId, sessionId, '能不能给我一个简单例子？', {});

    await testGenerateReply(studentId, sessionId, 'Vue 组合式 API 和选项式 API 区别？', {});

    if (round3?.answer === LLM_UNAVAILABLE_MESSAGE) {
      ok('LLM unavailable returns explicit message');
    } else if (round3?.answer?.length > 10) {
      ok('LLM returned content');
    }
  } finally {
    await pool.query('DELETE FROM assistant_messages WHERE session_id = ?', [sessionId]);
    await pool.query('DELETE FROM assistant_sessions WHERE id = ?', [sessionId]);
  }
}

async function testSafeHttpLayer(studentUsername, otherUsername) {
  console.log('\n[http SAFE] auth & validation (no LLM message send)');

  const unauth = await api('GET', '/api/assistant/sessions', null);
  if (unauth.status === 401) ok('GET sessions requires auth');
  else fail('GET sessions auth', `status=${unauth.status}`);

  const studentToken = await tokenFor(studentUsername);
  const list = await api('GET', '/api/assistant/sessions', studentToken);
  if (list.status === 200 && list.json?.success !== false) ok('GET sessions 200');
  else fail('GET sessions', JSON.stringify(list.json));

  const emptyBody = await api('POST', '/api/assistant/sessions/999999999/messages', studentToken, {
    content: '',
  });
  if (emptyBody.status === 400 || emptyBody.status === 404) ok('empty content or invalid session rejected');
  else fail('empty/invalid message', `status=${emptyBody.status}`);

  const missingSession = await api('POST', '/api/assistant/sessions/999999999/messages', studentToken, {
    content: '仅测试路由',
  });
  if (missingSession.status === 404) ok('nonexistent session 404');
  else fail('nonexistent session', `status=${missingSession.status}`);

  if (otherUsername) {
    try {
      const otherToken = await tokenFor(otherUsername);
      const cross = await api('POST', '/api/assistant/sessions/999999999/messages', otherToken, {
        content: '越权测试',
      });
      if (cross.status === 404 || cross.status === 403) ok('cross-student on foreign session denied');
      else fail('cross-student session', `status=${cross.status}`);
    } catch (e) {
      console.log(`  · 跳过 cross-student（用户 ${otherUsername} 不存在）`);
    }
  }
}

async function testHttpLayerLive(studentUsername, otherUsername) {
  console.log('\n[http LIVE] assistant API (may call LLM)');
  const studentToken = await tokenFor(studentUsername);
  const otherToken = await tokenFor(otherUsername);

  const created = await api('POST', '/api/assistant/sessions', studentToken, { title: 'http-smoke-live' });
  if (created.status !== 201 || !created.json?.data?.id) {
    fail('create session', JSON.stringify(created.json));
    return;
  }
  ok('create session');
  const sid = created.json.data.id;

  const cross = await api('POST', `/api/assistant/sessions/${sid}/messages`, otherToken, {
    content: '越权测试',
  });
  if (cross.status === 404 || cross.status === 403) ok('cross-student session denied');
  else fail('cross-student session', `status=${cross.status}`);

  const sent = await api('POST', `/api/assistant/sessions/${sid}/messages`, studentToken, {
    content: 'Python 列表怎么统计平均分？',
  });
  if (sent.status !== 200) {
    fail('send message', JSON.stringify(sent.json));
    return;
  }
  const data = sent.json?.data;
  const errs = assertResponseShape(data);
  if (!errs.length) ok('POST messages response fields');
  else fail('POST messages response', errs.join('; '));

  await pool.query('DELETE FROM assistant_messages WHERE session_id = ?', [sid]);
  await pool.query('DELETE FROM assistant_sessions WHERE id = ?', [sid]);
}

(async () => {
  printModeBanner('smoke:assistant-api', { liveAiHint: true });

  try {
    await testModeResolutionUnit();
    await testMultiTurnMessagesUnit();
    await testSseHelperUnit();

    const student =
      (await findStudentWithKbTeachers()) ||
      (await pool.query(`SELECT id, username FROM users WHERE role='student' LIMIT 1`))[0][0];

    if (!student) throw new Error('no student in database');

    console.log(`\nUsing student: ${student.username} (id=${student.id})`);
    await testTeacherScope(student.id);
    const teacherIds = await kbTeacherIdsForStudent(student.id);
    if (teacherIds.length) await testRagStructured(teacherIds);

    if (LIVE_AI) {
      console.warn('\n*** LIVE AI：正在调用 generateAssistantReply / 可能消耗 LLM ***\n');
      await testServiceLayerLive(student);
      if (HTTP) {
        await testHttpLayerLive(student.username, 'test-student-03');
      }
    } else {
      console.log('\n[service] SAFE：跳过 generateAssistantReply（不调用 LLM）');
      if (HTTP) {
        await testSafeHttpLayer(student.username, 'test-student-03');
      } else {
        console.log('[http] 跳过（ASSISTANT_HTTP=1 可测鉴权/路由；LIVE 模式才 POST 真实消息）');
      }
    }

    console.log(`\nDone: ${passed} passed, ${failed} failed`);
  } catch (e) {
    console.error('\nFatal:', e.message);
    failed += 1;
  } finally {
    try {
      const { closeRedis } = require('../utils/redisClient');
      await closeRedis();
    } catch {
      /* ignore */
    }
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  }

  if (failed > 0) process.exitCode = 1;
})();
