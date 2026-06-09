/**
 * 从 MariaDB 业务表采集图谱构建语料（只读，不改业务表）
 */

const pool = require('../config/database');

function parseJson(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function nodeId(type, sourceId) {
  if (type === 'teaching_class') return `tc_${sourceId}`;
  if (type === 'course') return `course_${sourceId}`;
  return `${type}_${sourceId}`;
}

async function fetchClassNames(classIds) {
  const uniq = [...new Set(classIds.filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;
  const [rows] = await pool.query(
    `SELECT id, class_name FROM classes WHERE id IN (${uniq.map(() => '?').join(',')})`,
    uniq
  );
  rows.forEach((r) => map.set(Number(r.id), r.class_name));
  return map;
}

async function fetchTeachingClassMeta(tcIds) {
  const uniq = [...new Set(tcIds.filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;
  const [rows] = await pool.query(
    `SELECT tc.id, tc.class_name, tc.course_id, c.course_name
     FROM teaching_classes tc
     LEFT JOIN courses c ON c.id = tc.course_id
     WHERE tc.id IN (${uniq.map(() => '?').join(',')})`,
    uniq
  );
  rows.forEach((r) => map.set(Number(r.id), r));
  return map;
}

async function collectRuleNodesAndEdges(scopeType, scopeId) {
  const nodes = [];
  const edges = [];
  const nodeSeen = new Set();
  const edgeSeen = new Set();

  const pushNode = (n) => {
    if (!n?.id || nodeSeen.has(n.id)) return;
    nodeSeen.add(n.id);
    nodes.push(n);
  };
  const pushEdge = (e) => {
    const k = `${e.from}|${e.to}|${e.type}`;
    if (edgeSeen.has(k)) return;
    edgeSeen.add(k);
    edges.push(e);
  };

  let taskWhere = '1=1';
  const taskParams = [];
  if (scopeType === 'class' && scopeId) {
    taskWhere = 't.class_id = ?';
    taskParams.push(scopeId);
  } else if (scopeType === 'teaching_class' && scopeId) {
    taskWhere = 't.teaching_class_id = ?';
    taskParams.push(scopeId);
  } else if (scopeType === 'course' && scopeId) {
    taskWhere = 't.id = ?';
    taskParams.push(scopeId);
  }

  const [tasks] = await pool.query(
    `SELECT t.id, t.title, t.requirements, t.scoring_criteria, t.class_id, t.teaching_class_id,
            t.course_id, t.difficulty_level, t.created_by
     FROM tasks t WHERE ${taskWhere} ORDER BY t.id DESC LIMIT 200`,
    taskParams
  );

  const classIds = tasks.map((t) => t.class_id).filter(Boolean);
  const tcIds = tasks.map((t) => t.teaching_class_id).filter(Boolean);
  const courseIds = tasks.map((t) => t.course_id).filter(Boolean);
  const classNames = await fetchClassNames(classIds);
  const tcMeta = await fetchTeachingClassMeta(tcIds);

  const taskToKps = new Map();

  for (const t of tasks) {
    const tid = nodeId('task', t.id);
    pushNode({
      id: tid,
      name: t.title || `任务${t.id}`,
      type: 'task',
      source_table: 'tasks',
      source_id: String(t.id),
    });

    if (t.course_id) {
      const cid = nodeId('course', t.course_id);
      pushNode({
        id: cid,
        name: `课程${t.course_id}`,
        type: 'course',
        source_table: 'courses',
        source_id: String(t.course_id),
      });
      pushEdge({ from: cid, to: tid, type: 'HAS_TASK', source: 'rule' });
    }

    if (t.class_id) {
      const cid = nodeId('class', t.class_id);
      pushNode({
        id: cid,
        name: classNames.get(Number(t.class_id)) || `行政班${t.class_id}`,
        type: 'class',
        source_table: 'classes',
        source_id: String(t.class_id),
        meta: { classKind: 'administrative' },
      });
      pushEdge({ from: cid, to: tid, type: 'CONTAINS', source: 'rule' });
    }

    if (t.teaching_class_id) {
      const tc = tcMeta.get(Number(t.teaching_class_id));
      const tcid = nodeId('teaching_class', t.teaching_class_id);
      pushNode({
        id: tcid,
        name: tc?.class_name || `教学班${t.teaching_class_id}`,
        type: 'teaching_class',
        source_table: 'teaching_classes',
        source_id: String(t.teaching_class_id),
        meta: { classKind: 'teaching', courseId: t.course_id },
      });
      pushEdge({ from: tcid, to: tid, type: 'CONTAINS', source: 'rule' });
      if (tc?.course_id) {
        const courseNodeId = nodeId('course', tc.course_id);
        pushNode({
          id: courseNodeId,
          name: tc.course_name || `课程${tc.course_id}`,
          type: 'course',
          source_table: 'courses',
          source_id: String(tc.course_id),
        });
        pushEdge({ from: courseNodeId, to: tcid, type: 'BELONGS_TO', source: 'rule' });
      }
    }

    if (t.created_by) {
      const teacherNode = nodeId('teacher', t.created_by);
      pushNode({
        id: teacherNode,
        name: `教师${t.created_by}`,
        type: 'teacher',
        source_table: 'users',
        source_id: String(t.created_by),
      });
      pushEdge({ from: teacherNode, to: tid, type: 'ASSIGNED_TO', source: 'rule' });
    }

    const reqLines = String(t.requirements || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const kpIds = [];
    reqLines.forEach((line, idx) => {
      const kid = nodeId('kp', `task${t.id}_${idx}`);
      kpIds.push(kid);
      pushNode({
        id: kid,
        name: line.slice(0, 120),
        type: 'knowledge_point',
        source_table: 'tasks',
        source_id: `${t.id}:${idx}`,
      });
      pushEdge({ from: tid, to: kid, type: 'HAS_KNOWLEDGE', source: 'rule' });
      if (idx > 0) {
        pushEdge({
          from: nodeId('kp', `task${t.id}_${idx - 1}`),
          to: kid,
          type: 'PREREQUISITE',
          source: 'rule',
        });
      }
    });
    taskToKps.set(t.id, kpIds);
  }

  const [questions] = await pool.query(
    `SELECT id, stem, knowledge_tags, course_label, difficulty
     FROM qb_questions WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 300`
  );
  for (const q of questions) {
    const qid = nodeId('exercise', q.id);
    pushNode({
      id: qid,
      name: String(q.stem || `习题${q.id}`).slice(0, 80),
      type: 'exercise',
      source_table: 'qb_questions',
      source_id: String(q.id),
    });
    const tags = parseJson(q.knowledge_tags);
    const tagList = Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : [];
    tagList.forEach((tag, idx) => {
      const name = String(tag || '').trim();
      if (!name) return;
      const kid = nodeId('kp', `tag_${q.id}_${idx}`);
      pushNode({
        id: kid,
        name,
        type: 'knowledge_point',
        source_table: 'qb_questions',
        source_id: `${q.id}:tag:${idx}`,
      });
      pushEdge({ from: kid, to: qid, type: 'RELATES_TO', source: 'rule' });
    });
  }

  if (scopeType === 'student' && scopeId) {
    const sid = nodeId('student', scopeId);
    const [u] = await pool.query(
      'SELECT id, real_name, class_id FROM users WHERE id = ? AND role = ? LIMIT 1',
      [scopeId, 'student']
    );
    if (u.length) {
      pushNode({
        id: sid,
        name: u[0].real_name || `学生${scopeId}`,
        type: 'student',
        source_table: 'users',
        source_id: String(scopeId),
      });
      if (u[0].class_id) {
        const cname = classNames.get(Number(u[0].class_id));
        pushNode({
          id: nodeId('class', u[0].class_id),
          name: cname || `行政班${u[0].class_id}`,
          type: 'class',
          source_table: 'classes',
          source_id: String(u[0].class_id),
          meta: { classKind: 'administrative' },
        });
        pushEdge({
          from: nodeId('class', u[0].class_id),
          to: sid,
          type: 'ASSIGNED_TO',
          source: 'rule',
        });
      }
    }

    const [subs] = await pool.query(
      `SELECT s.id, s.task_id, gr.ai_problems, gr.dimension_scores, gr.total_score
       FROM submissions s
       LEFT JOIN grading_results gr ON gr.submission_id = s.id
       WHERE s.student_id = ?
       ORDER BY s.submitted_at DESC LIMIT 80`,
      [scopeId]
    );
    for (const s of subs) {
      const taskNode = nodeId('task', s.task_id);
      pushEdge({ from: sid, to: taskNode, type: 'SUBMITTED', source: 'rule' });
      const score = s.total_score != null ? Number(s.total_score) : null;
      if (score != null && Number.isFinite(score)) {
        pushEdge({ from: sid, to: taskNode, type: 'GRADED', source: 'rule', meta: { score } });
        const kps = taskToKps.get(Number(s.task_id)) || [];
        for (const kpId of kps) {
          if (score >= 75) {
            pushEdge({ from: sid, to: kpId, type: 'MASTERED', source: 'rule' });
          } else if (score < 60) {
            pushEdge({ from: sid, to: kpId, type: 'WEAK_IN', source: 'rule' });
          }
        }
      }

      const probs = String(s.ai_problems || '').trim();
      if (!probs) continue;
      const summary = probs.split(/[。\n；;]/).map((x) => x.trim()).find((x) => x.length > 4) || probs.slice(0, 60);
      const mid = nodeId('mistake', s.id);
      pushNode({
        id: mid,
        name: summary.slice(0, 80),
        type: 'mistake_point',
        source_table: 'submissions',
        source_id: String(s.id),
        meta: { summary },
      });
      pushEdge({ from: sid, to: mid, type: 'MISTAKE_ON', source: 'rule' });
      pushEdge({ from: mid, to: taskNode, type: 'RELATES_TO', source: 'rule' });
    }
  }

  if (scopeType === 'class' && scopeId) {
    const [students] = await pool.query(
      `SELECT id, real_name FROM users WHERE class_id = ? AND role = 'student' LIMIT 500`,
      [scopeId]
    );
    const adminClassId = nodeId('class', scopeId);
    pushNode({
      id: adminClassId,
      name: classNames.get(Number(scopeId)) || (await fetchClassNames([scopeId])).get(Number(scopeId)) || `行政班${scopeId}`,
      type: 'class',
      source_table: 'classes',
      source_id: String(scopeId),
      meta: { classKind: 'administrative' },
    });
    for (const st of students) {
      const sid = nodeId('student', st.id);
      pushNode({
        id: sid,
        name: st.real_name || `学生${st.id}`,
        type: 'student',
        source_table: 'users',
        source_id: String(st.id),
      });
      pushEdge({ from: adminClassId, to: sid, type: 'ASSIGNED_TO', source: 'rule' });
    }
  }

  if (scopeType === 'teaching_class' && scopeId) {
    const tcMetaMap = await fetchTeachingClassMeta([scopeId]);
    const tc = tcMetaMap.get(Number(scopeId));
    const tcNodeId = nodeId('teaching_class', scopeId);
    pushNode({
      id: tcNodeId,
      name: tc?.class_name || `教学班${scopeId}`,
      type: 'teaching_class',
      source_table: 'teaching_classes',
      source_id: String(scopeId),
      meta: { classKind: 'teaching', courseId: tc?.course_id || null },
    });
    if (tc?.course_id) {
      const courseNodeId = nodeId('course', tc.course_id);
      pushNode({
        id: courseNodeId,
        name: tc.course_name || `课程${tc.course_id}`,
        type: 'course',
        source_table: 'courses',
        source_id: String(tc.course_id),
      });
      pushEdge({ from: courseNodeId, to: tcNodeId, type: 'BELONGS_TO', source: 'rule' });
    }
    const [students] = await pool.query(
      `SELECT u.id, u.real_name
       FROM teaching_class_students tcs
       JOIN users u ON u.id = tcs.student_id
       WHERE tcs.teaching_class_id = ?
       LIMIT 500`,
      [scopeId]
    );
    for (const st of students) {
      const sid = nodeId('student', st.id);
      pushNode({
        id: sid,
        name: st.real_name || `学生${st.id}`,
        type: 'student',
        source_table: 'users',
        source_id: String(st.id),
      });
      pushEdge({ from: tcNodeId, to: sid, type: 'ASSIGNED_TO', source: 'rule' });
    }
  }

  return { nodes, edges };
}

async function buildCorpusForScope(scopeType, scopeId) {
  const parts = [];
  let title = '全课程知识体系';

  if (scopeType === 'course' && scopeId) {
    const [rows] = await pool.query('SELECT title, requirements, scoring_criteria FROM tasks WHERE id = ?', [
      scopeId,
    ]);
    if (rows.length) {
      title = rows[0].title;
      parts.push(rows[0].requirements, rows[0].scoring_criteria);
    }
  } else if (scopeType === 'class' && scopeId) {
    const [cls] = await pool.query('SELECT class_name FROM classes WHERE id = ? LIMIT 1', [scopeId]);
    const cname = cls[0]?.class_name || `班级${scopeId}`;
    const [rows] = await pool.query(
      `SELECT title, requirements, scoring_criteria FROM tasks WHERE class_id = ? ORDER BY id DESC LIMIT 30`,
      [scopeId]
    );
    title = `${cname} 知识图谱`;
    rows.forEach((r) => parts.push(r.title, r.requirements, r.scoring_criteria));
  } else if (scopeType === 'teaching_class' && scopeId) {
    const [rows] = await pool.query(
      `SELECT tc.class_name, c.course_name
       FROM teaching_classes tc
       LEFT JOIN courses c ON c.id = tc.course_id
       WHERE tc.id = ? LIMIT 1`,
      [scopeId]
    );
    const tcName = rows[0]?.class_name || `教学班${scopeId}`;
    title = `${tcName} 知识图谱`;
    const [tasks] = await pool.query(
      `SELECT title, requirements, scoring_criteria FROM tasks WHERE teaching_class_id = ? ORDER BY id DESC LIMIT 30`,
      [scopeId]
    );
    tasks.forEach((r) => parts.push(r.title, r.requirements, r.scoring_criteria));
  } else if (scopeType === 'student' && scopeId) {
    title = `学生${scopeId} 学情`;
    const [rows] = await pool.query(
      `SELECT gr.ai_comment, gr.ai_problems, gr.verification_result, t.title
       FROM submissions s
       JOIN tasks t ON t.id = s.task_id
       LEFT JOIN grading_results gr ON gr.submission_id = s.id
       WHERE s.student_id = ?
       ORDER BY s.submitted_at DESC LIMIT 40`,
      [scopeId]
    );
    rows.forEach((r) => {
      parts.push(r.title, r.ai_comment, r.ai_problems, JSON.stringify(parseJson(r.verification_result) || {}));
    });
  } else {
    const [rows] = await pool.query(`SELECT title, requirements FROM tasks ORDER BY id DESC LIMIT 50`);
    rows.forEach((r) => parts.push(r.title, r.requirements));
  }

  return { title, corpus: parts.filter(Boolean).join('\n\n') };
}

module.exports = {
  collectRuleNodesAndEdges,
  buildCorpusForScope,
  nodeId,
};
