const { getRunnerMode } = require('../utils/codeRunConfig');
const { runInDocker } = require('./dockerRunnerAdapter');
const { runOnHost } = require('./hostRunnerAdapter');

function getRunnerAdapter() {
  const mode = getRunnerMode();
  return mode === 'host' ? runOnHost : runInDocker;
}

module.exports = { getRunnerAdapter };
