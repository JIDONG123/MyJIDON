/**
 * 测试数据常量（字段名与 migration_curriculum_teaching_v1.sql / init.sql 对齐）
 * seed 启动时会校验 information_schema，缺失列则报错退出。
 */

const PREFIX = '测试-';
const USER_PREFIX = 'test-';

/** 与 init.sql 中学生/教师默认密码 123456 相同的 bcrypt 哈希 */
const BCRYPT_PASSWORD_123456 =
  '$2a$10$yCilYCYozCmBP5ykHfbJleRUtIWd5BrQ42E0bXtK1y7oVsoysKSW2';

const EVALUATION_METRICS = [
  { name: '功能完整性', weight: 0.35, maxScore: 100 },
  { name: '代码规范', weight: 0.25, maxScore: 100 },
  { name: '文档与交付', weight: 0.2, maxScore: 100 },
  { name: '创新与扩展', weight: 0.2, maxScore: 100 },
];

const VERIFICATION_SAMPLE = {
  requirementComparison: '提交内容与任务要求基本匹配，核心功能已实现。',
  enterpriseAlignment: '具备岗位要求的协作与文档能力，建议加强异常处理。',
  logicIssues: ['部分边界条件未覆盖', '数据库连接未做池化说明'],
  stepCompleteness: {
    covered: ['需求分析', '核心功能', '基础测试'],
    missing: ['性能测试报告'],
    score: 78,
  },
  summary: '整体完成度良好，可在工程化与测试方面继续加强。',
  codeStyleReview: { naming: '良好', structure: '清晰', comments: '建议补充模块说明' },
};

const MAJORS = [
  { code: 'TEST-SW', name: `${PREFIX}软件技术`, college: `${PREFIX}信息工程学院` },
  { code: 'TEST-AI', name: `${PREFIX}人工智能技术应用`, college: `${PREFIX}信息工程学院` },
];

const TERM = {
  name: `${PREFIX}2025-2026学年第二学期`,
  year: 2025,
  season: 'spring',
  is_current: 1,
};

const COURSES = [
  {
    course_code: 'TEST-JAVA-WEB',
    course_name: `${PREFIX}Java Web 项目实训`,
    majorCode: 'TEST-SW',
    leaderUsername: 'teacher1',
    course_goal: '掌握 Java Web 全栈开发与团队协作交付。',
    ability_goals: '能独立完成 CRUD、权限与接口文档编写。',
  },
  {
    course_code: 'TEST-VUE3',
    course_name: `${PREFIX}Vue3 前端项目实训`,
    majorCode: 'TEST-SW',
    leaderUsername: 'teacher2',
    course_goal: '掌握 Vue3 组件化与工程化构建。',
    ability_goals: '能完成后台管理系统前端模块开发与联调。',
  },
  {
    course_code: 'TEST-LLM-APP',
    course_name: `${PREFIX}大模型应用开发实训`,
    majorCode: 'TEST-AI',
    leaderUsername: 'test-teacher-01',
    course_goal: '掌握大模型 API 调用与 Prompt 工程。',
    ability_goals: '能构建可演示的智能问答类应用。',
  },
];

const TEACHING_CLASSES = [
  {
    class_code: 'TEST-JW-01',
    class_name: `${PREFIX}Java Web 实训 1 班`,
    course_code: 'TEST-JAVA-WEB',
    location: '实训楼 A201',
    leadUsername: 'test-teacher-01',
    enterpriseUsername: 'test-enterprise-01',
  },
  {
    class_code: 'TEST-VUE-01',
    class_name: `${PREFIX}Vue3 前端实训 1 班`,
    course_code: 'TEST-VUE3',
    location: '实训楼 A202',
    leadUsername: 'test-teacher-02',
    enterpriseUsername: 'test-enterprise-02',
  },
  {
    class_code: 'TEST-LLM-01',
    class_name: `${PREFIX}大模型应用开发实训 1 班`,
    course_code: 'TEST-LLM-APP',
    location: '实训楼 B101',
    leadUsername: 'test-teacher-01',
    enterpriseUsername: 'test-enterprise-01',
  },
];

const TEMPLATES = [
  {
    course_code: 'TEST-JAVA-WEB',
    project_name: `${PREFIX}学生信息管理系统`,
    description: '基于 Java Web 的学生信息增删改查与权限管理实训项目。',
    requirements: '1. 完成用户登录\n2. 学生信息 CRUD\n3. 提交设计说明与源码',
    enterprise_standard: '符合 Java 后端开发岗位初级能力标准。',
    suggested_materials: '设计文档（docx/pdf）、源码 zip、运行截图说明',
    creatorUsername: 'test-teacher-01',
  },
  {
    course_code: 'TEST-VUE3',
    project_name: `${PREFIX}Vue3 后台管理系统`,
    description: '使用 Vue3 + Element Plus 实现后台管理界面。',
    requirements: '1. 至少 3 个业务页面\n2. 路由与状态管理\n3. 与 Mock/真实 API 联调',
    enterprise_standard: '符合前端工程师岗位 UI 与交互规范要求。',
    suggested_materials: '项目说明 md、源码 zip、页面截图',
    creatorUsername: 'test-teacher-02',
  },
  {
    course_code: 'TEST-LLM-APP',
    project_name: `${PREFIX}基于大模型的智能问答系统`,
    description: '调用大模型 API 实现问答与简单知识库检索演示。',
    requirements: '1. 对话界面\n2. Prompt 模板\n3. 错误处理与日志',
    enterprise_standard: '符合 AI 应用开发见习工程师能力要求。',
    suggested_materials: '说明文档 txt、源码 zip、演示录屏说明',
    creatorUsername: 'test-teacher-01',
  },
];

const NEW_USERS = {
  teachers: [
    { username: 'test-teacher-01', real_name: `${PREFIX}教师甲`, email: 'test-t1@example.com' },
    { username: 'test-teacher-02', real_name: `${PREFIX}教师乙`, email: 'test-t2@example.com' },
  ],
  students: [
    { username: 'test-student-01', real_name: `${PREFIX}学生01`, student_no: 'T2025001' },
    { username: 'test-student-02', real_name: `${PREFIX}学生02`, student_no: 'T2025002' },
    { username: 'test-student-03', real_name: `${PREFIX}学生03`, student_no: 'T2025003' },
    { username: 'test-student-04', real_name: `${PREFIX}学生04`, student_no: 'T2025004' },
    { username: 'test-student-05', real_name: `${PREFIX}学生05`, student_no: 'T2025005' },
    { username: 'test-student-06', real_name: `${PREFIX}学生06`, student_no: 'T2025006' },
    { username: 'test-student-07', real_name: `${PREFIX}学生07`, student_no: 'T2025007' },
    { username: 'test-student-08', real_name: `${PREFIX}学生08`, student_no: 'T2025008' },
  ],
  enterprises: [
    { username: 'test-enterprise-01', real_name: `${PREFIX}企业导师甲`, email: 'test-e1@example.com' },
    { username: 'test-enterprise-02', real_name: `${PREFIX}企业导师乙`, email: 'test-e2@example.com' },
  ],
};

/** 教学班学生分配：class_code -> usernames（含 init 学生便于联调） */
const TC_STUDENT_USERNAMES = {
  'TEST-JW-01': ['student1', 'student2', 'test-student-01', 'test-student-02'],
  'TEST-VUE-01': ['student3', 'student4', 'test-student-03', 'test-student-04'],
  'TEST-LLM-01': ['student5', 'test-student-05', 'test-student-06', 'test-student-07'],
};

const LEGACY_CLASS_NAME = '软件2101班';
const LEGACY_TASK_TITLE = `${PREFIX}行政班综合实训（旧 class_id 链路）`;

const SEED_FILES = [
  { name: 'legacy-report.txt', type: 'text/plain', content: '测试-旧链路提交说明\n本文件用于行政班任务提交与导出测试。' },
  { name: 'legacy-notes.md', type: 'text/markdown', content: '# 测试笔记\n\n- 功能点 A\n- 功能点 B\n' },
  { name: 'java-readme.txt', type: 'text/plain', content: '测试-Java Web 实训提交说明文档。' },
  { name: 'vue-guide.md', type: 'text/markdown', content: '# Vue3 实训\n\n组件与路由说明。' },
  { name: 'llm-brief.txt', type: 'text/plain', content: '测试-大模型应用实训简要说明。' },
];

module.exports = {
  PREFIX,
  USER_PREFIX,
  BCRYPT_PASSWORD_123456,
  EVALUATION_METRICS,
  VERIFICATION_SAMPLE,
  MAJORS,
  TERM,
  COURSES,
  TEACHING_CLASSES,
  TEMPLATES,
  NEW_USERS,
  TC_STUDENT_USERNAMES,
  LEGACY_CLASS_NAME,
  LEGACY_TASK_TITLE,
  SEED_FILES,
};
