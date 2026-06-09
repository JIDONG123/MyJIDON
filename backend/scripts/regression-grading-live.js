#!/usr/bin/env node
/**
 * 显式开启 LIVE AI 模式的批改回归入口（会创建真实 grading_jobs，可能调用 LLM）。
 * 等价于：REGRESSION_LIVE_AI=1 REGRESSION_ALLOW_MUTATION=1 npm run regression:grading
 */
process.env.REGRESSION_LIVE_AI = '1';
process.env.REGRESSION_ALLOW_MUTATION = '1';
require('./regression-grading-phase4.js');
