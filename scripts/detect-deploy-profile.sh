#!/usr/bin/env bash
# 云 ECS 部署档位检测（写入 .env 中的资源相关变量）
# 用法：bash scripts/detect-deploy-profile.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "未找到 $ENV_FILE，请先 cp .env.example .env"
  exit 1
fi

MEM_MB=$(free -m 2>/dev/null | awk '/Mem:/ {print $2}' || echo 8192)
CPU=$(nproc 2>/dev/null || echo 4)

if [[ "$MEM_MB" -lt 5000 ]]; then
  PROFILE=small
elif [[ "$MEM_MB" -lt 9000 ]]; then
  PROFILE=medium
else
  PROFILE=large
fi

# 默认强制 medium（4c8g 推荐）；机器明显小于 4G 时用 small
if [[ "$MEM_MB" -ge 7000 ]]; then
  PROFILE=medium
fi

set_kv() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

case "$PROFILE" in
  small)
    WORKERS=1
    NEO4J_HEAP_INITIAL=256m
    NEO4J_HEAP_MAX=512m
    NEO4J_PAGECACHE=256m
    NEO4J_MEM_LIMIT=1g
    BACKEND_MEM_LIMIT=768m
    REDIS_MAXMEMORY=128mb
    ;;
  medium)
    WORKERS=2
    NEO4J_HEAP_INITIAL=512m
    NEO4J_HEAP_MAX=1G
    NEO4J_PAGECACHE=512m
    NEO4J_MEM_LIMIT=2g
    BACKEND_MEM_LIMIT=1536m
    REDIS_MAXMEMORY=256mb
    ;;
  large)
    WORKERS=4
    NEO4J_HEAP_INITIAL=1G
    NEO4J_HEAP_MAX=2G
    NEO4J_PAGECACHE=1G
    NEO4J_MEM_LIMIT=4g
    BACKEND_MEM_LIMIT=3g
    REDIS_MAXMEMORY=512mb
    ;;
esac

set_kv DEPLOY_PROFILE "$PROFILE"
set_kv CLUSTER_WORKERS "$WORKERS"
set_kv NEO4J_HEAP_INITIAL "$NEO4J_HEAP_INITIAL"
set_kv NEO4J_HEAP_MAX "$NEO4J_HEAP_MAX"
set_kv NEO4J_PAGECACHE "$NEO4J_PAGECACHE"
set_kv NEO4J_MEM_LIMIT "$NEO4J_MEM_LIMIT"
set_kv BACKEND_MEM_LIMIT "$BACKEND_MEM_LIMIT"
set_kv REDIS_MAXMEMORY "$REDIS_MAXMEMORY"

echo "检测完成：CPU=${CPU} MEM=${MEM_MB}MB → DEPLOY_PROFILE=${PROFILE}"
echo "已更新：$ENV_FILE"
