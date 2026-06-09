#!/usr/bin/env bash
# Fix CRLF when project is zipped on Windows
if grep -q $'\r' "$0" 2>/dev/null; then
  sed -i 's/\r$//' "$0"
  exec bash "$0" "$@"
fi
# 一次性安装：开机自启 → 打开电脑浏览器即可访问 http://<本机IP>/
# 用法（root）：sudo bash scripts/install-autostart.sh

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "请使用 root 运行: sudo bash scripts/install-autostart.sh"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RUN_USER="${SUDO_USER:-root}"
if [[ "$RUN_USER" == "root" ]] && [[ -n "${INSTALL_USER:-}" ]]; then
  RUN_USER="$INSTALL_USER"
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "未找到 node，请先安装 Node.js"
  exit 1
fi

echo "==> 项目目录: $ROOT"
echo "==> Node: $NODE_BIN ($("$NODE_BIN" -v))"

if [[ ! -f .env ]]; then
  cp .env.host.example .env
  echo ""
  echo "已生成 .env，请先编辑 DB_PASSWORD / JWT_SECRET / NEO4J_PASSWORD 后重新运行"
  exit 1
fi

if grep -q '^DB_HOST=mariadb' .env 2>/dev/null; then
  sed -i 's/^DB_HOST=mariadb/DB_HOST=localhost/' .env
fi
if grep -q '^REDIS_HOST=redis' .env 2>/dev/null; then
  sed -i 's/^REDIS_HOST=redis/REDIS_HOST=127.0.0.1/' .env
fi
if grep -q '^REDIS_URL=redis://redis:' .env 2>/dev/null; then
  sed -i 's|^REDIS_URL=redis://redis:|REDIS_URL=redis://127.0.0.1:|' .env
fi
if grep -q '^NEO4J_URI=bolt://neo4j:' .env 2>/dev/null; then
  sed -i 's|^NEO4J_URI=bolt://neo4j:|NEO4J_URI=bolt://127.0.0.1:|' .env
fi
if ! grep -q '^PORT=8080' .env 2>/dev/null; then
  if grep -q '^PORT=' .env; then
    sed -i 's/^PORT=.*/PORT=8080/' .env
  else
    echo 'PORT=8080' >> .env
  fi
fi

echo "==> 构建前端 dist"
(cd frontend && rm -rf node_modules && npm install && chmod -R a+x node_modules/.bin 2>/dev/null || true && npm run build)

echo "==> 安装后端依赖"
(cd backend && rm -rf node_modules && npm install --omit=dev && chmod -R a+x node_modules/.bin 2>/dev/null || true)

echo "==> 配置 Nginx"
if ! command -v nginx >/dev/null 2>&1; then
  echo "未安装 nginx，请先安装 nginx"
  exit 1
fi
mkdir -p /etc/nginx/conf.d
sed "s|__PROJECT_ROOT__|$ROOT|g" deploy/nginx/host-native.conf > /etc/nginx/conf.d/grading.conf
nginx -t
systemctl enable nginx
systemctl restart nginx

setup_code_runner_host() {
  local jobs_root="/var/lib/smart-grading/code-runner/jobs"
  local runner_user="code_runner"
  if grep -q '^CODE_RUNNER_JOBS_ROOT=' .env 2>/dev/null; then
    jobs_root="$(grep '^CODE_RUNNER_JOBS_ROOT=' .env | head -1 | cut -d= -f2- | tr -d ' \"')"
  fi
  if grep -q '^CODE_RUNNER_USER=' .env 2>/dev/null; then
    runner_user="$(grep '^CODE_RUNNER_USER=' .env | head -1 | cut -d= -f2- | tr -d ' \"')"
  fi

  echo "==> 初始化 Code Runner 宿主机环境（host 模式）"
  if ! id "$runner_user" &>/dev/null; then
    useradd -r -s /usr/sbin/nologin -M "$runner_user" 2>/dev/null \
      || useradd -r -s /bin/false -M "$runner_user"
    echo "    已创建系统用户 $runner_user"
  fi

  mkdir -p "$jobs_root"
  chown "$RUN_USER:$RUN_USER" "$jobs_root"
  chmod 700 "$jobs_root"

  local missing=()
  for bin in runuser timeout python3 node gcc g++ javac java; do
    command -v "$bin" >/dev/null 2>&1 || missing+=("$bin")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "    警告：未找到 ${missing[*]} — host 模式部分语言可能无法运行"
    echo "    请安装 util-linux（runuser/timeout）、python3、nodejs、gcc、g++、openjdk"
  fi
}

ensure_env_var() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    return 0
  fi
  echo "${key}=${value}" >> .env
}

enable_if_exists() {
  local unit="$1"
  if systemctl list-unit-files "$unit" >/dev/null 2>&1; then
    systemctl enable "$unit" 2>/dev/null || true
    systemctl start "$unit" 2>/dev/null || true
    echo "    已启用 $unit"
  fi
}
echo "==> 启用 MariaDB / Redis 开机自启"
for u in mariadb mysqld mysql redis redis-server; do
  enable_if_exists "$u"
done

echo "==> 启用 Docker 与 Neo4j 容器开机自启"
if command -v docker >/dev/null 2>&1; then
  systemctl enable docker
  systemctl start docker
  docker compose -f docker-compose.host.yml up -d || echo "Neo4j 启动失败，可在 .env 设 KG_NEO4J_ENABLED=0"
  sed "s|__INSTALL_ROOT__|$ROOT|g" deploy/systemd/smart-grading-neo4j.service \
    > /etc/systemd/system/smart-grading-neo4j.service
  systemctl daemon-reload
  systemctl enable smart-grading-neo4j.service
else
  echo "    未安装 docker，跳过 Neo4j 容器"
fi

# host 模式 Code Runner：补全 .env 默认值（不覆盖已有项）
ensure_env_var CODE_RUNNER_MODE host
ensure_env_var CODE_RUNNER_JOBS_ROOT /var/lib/smart-grading/code-runner/jobs
ensure_env_var CODE_RUNNER_USER code_runner
if grep -q '^CODE_RUNNER_MODE=host' .env 2>/dev/null; then
  setup_code_runner_host
fi

echo "==> 安装后端开机自启服务"
sed -e "s|__INSTALL_ROOT__|$ROOT|g" \
    -e "s|__RUN_USER__|$RUN_USER|g" \
    -e "s|__NODE_BIN__|$NODE_BIN|g" \
    deploy/systemd/smart-grading-backend.service \
    > /etc/systemd/system/smart-grading-backend.service

sed -e "s|__INSTALL_ROOT__|$ROOT|g" \
    -e "s|__RUN_USER__|$RUN_USER|g" \
    -e "s|__NODE_BIN__|$NODE_BIN|g" \
    deploy/systemd/smart-grading-grading-worker.service \
    > /etc/systemd/system/smart-grading-grading-worker.service

sed -e "s|__INSTALL_ROOT__|$ROOT|g" \
    -e "s|__RUN_USER__|$RUN_USER|g" \
    -e "s|__NODE_BIN__|$NODE_BIN|g" \
    deploy/systemd/smart-grading-code-runner.service \
    > /etc/systemd/system/smart-grading-code-runner.service

systemctl daemon-reload
systemctl enable smart-grading-backend.service
systemctl enable smart-grading-grading-worker.service
systemctl enable smart-grading-code-runner.service
systemctl restart smart-grading-backend.service
systemctl restart smart-grading-grading-worker.service
systemctl restart smart-grading-code-runner.service

HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "============================================"
echo " 安装完成。浏览器访问: http://${HOST_IP:-127.0.0.1}/"
echo "============================================"
echo "  systemd 单元：backend / grading-worker / code-runner / nginx"
echo "  systemctl status smart-grading-backend smart-grading-grading-worker smart-grading-code-runner"
echo "  journalctl -u smart-grading-code-runner -f"
if grep -q '^CODE_RUNNER_ENABLED=1' .env 2>/dev/null; then
  echo ""
  echo "  Code Runner 已启用（host）。演示前请确认："
  echo "    1. 管理端已配置 LLM（在线实训 + AI 点评）"
  echo "    2. ONLINE_PRACTICE_AI_REVIEW_ENABLED=1（若需 AI 点评）"
  echo "    3. PUBLIC_APP_URL=http://${HOST_IP:-127.0.0.1}"
fi
