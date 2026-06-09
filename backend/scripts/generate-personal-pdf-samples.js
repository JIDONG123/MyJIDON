/**
 * 生成个人成绩单 PDF 样例（学生视角 / 教师视角）
 * node scripts/generate-personal-pdf-samples.js
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  registerChineseFont,
  createLayoutContext,
  drawFootersOnAllPages,
  MARGIN,
} = require('../utils/pdfReportLayout');
const { renderPersonalTranscriptPdf } = require('../controllers/reportController');

const OUT_DIR = path.join(__dirname, '..', 'exports', 'samples');

function mockRow() {
  return {
    student_id: 101,
    student_name: '张实训',
    student_no: '2024001001',
    class_name: '软件工程 2201 班',
    course_name: '龙芯架构程序设计',
    teaching_class_name: 'TEST-JW-01 教学班',
    term_name: '2025-2026 学年第一学期',
    project_name: 'LoongArch 综合实训项目',
    task_title: '任务一：系统调用与内核模块实验',
    task_id: 12,
    deadline: new Date('2026-05-10 23:59:59'),
    submitted_at: new Date('2026-05-09 18:32:15'),
    file_name: 'syscall-lab-report.zip',
    max_similarity: 8.5,
    similarity_level: 'low',
    status: 'human_graded',
    total_score: 88,
    human_score: 90,
    enterprise_score: 86,
    final_score: 89,
    publisher_teacher_name: '李老师',
    enterprise_grader_name: '王导师',
    human_comment: '实验报告结构完整，代码可运行，建议补充性能测试数据。',
    ai_comment: '整体完成度较高，步骤说明清晰，代码规范良好。',
    ai_problems: '部分边界条件测试用例覆盖不足。',
    ai_suggestions: '建议增加异常路径测试并完善 README 部署说明。',
    enterprise_comment: '符合岗位基础要求，具备继续培养价值。',
    dimension_scores: JSON.stringify([
      { name: '功能完整性', score: 45, maxScore: 50 },
      { name: '代码规范', score: 18, maxScore: 20 },
      { name: '文档与说明', score: 16, maxScore: 20 },
      { name: '创新与扩展', score: 8, maxScore: 10 },
    ]),
    verification_result: JSON.stringify({
      requirementComparison: '已覆盖任务要求的系统调用实现、模块加载与基本测试。',
      enterpriseAlignment: '与嵌入式软件工程师岗位技能要求基本契合。',
      stepCompleteness: {
        covered: ['环境搭建', '模块编写', '系统调用验证', '测试记录'],
        missing: ['性能对比实验'],
        score: 85,
      },
      logicIssues: [
        { title: '错误处理', detail: '部分系统调用失败分支未记录日志' },
        '建议统一模块卸载时的资源释放顺序',
      ],
      summary: '提交内容与任务目标一致，主要功能已实现，文档可读性良好。',
      codeStyleReview: '命名规范，注释较充分；建议将 magic number 提取为常量。',
    }),
    verification_teacher_override: JSON.stringify({
      summary: '教师确认步骤完整性评分上调',
      stepCompleteness: { note: '已补充课堂演示记录' },
    }),
  };
}

async function writeSamplePdf(filename, isStudentView) {
  const outPath = path.join(OUT_DIR, filename);
  const row = mockRow();

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
      bufferPages: true,
    });

    const fontReg = registerChineseFont(doc);
    if (!fontReg.fontPath) {
      reject(new Error(fontReg.error || '未找到中文字体'));
      return;
    }

    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const ctx = createLayoutContext(doc, fontReg.fontPath, { exportTime: new Date() });
    renderPersonalTranscriptPdf(ctx, row, { isStudentView });
    drawFootersOnAllPages(ctx);

    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.end();
  });

  return outPath;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const studentPath = await writeSamplePdf('sample-personal-report-student.pdf', true);
  const teacherPath = await writeSamplePdf('sample-personal-report-teacher.pdf', false);

  console.log('[samples] 学生视角:', studentPath);
  console.log('[samples] 教师视角:', teacherPath);
}

main().catch((e) => {
  console.error('[samples] 失败:', e.message);
  process.exitCode = 1;
});
