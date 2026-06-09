#!/usr/bin/env node
/** Staging 收口：recover stale jobs + docx/RAG/Neo4j 补测 */
require('../config/loadEnv').loadEnv();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const AdmZip = require('adm-zip');
const pool = require('../config/database');
const { recoverAllStaleRunningItems } = require('../utils/gradingJobProcessor');
const { retrieveTeacherKbContext } = require('../utils/ragRetrieve');

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;
const UPLOAD_ROOT = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(__dirname, '..', 'uploads');

async function tokenFor(username) {
  const [rows] = await pool.query('SELECT id, username, role FROM users WHERE username=? LIMIT 1', [username]);
  if (!rows[0]) throw new Error(`user not found: ${username}`);
  return jwt.sign(
    { id: rows[0].id, username: rows[0].username, role: rows[0].role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function makeMinimalDocx(absPath, text) {
  const zip = new AdmZip();
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      'utf8'
    )
  );
  zip.addFile(
    'word/document.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      'utf8'
    )
  );
  zip.writeZip(absPath);
}

async function submitFile(token, taskId, filePath, content) {
  const buf = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  const form = new FormData();
  form.append('taskId', String(taskId));
  form.append('content', content || `Staging docx test ${name}`);
  form.append('file', new Blob([buf]), name);
  const res = await fetch(`${BASE}/api/submissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function pollGrading(submissionId, maxSec = 90) {
  const start = Date.now();
  while (Date.now() - start < maxSec * 1000) {
    const [rows] = await pool.query(
      'SELECT status, total_score FROM grading_results WHERE submission_id=?',
      [submissionId]
    );
    const st = rows[0]?.status;
    if (st && !['pending', 'grading', 'ai_grading'].includes(st)) return rows[0];
    await new Promise((r) => setTimeout(r, 3000));
  }
  const [rows] = await pool.query('SELECT status, total_score FROM grading_results WHERE submission_id=?', [
    submissionId,
  ]);
  return rows[0];
}

(async () => {
  const { printModeBanner, requireMutation } = require('./lib/scriptSafety');
  printModeBanner('staging-supplement-check', { liveAiHint: true });
  if (!requireMutation('staging-supplement-check')) {
    process.exit(0);
  }

  console.log('=== 1. Recover stale running jobs ===');
  const recovered = await recoverAllStaleRunningItems();
  console.log('recovered items:', recovered);

  const [j43] = await pool.query('SELECT * FROM grading_jobs WHERE id=43');
  const [i43] = await pool.query('SELECT * FROM grading_job_items WHERE job_id=43');
  const [gr11] = await pool.query('SELECT submission_id,status,total_score,ai_comment FROM grading_results WHERE submission_id=11');
  console.log('job43 status:', j43[0]?.status, j43[0]?.message);
  console.log('item43 status:', i43[0]?.status, i43[0]?.error_message?.slice?.(0, 80));
  console.log('sub11 grading:', gr11[0]);

  if (j43[0]?.status === 'failed' || j43[0]?.status === 'partial_failed') {
    const tTeacher = await tokenFor('test-teacher-01');
    const retry = await fetch(`${BASE}/api/grading/jobs/43/retry`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tTeacher}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).then((r) => r.json());
    console.log('retry job43:', retry.success, retry.message || retry.data);
    await new Promise((r) => setTimeout(r, 5000));
    const polled = await pollGrading(11, 120);
    console.log('sub11 after retry:', polled);
  }

  console.log('\n=== 2. Word .docx upload ===');
  const docxPath = path.join(UPLOAD_ROOT, 'test-seed', 'staging-test.docx');
  fs.mkdirSync(path.dirname(docxPath), { recursive: true });
  makeMinimalDocx(docxPath, 'Staging Word 实训说明：Vue3 组件封装与路由配置已完成。');
  const tStudent = await tokenFor('test-student-07');
  const up = await submitFile(tStudent, 7, docxPath, 'Staging E2E docx 提交');
  const sid = up.json?.data?.id;
  console.log('docx upload:', up.json?.success, 'sid=', sid, up.json?.message);
  if (sid) {
    const [sub] = await pool.query('SELECT LEFT(content,120) c FROM submissions WHERE id=?', [sid]);
    console.log('parse head:', (sub[0]?.c || '').replace(/\n/g, ' '));
  }

  console.log('\n=== 3. RAG KB upload ===');
  const tTeacher = await tokenFor('test-teacher-02');
  const kbText = 'Vue3 后台管理系统实训评分标准：需实现登录、路由守卫、表格 CRUD、表单校验与权限菜单。';
  const kbPath = path.join(UPLOAD_ROOT, 'kb', `staging-rag-${Date.now()}.txt`);
  fs.mkdirSync(path.dirname(kbPath), { recursive: true });
  fs.writeFileSync(kbPath, kbText, 'utf8');
  const kbForm = new FormData();
  kbForm.append('title', 'Staging Vue3 评分标准');
  kbForm.append('category', 'standard');
  kbForm.append('file', new Blob([fs.readFileSync(kbPath)]), 'staging-vue3-standard.txt');
  const kbUp = await fetch(`${BASE}/api/kb/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tTeacher}` },
    body: kbForm,
  }).then((r) => r.json());
  console.log('kb upload:', kbUp.success, kbUp.message);
  await new Promise((r) => setTimeout(r, 8000));
  const [kbDocs] = await pool.query(
    'SELECT id,status,chunk_count FROM kb_documents WHERE teacher_id=(SELECT id FROM users WHERE username=?) ORDER BY id DESC LIMIT 3',
    ['test-teacher-02']
  );
  console.log('kb docs:', JSON.stringify(kbDocs));

  const [teacherRow] = await pool.query('SELECT id FROM users WHERE username=?', ['test-teacher-02']);
  const ragEmpty = await retrieveTeacherKbContext(teacherRow[0].id, '无关查询 xyz');
  const ragHit = await retrieveTeacherKbContext(
    teacherRow[0].id,
    'Vue3 后台管理系统 路由守卫 表格 CRUD 评分标准'
  );
  console.log('RAG empty len:', ragEmpty.length, '(expect 0 or small if no docs)');
  console.log('RAG hit len:', ragHit.length, 'has snippet:', ragHit.includes('路由守卫'));

  console.log('\n=== 4. Neo4j sync-status ===');
  const kg = await fetch(`${BASE}/api/kg/sync-status`, {
    headers: { Authorization: `Bearer ${tTeacher}` },
  }).then((r) => r.json());
  console.log('kg sync-status:', kg.success, JSON.stringify(kg.data || kg.message).slice(0, 200));

  console.log('\n=== 5. Active stuck jobs ===');
  const [stuck] = await pool.query(
    `SELECT j.id,j.status,j.message FROM grading_jobs j WHERE j.status IN ('pending','running') ORDER BY j.id`
  );
  console.log('active jobs:', JSON.stringify(stuck));

  await pool.end();
})().catch(async (e) => {
  console.error('ERROR', e);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
