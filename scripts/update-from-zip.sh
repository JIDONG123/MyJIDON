#!/usr/bin/env bash
# 龙芯 VM — zip 更新项目（保留 .env，重建前后端，重启服务）
# 用法：bash scripts/update-from-zip.sh /path/to/update.zip

set -euo pipefail

if grep -q $'\r' "$0" 2>/dev/null; then
  sed -i 's/\r$//' "$0"
  exec bash "$0" "$@"
fi

ZIP="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "$ZIP" || ! -f "$ZIP" ]]; then
  echo "用法: bash scripts/update-from-zip.sh /path/to/update.zip"
  exit 1
fi

echo "==> 备份数据库"
mysqldump -u "${DB_USER:-sg_user}" -p"${DB_PASSWORD:-123456}" smart_grading_system \
  > "$HOME/backup_$(date +%F_%H%M).sql" 2>/dev/null \
  || echo "（跳过 DB 备份，请确认 mysqldump 可用）"

echo "==> 解压到临时目录"
TMP="$ROOT/../B1_update_$$"
unzip -o "$ZIP" -d "$TMP"

# 若 zip 内多一层目录，取含 backend 的那层
if [[ ! -d "$TMP/backend" ]]; then
  INNER=$(find "$TMP" -mindepth 1 -maxdepth 2 -type d -name backend | head -1)
  if [[ -n "$INNER" ]]; then
    TMP="$(dirname "$INNER")"
  fi
fi

if [[ -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env" "$TMP/.env"
fi

echo "==> 替换项目目录"
mv "$ROOT" "$ROOT.bak.$(date +%F_%H%M)" 2>/dev/null || true
mv "$TMP" "$ROOT"
cd "$ROOT"

find "$ROOT/scripts" -name '*.sh' -exec sed -i 's/\r$//' {} + 2>/dev/null || true

echo "==> 构建前端"
(cd frontend && rm -rf node_modules && npm install && npm run build)

echo "==> 安装后端依赖"
(cd backend && rm -rf node_modules && npm install --omit=dev)

chmod 755 "$(dirname "$ROOT")" "$ROOT" "$ROOT/frontend" 2>/dev/null || true
chmod -R 755 "$ROOT/frontend/dist"

echo "==> 重启服务"
systemctl restart smart-grading-backend smart-grading-grading-worker smart-grading-code-runner nginx 2>/dev/null || {
  echo "请手动：systemctl restart smart-grading-backend smart-grading-grading-worker smart-grading-code-runner nginx"
}

echo "更新完成: http://$(hostname -I 2>/dev/null | awk '{print $1}')/"
