#!/bin/bash
# 从 2025-12-29 到 2026-02-23 每周一执行一次完整工作流（可重复运行，已存在的周会覆盖/补充）
# 用法：cd 项目根目录 && bash scripts/run_weekly_backfill.sh

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MONDAYS="2025-12-29 2026-01-05 2026-01-12 2026-01-19 2026-01-26 2026-02-02 2026-02-09 2026-02-16 2026-02-23"

for monday in $MONDAYS; do
  echo "========== 开始周 $monday =========="
  node scripts/workflow_week_rank_changes.js "$monday"
  echo "========== 完成周 $monday =========="
done

echo "全部 9 周回填完成。"
