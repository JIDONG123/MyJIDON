/**
 * 脚本安全模式工具（回归 / smoke / seed 共用）
 *
 * 默认 SAFE：不写库、不调用 LLM、不入 BullMQ。
 * LIVE 写库：SCRIPT_ALLOW_MUTATION=1
 * LIVE AI：SCRIPT_LIVE_AI=1 且 SCRIPT_ALLOW_MUTATION=1
 *
 * 非开发库额外要求：SCRIPT_CONFIRM_PRODUCTION=YES
 */

function getScriptMode() {
  const allowMutation = process.env.SCRIPT_ALLOW_MUTATION === '1';
  const liveAi =
    process.env.SCRIPT_LIVE_AI === '1' ||
    process.env.REGRESSION_LIVE_AI === '1';
  const allowMutationEffective =
    allowMutation || process.env.REGRESSION_ALLOW_MUTATION === '1';
  const liveAiMode = liveAi && allowMutationEffective;
  return {
    allowMutation: allowMutationEffective,
    liveAi,
    liveAiMode,
    safeMode: !allowMutationEffective,
  };
}

function dbNameLooksDev(dbName) {
  const name = String(dbName || '').trim();
  if (!name) return true;
  return /(test|dev|local|staging|demo)/i.test(name);
}

function assertProductionMutationGuard() {
  const mode = getScriptMode();
  if (!mode.allowMutation) return mode;

  const dbName = String(process.env.DB_NAME || '').trim();
  if (dbNameLooksDev(dbName)) return mode;

  const confirmed =
    process.env.SCRIPT_CONFIRM_PRODUCTION === 'YES' ||
    process.env.REGRESSION_CONFIRM_PRODUCTION === 'YES';
  if (!confirmed) {
    console.error(
      `\n拒绝写操作：DB_NAME="${dbName}" 不像开发/测试库。\n` +
        '若确需在此库执行，请设置 SCRIPT_CONFIRM_PRODUCTION=YES。\n'
    );
    process.exit(1);
  }
  console.warn(`\n警告：已在非开发库 "${dbName}" 执行 mutation（已人工确认）。\n`);
  return mode;
}

function printModeBanner(title, { liveAiHint = false } = {}) {
  const mode = getScriptMode();
  if (mode.liveAiMode || (liveAiHint && mode.allowMutation)) {
    console.log(`=== ${title} LIVE MODE ===`);
    console.log('警告：可能写入数据库、调用 LLM 或 enqueue BullMQ');
    console.log('');
    return mode;
  }
  if (mode.allowMutation) {
    console.log(`=== ${title} MUTATION MODE ===`);
    console.log('将写入数据库（不含 AI 批改时通常不调用 LLM）');
    console.log('');
    return mode;
  }
  console.log(`=== ${title} SAFE MODE ===`);
  console.log('默认不写入业务数据；如需写库请设置 SCRIPT_ALLOW_MUTATION=1');
  if (liveAiHint) {
    console.log('如需真实 AI 批改/LLM 请额外设置 SCRIPT_LIVE_AI=1');
  }
  console.log('');
  return mode;
}

function requireMutation(label) {
  const mode = getScriptMode();
  if (!mode.allowMutation) {
    console.log(`跳过 ${label}：当前为 SAFE MODE（需 SCRIPT_ALLOW_MUTATION=1）`);
    return false;
  }
  assertProductionMutationGuard();
  return true;
}

function requireLiveAi(label) {
  const mode = getScriptMode();
  if (!mode.liveAiMode) {
    console.log(
      `跳过 ${label}：需 SCRIPT_LIVE_AI=1 且 SCRIPT_ALLOW_MUTATION=1（或 regression 同名变量）`
    );
    return false;
  }
  assertProductionMutationGuard();
  return true;
}

module.exports = {
  getScriptMode,
  dbNameLooksDev,
  assertProductionMutationGuard,
  printModeBanner,
  requireMutation,
  requireLiveAi,
};
