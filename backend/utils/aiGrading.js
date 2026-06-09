const { chatCompletion } = require('./llmClient');
const {
  normalizeMetrics,
  tryParseJsonObject,
  finalizeGradingFromLlmJson,
} = require('./gradingNormalize');
const { buildCurriculumPromptBlock } = require('./taskGradingContext');

function scenarioHint(task) {
  const s = task.scenario_type || 'mixed';
  const map = {
    teaching: '校内教学实训：侧重课程目标与知识点达成。',
    enterprise_collab: '校企协同实训：需兼顾教学大纲与合作企业的岗位交付标准。',
    mixed: '综合场景：同时对照教学要求与企业/岗位补充标准。',
  };
  return map[s] || map.mixed;
}

function mockGradeSubmission(task, submissionText, options = {}) {
  const metrics = normalizeMetrics(task);
  const fn = options.submissionFileName || '';
  const scores = metrics.map((dim) => ({
    name: dim.name,
    maxScore: dim.maxScore,
    score: Math.min(
      dim.maxScore,
      Math.round(dim.maxScore * (0.65 + Math.random() * 0.25) * 100) / 100
    ),
  }));
  const totalScore = Math.min(
    task.max_score || 100,
    parseFloat(scores.reduce((s, d) => s + d.score, 0).toFixed(2))
  );

  const verification = {
    requirementComparison: '（离线演示）已对照任务要求做简要比对。',
    enterpriseAlignment: task.enterprise_standard
      ? '（离线演示）对企业/岗位标准的契合度需配置大模型后深度分析；此处为占位说明。'
      : '（未配置企业标准）本任务未填写企业/岗位能力条目。',
    logicIssues: [{ title: '示例问题', detail: '部分描述不够严谨，建议补充测试用例说明。' }],
    stepCompleteness: {
      covered: ['需求理解', '基本设计'],
      missing: ['详细测试步骤'],
      score: 72,
    },
    summary: '（未配置大模型 API）使用本地演示规则生成核查摘要。',
    codeStyleReview: /\.(java|py|js|cpp)$/i.test(fn)
      ? {
          syntaxOk: true,
          naming: '（演示）命名基本可读。',
          formatting: '（演示）缩进与换行建议统一为项目规范。',
          comments: '（演示）关键函数建议补充注释。',
          score: 6,
          suggestions: ['为公共方法补充 Javadoc 或 docstring', '统一缩进宽度'],
        }
      : { syntaxOk: true, naming: '', formatting: '', comments: '', score: 0, suggestions: '' },
  };

  return {
    totalScore,
    dimensionScores: scores,
    comment: '（演示数据）整体完成度尚可，请配置云端大模型 API 后获得真实客观评价。',
    problems: '（演示数据）请检查异常处理与文档一致性。',
    suggestions: '（演示数据）建议补充自测记录与关键接口说明。',
    verification,
  };
}

function codeStyleBlock(fileName) {
  const n = String(fileName || '').toLowerCase();
  if (!/\.(java|py|js|ts|jsx|tsx|cpp|c|h|cs)$/i.test(n)) return '';
  return `

【代码专项规范审查（学生上传了代码类附件，请在 verification 中增加 codeStyleReview 对象）】
codeStyleReview 建议字段：
- syntaxOk: true/false（从文本推断是否可能存在语法级硬伤）
- naming: 对变量/类名可读性与规范的简短评价
- formatting: 缩进、换行、风格一致性
- comments: 关键逻辑是否有注释
- score: 0~10 的规范分
- suggestions: 具体可执行的优化建议（字符串数组或换行文本）
`;
}

function stepChecklistBlock(task) {
  const raw = task.step_checklist;
  let list = raw;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = null;
    }
  }
  if (!Array.isArray(list) || list.length === 0) return '';
  const lines = list
    .map((x, i) => {
      const id = x.id != null ? x.id : i + 1;
      const title = String(x.title || x.name || `步骤${i + 1}`).trim();
      const req = x.required ? '（必做）' : '';
      return `- [${id}] ${title}${req}`;
    })
    .join('\n');
  return `

【教师预设步骤核查清单】
你必须对照下列步骤在 verification.stepCompleteness 中说明覆盖与缺失，并在 verification 中给出完成度百分比 stepCompletionPercent（0~100）及缺失步骤 missingStepIds（与清单 id 对应）：
${lines}
`;
}

async function gradeWithLlm(task, submissionText, ragContext, options = {}) {
  const metrics = normalizeMetrics(task);
  const metricsJson = JSON.stringify(metrics, null, 2);
  const reqText = task.requirements || '';
  const scoreCrit = task.scoring_criteria || '';
  const entStd = task.enterprise_standard || '';
  const maxScore = Number(task.max_score) || 100;
  const scene = scenarioHint(task);
  const fileName = options.submissionFileName || '';

  const ragBlock =
    ragContext && String(ragContext).trim()
      ? `\n若下方提供了「教师私有实训知识库」片段，你必须优先对照其中的评分标准、优秀案例与易错点进行核查与给分；与任务要求冲突时以任务正文与知识库中更具体的实训规范为准，并在 verification 中简要说明依据来源。`
      : '';

  const system = `你是高职「高校-企业协同实训」场景下的智能批改与核查助手：同时服务职业院校教学评价与合作企业的批量成果审核需求。必须严格输出一个 JSON 对象，不要输出任何 JSON 之外的文字。
任务场景（批改口径）：${scene}${ragBlock}
输出 JSON Schema 要点：
{
  "dimensionScores": [{"name":"与任务维度同名","score":数字,"maxScore":数字,"brief":"一句理由"}],
  "totalScore": 数字(0~${maxScore}, 与 dimensionScores 加权一致),
  "aiComment": "综合评语（可提及岗位意识、文档交付习惯等）",
  "aiProblems": "问题分析，多行字符串",
  "aiSuggestions": "改进建议，多行字符串",
  "verification": {
    "requirementComparison": "实训成果与教学侧任务要求的逐条对照结论",
    "enterpriseAlignment": "若存在企业/岗位标准：说明成果与交付规范、岗位技能的契合度；若无企业标准可写「未配置企业标准」",
    "logicIssues": [{"title":"短标题","detail":"说明"}],
    "stepCompleteness": {"covered":["已体现步骤"],"missing":["缺失步骤"],"score":0-100},
    "stepCompletionPercent": 0,
    "missingStepIds": [],
    "codeStyleReview": {"syntaxOk":true,"naming":"","formatting":"","comments":"","score":0,"suggestions":""},
    "summary": "智能核查总结（可供教务与企业导师复盘）"
  }
}`;

  const kbSection =
    ragContext && String(ragContext).trim()
      ? `\n\n【教师私有实训知识库（RAG 检索片段，仅供对标批改使用）】\n${String(ragContext).trim().slice(0, 8000)}\n`
      : '';

  const curriculumBlock = buildCurriculumPromptBlock(task);

  const user = `【任务标题】\n${task.title || ''}\n\n【任务要求（教学侧）】\n${reqText}\n\n【评分说明/量规】\n${
    scoreCrit || '（未单独填写，请参考维度配置）'
  }\n\n【企业或岗位能力标准（若有）】\n${entStd || '（未配置）'}${curriculumBlock}\n\n【评价维度配置】\n${metricsJson}\n满分：${maxScore}\n${stepChecklistBlock(task)}${codeStyleBlock(
    fileName
  )}\n${kbSection}\n【学生提交文本（已由系统从文档/PDF/说明中提取）】\n${(
    submissionText || ''
  ).slice(0, 12000)}`;

  const raw = await chatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.25, max_tokens: 4096 }
  );

  if (!raw) return null;

  const obj = tryParseJsonObject(raw);
  if (!obj || typeof obj !== 'object') {
    throw new Error('大模型返回无法解析为 JSON');
  }

  return finalizeGradingFromLlmJson(obj, task, { submissionFileName: fileName });
}

/**
 * AI 批改入口：可选 LangChain 多步编排（USE_LANGCHAIN_GRADING=1），失败则单步 LLM，再失败演示数据。
 * 底层模型始终走 llmClient.chatCompletion，不替换为 LangChain 自带 ChatOpenAI。
 */
async function gradeSubmission(task, submissionText, options = {}) {
  const ragContext = options.ragContext || '';
  const submissionFileName = options.submissionFileName || '';
  let gradingTask = task;
  if (options.enrichCurriculum !== false) {
    const { enrichTaskForGrading } = require('./taskGradingContext');
    gradingTask = await enrichTaskForGrading(task, task.id || options.taskId);
  }

  if (String(process.env.USE_LANGCHAIN_GRADING || '').trim() === '1') {
    try {
      const { runLangChainDeepGrading } = require('./langchainGradingService');
      const deep = await runLangChainDeepGrading(gradingTask, submissionText, ragContext, {
        submissionFileName,
        progressMeta: options.gradingProgressMeta || null,
      });
      if (deep) return deep;
    } catch (e) {
      console.error('LangChain 深度批改不可用或失败，降级单步 LLM:', e && e.message ? e.message : e);
    }
  }

  try {
    const llm = await gradeWithLlm(gradingTask, submissionText, ragContext, { submissionFileName });
    if (llm) return llm;
  } catch (e) {
    console.error('LLM 批改失败，回退演示模式:', e.message);
  }
  return mockGradeSubmission(gradingTask, submissionText, { submissionFileName });
}

module.exports = {
  mockGradeSubmission,
  gradeSubmission,
  normalizeMetrics,
};
