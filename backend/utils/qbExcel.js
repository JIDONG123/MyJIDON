const XLSX = require('xlsx');

/**
 * 与 parseImportWorkbook 列索引一致：A–F 六列选项后才是正确答案、分值等
 * 0类型 1题干 2-7选项A-F 8正确答案 9分值 10难度 11课程 12知识点
 */
const HEADERS = [
  '类型',
  '题干',
  '选项A',
  '选项B',
  '选项C',
  '选项D',
  '选项E',
  '选项F',
  '正确答案',
  '分值',
  '难度',
  '课程',
  '知识点',
];

const COL = {
  TYPE: 0,
  STEM: 1,
  OPT_FIRST: 2,
  OPT_LAST: 7,
  CORRECT: 8,
  SCORE: 9,
  DIFF: 10,
  COURSE: 11,
  KNOW: 12,
};

const TYPE_MAP = {
  单选: 'single',
  单选题: 'single',
  多选: 'multi',
  多选题: 'multi',
  判断: 'judge',
  判断题: 'judge',
  填空: 'fill',
  填空题: 'fill',
  简答: 'short',
  简答题: 'short',
  编程: 'code',
  编程题: 'code',
};

/** 模板外遗留列：英文枚举（与系统存储一致）也可识别 */
const TYPE_MAP_EN = {
  single: 'single',
  multi: 'multi',
  judge: 'judge',
  fill: 'fill',
  short: 'short',
  code: 'code',
};

const DIFF_MAP = {
  易: 'easy',
  简单: 'easy',
  中: 'medium',
  中等: 'medium',
  难: 'hard',
  困难: 'hard',
};

const DIFF_MAP_EN = {
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
};

function resolveType(typeZh) {
  const s = String(typeZh == null ? '' : typeZh).trim();
  if (!s) return null;
  if (TYPE_MAP[s]) return TYPE_MAP[s];
  const low = s.toLowerCase();
  return TYPE_MAP_EN[low] || null;
}

function resolveDifficulty(diffZh) {
  const s = String(diffZh == null ? '' : diffZh).trim();
  if (!s) return 'medium';
  if (DIFF_MAP[s]) return DIFF_MAP[s];
  const low = s.toLowerCase();
  if (DIFF_MAP_EN[low]) return DIFF_MAP_EN[low];
  return 'medium';
}

function buildImportTemplateBuffer() {
  const ws = XLSX.utils.aoa_to_sheet([
    HEADERS,
    [
      '单选',
      'HTTP 默认端口是？',
      '22',
      '80',
      '443',
      '3306',
      '',
      '',
      'B',
      '5',
      '中',
      '计算机网络',
      'HTTP',
    ],
    [
      '多选',
      '面向对象特性包括？',
      '继承',
      '多态',
      '指针运算',
      '封装',
      '',
      '',
      'A,B,D',
      '6',
      '中',
      '程序设计',
      'OOP',
    ],
    [
      '判断',
      'JavaScript 只能在浏览器中运行',
      '',
      '',
      '',
      '',
      '',
      '',
      '错',
      '2',
      '易',
      '程序设计',
      'JS基础',
    ],
    [
      '填空',
      '我国首都是',
      '',
      '',
      '',
      '',
      '',
      '',
      '北京',
      '3',
      '易',
      '地理',
      '中国',
    ],
    [
      '简答',
      '简述 MVC 各层职责',
      '',
      '',
      '',
      '',
      '',
      '',
      'M 模型负责数据与业务；V 视图负责展示；C 控制器负责请求调度。（示例，可按课程调整）',
      '10',
      '中',
      '软件工程',
      '架构',
    ],
    ['编程', '实现函数 sum(a,b)', '', '', '', '', '', '', '写出函数定义及一两句思路即可得分要点', '15', '难', '程序设计', '函数'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '题库导入');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function cell(row, idx) {
  const v = row[idx];
  if (v == null) return '';
  return String(v).trim();
}

function buildOptions(type, row) {
  if (type !== 'single' && type !== 'multi') return null;
  const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
  const opts = [];
  for (let i = 0; i < 6; i += 1) {
    const label = cell(row, COL.OPT_FIRST + i);
    if (label) opts.push({ key: keys[i], label });
  }
  return opts.length ? opts : null;
}

function buildAnswerJson(type, correctRaw) {
  const c = String(correctRaw == null ? '' : correctRaw).trim();
  if (type === 'single') {
    return { correct: c.toUpperCase().slice(0, 1) || c };
  }
  if (type === 'multi') {
    const parts = c.split(/[,;，；\s]+/).filter(Boolean);
    return { correct: parts.map((x) => x.toUpperCase()) };
  }
  if (type === 'judge') {
    const low = c.toLowerCase();
    if (['对', '是', 'true', '1', 'yes', '√', 't'].includes(low)) return { correct: true };
    if (['错', '否', 'false', '0', 'no', '×', 'x', 'f'].includes(low)) return { correct: false };
    throw new Error(`判断题「正确答案」列无法识别，请填：对/错/是/否 等（当前：${c}）`);
  }
  if (type === 'fill') {
    return { correct: c, ignoreCase: true };
  }
  if (type === 'short' || type === 'code') {
    return {};
  }
  throw new Error('未知题型');
}

/**
 * @returns {{ ok: true, rows: object[] } | { ok: false, errors: { row: number, message: string }[] }}
 */
function parseImportWorkbook(buffer) {
  const errors = [];
  const rowsOut = [];
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!data.length) {
    return { ok: false, errors: [{ row: 0, message: '空表' }] };
  }
  const header = data[0].map((x) => String(x).trim());
  const miss = HEADERS.filter((h, i) => cell(header, i) !== h);
  if (miss.length) {
    return {
      ok: false,
      errors: [
        {
          row: 1,
          message: `表头须与模板完全一致（共 ${HEADERS.length} 列）。请在系统中下载最新模板。缺失或错位：${miss.join('、')}`,
        },
      ],
    };
  }
  for (let r = 1; r < data.length; r += 1) {
    const row = data[r];
    const excelRow = r + 1;
    if (!row || !row.some((x) => String(x || '').trim())) continue;
    try {
      const typeZh = cell(row, COL.TYPE);
      const stem = cell(row, COL.STEM);
      const correct = cell(row, COL.CORRECT);
      const scoreStr = cell(row, COL.SCORE);
      const diffZh = cell(row, COL.DIFF);
      const course = cell(row, COL.COURSE) || null;
      const know = cell(row, COL.KNOW) || null;
      if (!stem) throw new Error('题干不能为空');
      const type = resolveType(typeZh);
      if (!type) throw new Error(`题型不支持：${typeZh}（请用模板列「类型」：单选/编程等或英文 single/code）`);
      if (!correct && type !== 'short' && type !== 'code') throw new Error('正确答案不能为空');
      const score = parseFloat(scoreStr);
      if (!Number.isFinite(score) || score <= 0) throw new Error('分值须为正数');
      const difficulty = resolveDifficulty(diffZh);
      const options_json = buildOptions(type, row);
      const answer_json = buildAnswerJson(type, correct);
      const knowledge_tags = know
        ? know.split(/[,，;；]/).map((x) => x.trim()).filter(Boolean)
        : null;
      rowsOut.push({
        type,
        stem,
        options_json,
        answer_json,
        reference_answer: type === 'short' || type === 'code' ? correct || null : null,
        default_score: score,
        difficulty,
        course_label: course,
        knowledge_tags,
      });
    } catch (e) {
      errors.push({ row: excelRow, message: e.message || String(e) });
    }
  }
  if (errors.length) return { ok: false, errors };
  if (!rowsOut.length) return { ok: false, errors: [{ row: 0, message: '无有效数据行' }] };
  return { ok: true, rows: rowsOut };
}

function buildScoresExportBuffer({ title, rows, stats }) {
  const head = ['学号', '姓名', '用户名', '客观分', '主观分', '总分', '排名', '交卷时间'];
  const aoa = [[title], [], ['统计', `平均分:${stats.avg}`, `最高:${stats.max}`, `最低:${stats.min}`, `参考人数:${stats.n}`], [], head];
  for (const row of rows) {
    aoa.push([
      row.student_no || '',
      row.real_name || '',
      row.username || '',
      row.objective_score ?? '',
      row.subjective_score ?? '',
      row.total_score ?? '',
      row.rank_in_class ?? '',
      row.submitted_at ? String(row.submitted_at) : '',
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '成绩');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  HEADERS,
  buildImportTemplateBuffer,
  parseImportWorkbook,
  buildScoresExportBuffer,
};
