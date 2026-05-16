#!/usr/bin/env bash
# 在 MariaDB 容器已启动且 init.sql 已执行后，按需执行增量 migration（仅旧库升级时需要）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTAINER="${MARIADB_CONTAINER:-sg-mariadb}"
DB_NAME="${DB_NAME:-smart_grading_system}"
DB_USER="${DB_USER:-root}"
DB_PASS="${MARIADB_ROOT_PASSWORD:-root_change_me}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "容器 $CONTAINER 未运行，请先 docker compose up -d mariadb"
  exit 1
fi

run_sql() {
  local f="$1"
  echo ">>> $f"
  docker exec -i "$CONTAINER" mariadb -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$f"
}

# 全新部署通常只需 init.sql；下列脚本供从旧版本库升级
MIGRATIONS=(
  "$ROOT/backend/sql/migration_user_avatar.sql"
  "$ROOT/backend/sql/migration_teacher_class_isolation.sql"
  "$ROOT/backend/sql/migration_scenario_coop.sql"
  "$ROOT/backend/sql/migration_task_score_weights.sql"
  "$ROOT/backend/sql/migration_competition.sql"
  "$ROOT/backend/sql/migration_task_max_submissions.sql"
  "$ROOT/backend/sql/migration_class_recommendation_rules.sql"
  "$ROOT/backend/sql/migration_rag_kb.sql"
  "$ROOT/backend/sql/migration_qbank_exam_v1.sql"
  "$ROOT/backend/sql/migration_qbank_exam_v2.sql"
  "$ROOT/backend/sql/migration_extension_v10.sql"
  "$ROOT/backend/sql/migration_features_v6.sql"
  "$ROOT/backend/sql/migrations/001_grading_async_redis.sql"
  "$ROOT/backend/sql/migrations/002_submission_zip_extract.sql"
)

for f in "${MIGRATIONS[@]}"; do
  if [[ -f "$f" ]]; then
    run_sql "$f" || echo "（跳过或已执行）$f"
  fi
done

echo "增量脚本执行完毕。"
