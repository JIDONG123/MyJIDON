#!/usr/bin/env bash
# 释放大赛固定端口（宿主机上由非 Docker 进程占用时）
set -euo pipefail
PORTS=(3000 5173 3306 6379)

for p in "${PORTS[@]}"; do
  echo "=== port $p ==="
  if command -v ss >/dev/null 2>&1; then
    ss -tlnp | grep ":$p " || true
  fi
  if command -v fuser >/dev/null 2>&1; then
    sudo fuser -k "${p}/tcp" 2>/dev/null || true
  fi
done

echo "若仍占用，请先执行: docker compose down"
