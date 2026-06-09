#!/usr/bin/env node
/**
 * 幂等测试数据种子（仅「测试-」「test-」前缀）
 * 默认 SAFE：npm run seed:test
 * 写入：npm run seed:test:apply 或 SCRIPT_ALLOW_MUTATION=1 npm run seed:test
 * 前置：数据库可连且 migration 已应用
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const AdmZip = require('adm-zip');
const mysql = require('mysql2/promise');

require('../config/loadEnv').loadEnv();

const C = require('./seed-test-data.constants');

const uploadRoot = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(__dirname, '..', 'uploads');
const seedFileDir = path.join(uploadRoot, 'test-seed');

const TABLE_COLUMNS_REQUIRED = {
  majors: ['code', 'name', 'college', 'status'],
  terms: ['name', 'year', 'season', 'is_current'],
  courses: ['course_code', 'course_name', 'major_id', 'leader_id', 'course_goal', 'ability_goals', 'status'],
  teaching_classes: ['course_id', 'term_id', 'class_code', 'class_name', 'location', 'status'],
  teaching_class_teachers: ['teaching_class_id', 'teacher_id', 'role'],
  teaching_class_students: ['teaching_class_id', 'student_id', 'source_class_id'],
  training_project_templates: [
    'course_id',
    'created_by',
    'project_name',
    'description',
    'requirements',
    'evaluation_metrics',
    'enterprise_standard',
    'suggested_materials',
    'status',
  ],
  tasks: [
    'title',
    'description',
    'requirements',
    'scoring_criteria',
    'scenario_type',
    'enterprise_standard',
    'evaluation_metrics',
    'deadline',
    'class_id',
    'course_id',
    'teaching_class_id',
    'project_template_id',
    'max_score',
    'created_by',
  ],
  submissions: ['task_id', 'student_id', 'file_path', 'file_name', 'file_type', 'content'],
  grading_results: [
    'submission_id',
    'total_score',
    'dimension_scores',
    'ai_comment',
    'ai_problems',
    'ai_suggestions',
    'verification_result',
    'final_score',
    'human_score',
    'human_comment',
    'enterprise_score',
    'enterprise_comment',
    'enterprise_graded_by',
    'enterprise_graded_at',
    'graded_by',
    'status',
  ],
  users: ['username', 'password', 'real_name', 'role', 'email', 'student_no', 'class_id'],
  enterprise_teaching_class_access: ['enterprise_user_id', 'teaching_class_id'],
  enterprise_class_access: ['enterprise_user_id', 'class_id'],
};

async function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_grading_system',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
  });
}

async function loadTableColumns(conn, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS col FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return new Set(rows.map((r) => r.col));
}

async function validateSchema(conn) {
  const missing = [];
  for (const [table, required] of Object.entries(TABLE_COLUMNS_REQUIRED)) {
    const cols = await loadTableColumns(conn, table);
    if (!cols.size) {
      missing.push(`表 ${table} 不存在（请先执行 migration_curriculum_teaching_v1）`);
      continue;
    }
    for (const col of required) {
      if (!cols.has(col)) missing.push(`${table}.${col}`);
    }
  }
  if (missing.length) {
    console.error('[seed] 数据库字段校验失败：');
    missing.forEach((m) => console.error('  -', m));
    throw new Error('schema incompatible');
  }
  console.log('[seed] schema 校验通过');
}

function ensureSeedFiles() {
  fs.mkdirSync(seedFileDir, { recursive: true });
  const created = [];
  for (const f of C.SEED_FILES) {
    const abs = path.join(seedFileDir, f.name);
    if (!fs.existsSync(abs)) {
      fs.writeFileSync(abs, f.content, 'utf8');
      created.push(f.name);
    }
  }
  const zipPath = path.join(seedFileDir, 'sample-project.zip');
  if (!fs.existsSync(zipPath)) {
    const zip = new AdmZip();
    zip.addFile('src/main.java', Buffer.from('public class Main { public static void main(String[] a) {} }', 'utf8'));
    zip.addFile('README.txt', Buffer.from('测试-种子 ZIP 源码包', 'utf8'));
    zip.writeZip(zipPath);
    created.push('sample-project.zip');
  }
  console.log('[seed] 测试文件目录:', seedFileDir, created.length ? `新建 ${created.join(', ')}` : '文件已存在');
  return seedFileDir;
}

function fileAbs(name) {
  return path.join(seedFileDir, name);
}

async function getUserId(conn, username) {
  const [rows] = await conn.query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  return rows[0]?.id || null;
}

async function upsertUser(conn, { username, real_name, role, email, student_no, class_id }) {
  if (!username.startsWith(C.USER_PREFIX)) {
    throw new Error(`拒绝写入非测试账号: ${username}`);
  }
  const existing = await getUserId(conn, username);
  if (existing) {
    await conn.query(
      `UPDATE users SET real_name = ?, email = COALESCE(?, email), student_no = COALESCE(?, student_no),
       class_id = COALESCE(?, class_id) WHERE id = ? AND username = ?`,
      [real_name, email || null, student_no || null, class_id || null, existing, username]
    );
    return existing;
  }
  const [r] = await conn.query(
    `INSERT INTO users (username, password, real_name, role, email, student_no, class_id, department)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      username,
      C.BCRYPT_PASSWORD_123456,
      real_name,
      role,
      email || `${username}@example.com`,
      student_no || null,
      class_id || null,
      `${C.PREFIX}计算机学院`,
    ]
  );
  return r.insertId;
}

async function upsertMajor(conn, { code, name, college }) {
  const [ex] = await conn.query('SELECT id FROM majors WHERE code = ?', [code]);
  if (ex.length) return ex[0].id;
  const [r] = await conn.query(
    'INSERT INTO majors (code, name, college, status) VALUES (?, ?, ?, 1)',
    [code, name, college]
  );
  return r.insertId;
}

async function upsertTerm(conn) {
  const [ex] = await conn.query('SELECT id FROM terms WHERE name = ?', [C.TERM.name]);
  if (ex.length) {
    await conn.query('UPDATE terms SET year = ?, season = ?, is_current = ? WHERE id = ?', [
      C.TERM.year,
      C.TERM.season,
      C.TERM.is_current,
      ex[0].id,
    ]);
    return ex[0].id;
  }
  const [r] = await conn.query(
    'INSERT INTO terms (name, year, season, is_current) VALUES (?, ?, ?, ?)',
    [C.TERM.name, C.TERM.year, C.TERM.season, C.TERM.is_current]
  );
  return r.insertId;
}

async function upsertCourse(conn, def, majorId, leaderId) {
  const [ex] = await conn.query('SELECT id FROM courses WHERE course_code = ?', [def.course_code]);
  if (ex.length) {
    await conn.query(
      `UPDATE courses SET course_name = ?, major_id = ?, leader_id = ?, course_goal = ?, ability_goals = ?, status = 1
       WHERE id = ?`,
      [def.course_name, majorId, leaderId, def.course_goal, def.ability_goals, ex[0].id]
    );
    return ex[0].id;
  }
  const [r] = await conn.query(
    `INSERT INTO courses (course_code, course_name, major_id, course_type, course_goal, ability_goals, leader_id, status)
     VALUES (?, ?, ?, '实训', ?, ?, ?, 1)`,
    [def.course_code, def.course_name, majorId, def.course_goal, def.ability_goals, leaderId]
  );
  return r.insertId;
}

async function upsertTeachingClass(conn, def, courseId, termId) {
  const [ex] = await conn.query('SELECT id FROM teaching_classes WHERE class_code = ? AND term_id = ?', [
    def.class_code,
    termId,
  ]);
  if (ex.length) {
    await conn.query(
      'UPDATE teaching_classes SET class_name = ?, location = ?, course_id = ?, status = 1 WHERE id = ?',
      [def.class_name, def.location, courseId, ex[0].id]
    );
    return ex[0].id;
  }
  const [r] = await conn.query(
    'INSERT INTO teaching_classes (course_id, term_id, class_code, class_name, location, status) VALUES (?, ?, ?, ?, ?, 1)',
    [courseId, termId, def.class_code, def.class_name, def.location]
  );
  return r.insertId;
}

async function linkTcTeacher(conn, tcId, teacherId, role = 'lead') {
  await conn.query(
    `INSERT IGNORE INTO teaching_class_teachers (teaching_class_id, teacher_id, role) VALUES (?, ?, ?)`,
    [tcId, teacherId, role]
  );
}

async function linkTcStudent(conn, tcId, studentId, sourceClassId) {
  await conn.query(
    `INSERT IGNORE INTO teaching_class_students (teaching_class_id, student_id, source_class_id) VALUES (?, ?, ?)`,
    [tcId, studentId, sourceClassId]
  );
}

async function linkEnterpriseTc(conn, entId, tcId) {
  await conn.query(
    `INSERT IGNORE INTO enterprise_teaching_class_access (enterprise_user_id, teaching_class_id) VALUES (?, ?)`,
    [entId, tcId]
  );
}

async function linkEnterpriseClass(conn, entId, classId) {
  await conn.query(
    `INSERT IGNORE INTO enterprise_class_access (enterprise_user_id, class_id) VALUES (?, ?)`,
    [entId, classId]
  );
}

async function upsertTemplate(conn, def, courseId, creatorId) {
  const [ex] = await conn.query(
    'SELECT id FROM training_project_templates WHERE course_id = ? AND project_name = ?',
    [courseId, def.project_name]
  );
  const metricsJson = JSON.stringify(C.EVALUATION_METRICS);
  if (ex.length) {
    await conn.query(
      `UPDATE training_project_templates SET description = ?, requirements = ?, evaluation_metrics = ?,
       enterprise_standard = ?, suggested_materials = ?, status = 1 WHERE id = ?`,
      [def.description, def.requirements, metricsJson, def.enterprise_standard, def.suggested_materials, ex[0].id]
    );
    return ex[0].id;
  }
  const [r] = await conn.query(
    `INSERT INTO training_project_templates
     (course_id, created_by, project_name, description, requirements, evaluation_metrics, enterprise_standard, suggested_materials, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      courseId,
      creatorId,
      def.project_name,
      def.description,
      def.requirements,
      metricsJson,
      def.enterprise_standard,
      def.suggested_materials,
    ]
  );
  return r.insertId;
}

async function upsertTask(conn, spec) {
  const [ex] = await conn.query('SELECT id FROM tasks WHERE title = ? LIMIT 1', [spec.title]);
  const metricsJson = spec.evaluation_metrics
    ? JSON.stringify(spec.evaluation_metrics)
    : JSON.stringify(C.EVALUATION_METRICS);
  const deadline = spec.deadline;

  if (ex.length) {
    await conn.query(
      `UPDATE tasks SET description = ?, requirements = ?, scoring_criteria = ?, scenario_type = ?,
       enterprise_standard = ?, evaluation_metrics = ?, deadline = ?, class_id = ?, course_id = ?,
       teaching_class_id = ?, project_template_id = ?, max_score = ?, created_by = ? WHERE id = ?`,
      [
        spec.description,
        spec.requirements,
        spec.scoring_criteria || spec.suggested_materials || '',
        spec.scenario_type || 'mixed',
        spec.enterprise_standard || null,
        metricsJson,
        deadline,
        spec.class_id || null,
        spec.course_id || null,
        spec.teaching_class_id || null,
        spec.project_template_id || null,
        spec.max_score || 100,
        spec.created_by,
        ex[0].id,
      ]
    );
    return ex[0].id;
  }

  const [r] = await conn.query(
    `INSERT INTO tasks (
      title, description, requirements, scoring_criteria, scenario_type, enterprise_standard,
      evaluation_metrics, deadline, class_id, course_id, teaching_class_id, project_template_id,
      is_public, max_score, max_submissions, campus_grade_weight, enterprise_grade_weight, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, 50, 50, ?)`,
    [
      spec.title,
      spec.description,
      spec.requirements,
      spec.scoring_criteria || spec.suggested_materials || '',
      spec.scenario_type || 'mixed',
      spec.enterprise_standard || null,
      metricsJson,
      deadline,
      spec.class_id || null,
      spec.course_id || null,
      spec.teaching_class_id || null,
      spec.project_template_id || null,
      spec.max_score || 100,
      spec.created_by,
    ]
  );
  return r.insertId;
}

async function upsertSubmission(conn, spec) {
  const [ex] = await conn.query(
    'SELECT id FROM submissions WHERE task_id = ? AND student_id = ? LIMIT 1',
    [spec.task_id, spec.student_id]
  );
  if (ex.length) {
    await conn.query(
      `UPDATE submissions SET file_path = ?, file_name = ?, file_type = ?, content = ?,
       archive_extracted_text = ?, archive_extracted_file_count = ? WHERE id = ?`,
      [
        spec.file_path,
        spec.file_name,
        spec.file_type,
        spec.content,
        spec.archive_extracted_text || null,
        spec.archive_extracted_file_count ?? null,
        ex[0].id,
      ]
    );
    return ex[0].id;
  }
  const [r] = await conn.query(
    `INSERT INTO submissions (task_id, student_id, file_path, file_name, file_type, content,
      archive_extracted_text, archive_extracted_file_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      spec.task_id,
      spec.student_id,
      spec.file_path,
      spec.file_name,
      spec.file_type,
      spec.content,
      spec.archive_extracted_text || null,
      spec.archive_extracted_file_count ?? null,
    ]
  );
  return r.insertId;
}

function buildDimensionScores(total = 85) {
  return C.EVALUATION_METRICS.map((d, i) => ({
    name: d.name,
    maxScore: d.maxScore,
    score: Math.min(100, Math.max(50, total - i * 3)),
    weight: d.weight,
  }));
}

async function upsertGrading(conn, spec) {
  const [ex] = await conn.query('SELECT id FROM grading_results WHERE submission_id = ?', [spec.submission_id]);
  const dimJson =
    spec.dimension_scores != null
      ? JSON.stringify(spec.dimension_scores)
      : spec.status === 'pending' || spec.total_score == null
        ? null
        : JSON.stringify(buildDimensionScores(spec.total_score));
  const verJson =
    spec.verification_result != null
      ? JSON.stringify(spec.verification_result)
      : spec.status === 'pending'
        ? null
        : JSON.stringify(C.VERIFICATION_SAMPLE);

  const fields = {
    total_score: spec.total_score,
    dimension_scores: dimJson,
    ai_comment: spec.ai_comment || `${C.PREFIX}AI 评语：完成度较好。`,
    ai_problems: spec.ai_problems || `${C.PREFIX}问题：部分异常处理不足。`,
    ai_suggestions: spec.ai_suggestions || `${C.PREFIX}建议：补充单元测试与文档。`,
    verification_result: verJson,
    final_score: spec.final_score ?? spec.total_score,
    human_score: spec.human_score ?? null,
    human_comment: spec.human_comment ?? null,
    enterprise_score: spec.enterprise_score ?? null,
    enterprise_comment: spec.enterprise_comment ?? null,
    enterprise_graded_by: spec.enterprise_graded_by ?? null,
    enterprise_graded_at: spec.enterprise_graded_at ?? null,
    graded_by: spec.graded_by ?? null,
    status: spec.status || 'ai_graded',
  };

  if (ex.length) {
    await conn.query(
      `UPDATE grading_results SET total_score = ?, dimension_scores = ?, ai_comment = ?, ai_problems = ?,
       ai_suggestions = ?, verification_result = ?, final_score = ?, human_score = ?, human_comment = ?,
       enterprise_score = ?, enterprise_comment = ?, enterprise_graded_by = ?, enterprise_graded_at = ?,
       graded_by = ?, status = ? WHERE submission_id = ?`,
      [
        fields.total_score,
        fields.dimension_scores,
        fields.ai_comment,
        fields.ai_problems,
        fields.ai_suggestions,
        fields.verification_result,
        fields.final_score,
        fields.human_score,
        fields.human_comment,
        fields.enterprise_score,
        fields.enterprise_comment,
        fields.enterprise_graded_by,
        fields.enterprise_graded_at,
        fields.graded_by,
        fields.status,
        spec.submission_id,
      ]
    );
    return ex[0].id;
  }

  const [r] = await conn.query(
    `INSERT INTO grading_results (
      submission_id, total_score, dimension_scores, ai_comment, ai_problems, ai_suggestions,
      verification_result, final_score, human_score, human_comment, enterprise_score, enterprise_comment,
      enterprise_graded_by, enterprise_graded_at, graded_by, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      spec.submission_id,
      fields.total_score,
      fields.dimension_scores,
      fields.ai_comment,
      fields.ai_problems,
      fields.ai_suggestions,
      fields.verification_result,
      fields.final_score,
      fields.human_score,
      fields.human_comment,
      fields.enterprise_score,
      fields.enterprise_comment,
      fields.enterprise_graded_by,
      fields.enterprise_graded_at,
      fields.graded_by,
      fields.status,
    ]
  );
  return r.insertId;
}

async function main() {
  const { printModeBanner, requireMutation } = require('./lib/scriptSafety');
  printModeBanner('seed:test');
  if (!requireMutation('seed-test-data')) {
    console.log('用法：SCRIPT_ALLOW_MUTATION=1 npm run seed:test');
    process.exit(0);
  }

  console.log('[seed] 龙芯智训测试数据种子开始…');
  ensureSeedFiles();

  const pool = await createPool();
  const conn = await pool.getConnection();

  try {
    await validateSchema(conn);
    await conn.beginTransaction();

    const majorIds = {};
    for (const m of C.MAJORS) {
      majorIds[m.code] = await upsertMajor(conn, m);
    }

    const termId = await upsertTerm(conn);

    for (const t of C.NEW_USERS.teachers) {
      await upsertUser(conn, { ...t, role: 'teacher' });
    }
    for (const s of C.NEW_USERS.students) {
      await upsertUser(conn, { ...s, role: 'student' });
    }
    for (const e of C.NEW_USERS.enterprises) {
      await upsertUser(conn, { ...e, role: 'enterprise' });
    }

    const courseIds = {};
    for (const c of C.COURSES) {
      const leaderId = await getUserId(conn, c.leaderUsername);
      if (!leaderId) throw new Error(`课程负责人不存在: ${c.leaderUsername}`);
      courseIds[c.course_code] = await upsertCourse(conn, c, majorIds[c.majorCode], leaderId);
    }

    const tcIds = {};
    const tcMeta = {};
    for (const tc of C.TEACHING_CLASSES) {
      const courseId = courseIds[tc.course_code];
      const tcId = await upsertTeachingClass(conn, tc, courseId, termId);
      tcIds[tc.class_code] = tcId;
      const leadId = await getUserId(conn, tc.leadUsername);
      const entId = await getUserId(conn, tc.enterpriseUsername);
      await linkTcTeacher(conn, tcId, leadId, 'lead');
      await linkEnterpriseTc(conn, entId, tcId);
      tcMeta[tc.class_code] = { tcId, courseId, leadId, entId };

      const usernames = C.TC_STUDENT_USERNAMES[tc.class_code] || [];
      for (const un of usernames) {
        const sid = await getUserId(conn, un);
        if (!sid) continue;
        const [urow] = await conn.query('SELECT class_id FROM users WHERE id = ?', [sid]);
        await linkTcStudent(conn, tcId, sid, urow[0]?.class_id || null);
      }
    }

    const templateIds = {};
    const taskIds = {};

    for (const tpl of C.TEMPLATES) {
      const courseId = courseIds[tpl.course_code];
      const creatorId = await getUserId(conn, tpl.creatorUsername);
      templateIds[tpl.project_name] = await upsertTemplate(conn, tpl, courseId, creatorId);
    }

    const deadlineRows = await conn.query(
      `SELECT DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 90 DAY), '%Y-%m-%d %H:%i:%s') AS dl`
    );
    const deadline = deadlineRows[0][0].dl;

    for (const tpl of C.TEMPLATES) {
      const tcDef = C.TEACHING_CLASSES.find((t) => t.course_code === tpl.course_code);
      const meta = tcMeta[tcDef.class_code];
      const title = `${C.PREFIX}任务-${tpl.project_name}`;
      taskIds[title] = await upsertTask(conn, {
        title,
        description: tpl.description,
        requirements: tpl.requirements,
        scoring_criteria: tpl.suggested_materials,
        scenario_type: 'enterprise_collab',
        enterprise_standard: tpl.enterprise_standard,
        suggested_materials: tpl.suggested_materials,
        deadline,
        course_id: meta.courseId,
        teaching_class_id: meta.tcId,
        project_template_id: templateIds[tpl.project_name],
        created_by: meta.leadId,
      });
    }

    const [legacyCls] = await conn.query('SELECT id FROM classes WHERE class_name = ? LIMIT 1', [
      C.LEGACY_CLASS_NAME,
    ]);
    if (!legacyCls.length) {
      throw new Error(`未找到行政班「${C.LEGACY_CLASS_NAME}」，请先执行 init.sql 或手动创建`);
    }
    const legacyClassId = legacyCls[0].id;
    const teacher1Id = await getUserId(conn, 'teacher1');
    const ent1Id = await getUserId(conn, 'test-enterprise-01');
    await linkEnterpriseClass(conn, ent1Id, legacyClassId);

    taskIds[C.LEGACY_TASK_TITLE] = await upsertTask(conn, {
      title: C.LEGACY_TASK_TITLE,
      description: `${C.PREFIX}用于验证 class_id 旧链路的综合实训任务。`,
      requirements: '提交说明文档与可选 zip 源码包。',
      scoring_criteria: '按评价维度评分',
      scenario_type: 'enterprise_collab',
      enterprise_standard: '符合软件技术专业实训岗位要求。',
      deadline,
      class_id: legacyClassId,
      course_id: null,
      teaching_class_id: null,
      project_template_id: null,
      created_by: teacher1Id,
    });

    const legacyTaskId = taskIds[C.LEGACY_TASK_TITLE];
    const javaTaskTitle = `${C.PREFIX}任务-${C.TEMPLATES[0].project_name}`;
    const vueTaskTitle = `${C.PREFIX}任务-${C.TEMPLATES[1].project_name}`;
    const llmTaskTitle = `${C.PREFIX}任务-${C.TEMPLATES[2].project_name}`;

    const student1 = await getUserId(conn, 'student1');
    const student2 = await getUserId(conn, 'student2');
    const ts01 = await getUserId(conn, 'test-student-01');
    const ts03 = await getUserId(conn, 'test-student-03');

    const subLegacy1 = await upsertSubmission(conn, {
      task_id: legacyTaskId,
      student_id: student1,
      file_path: fileAbs('legacy-report.txt'),
      file_name: 'legacy-report.txt',
      file_type: 'text/plain',
      content: `${C.PREFIX}旧链路文本提交说明`,
    });
    await upsertGrading(conn, {
      submission_id: subLegacy1,
      total_score: 88,
      human_score: 90,
      human_comment: `${C.PREFIX}教师复核：旧链路任务完成良好。`,
      final_score: 89,
      enterprise_score: 86,
      enterprise_comment: `${C.PREFIX}企业导师：符合岗位基础要求。`,
      enterprise_graded_by: ent1Id,
      enterprise_graded_at: new Date(),
      graded_by: teacher1Id,
      status: 'human_graded',
    });

    const subLegacy2 = await upsertSubmission(conn, {
      task_id: legacyTaskId,
      student_id: student2,
      file_path: fileAbs('sample-project.zip'),
      file_name: 'sample-project.zip',
      file_type: 'application/zip',
      content: `${C.PREFIX}ZIP 提交`,
      archive_extracted_text: 'README.txt\n测试-种子 ZIP 源码包\nsrc/main.java',
      archive_extracted_file_count: 2,
    });
    await upsertGrading(conn, {
      submission_id: subLegacy2,
      total_score: 76,
      status: 'ai_graded',
    });

    const subJava = await upsertSubmission(conn, {
      task_id: taskIds[javaTaskTitle],
      student_id: ts01,
      file_path: fileAbs('java-readme.txt'),
      file_name: 'java-readme.txt',
      file_type: 'text/plain',
      content: `${C.PREFIX}教学班 Java 任务提交`,
    });
    await upsertGrading(conn, {
      submission_id: subJava,
      total_score: 92,
      human_score: 94,
      human_comment: `${C.PREFIX}教师已复核教学班任务。`,
      final_score: 93,
      enterprise_score: 91,
      enterprise_comment: `${C.PREFIX}企业评分：推荐优秀。`,
      enterprise_graded_by: ent1Id,
      enterprise_graded_at: new Date(),
      graded_by: tcMeta['TEST-JW-01'].leadId,
      status: 'human_graded',
    });

    const subVue = await upsertSubmission(conn, {
      task_id: taskIds[vueTaskTitle],
      student_id: ts03,
      file_path: fileAbs('vue-guide.md'),
      file_name: 'vue-guide.md',
      file_type: 'text/markdown',
      content: `${C.PREFIX}Vue 教学班提交`,
    });
    await upsertGrading(conn, {
      submission_id: subVue,
      total_score: 81,
      status: 'ai_graded',
    });

    const subLlm = await upsertSubmission(conn, {
      task_id: taskIds[llmTaskTitle],
      student_id: await getUserId(conn, 'test-student-05'),
      file_path: fileAbs('llm-brief.txt'),
      file_name: 'llm-brief.txt',
      file_type: 'text/plain',
      content: `${C.PREFIX}待批改提交`,
    });
    await upsertGrading(conn, {
      submission_id: subLlm,
      status: 'pending',
      total_score: null,
      final_score: null,
    });

    await conn.commit();

    console.log('\n[seed] 完成。测试账号（密码 123456，admin 不变）：');
    console.log('  企业导师: test-enterprise-01, test-enterprise-02');
    console.log('  教师: test-teacher-01, test-teacher-02');
    console.log('  学生: test-student-01 … test-student-08');
    console.log('\n[seed] 关键数据：');
    console.log('  学期:', C.TERM.name);
    console.log('  教学班:', Object.keys(tcIds).join(', '));
    console.log('  旧链路任务:', C.LEGACY_TASK_TITLE);
    console.log('  新链路任务:', javaTaskTitle, vueTaskTitle, llmTaskTitle);
    console.log('  测试文件:', seedFileDir);
  } catch (e) {
    await conn.rollback();
    console.error('[seed] 失败:', e.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
