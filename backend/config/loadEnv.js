/**
 * 统一环境变量加载：项目根目录 .env 为唯一配置源（与 docker-compose 共用）。
 * 兼容旧习惯：若仍存在 backend/.env，则在其之后加载并覆盖同名项。
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const backendDir = path.join(__dirname, '..');
const rootEnv = path.join(backendDir, '..', '.env');
const legacyBackendEnv = path.join(backendDir, '.env');

function loadEnv() {
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }
  if (fs.existsSync(legacyBackendEnv)) {
    dotenv.config({ path: legacyBackendEnv, override: true });
  }
}

module.exports = { loadEnv, rootEnv, legacyBackendEnv };
