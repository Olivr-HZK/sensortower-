#!/bin/bash
# 兼容入口：逻辑已合并到 setup_cron.sh，请优先使用：
#   bash scripts/setup_cron.sh
# 本脚本等价于仅安装「每日我方产品」一条 cron。
set -euo pipefail
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
exec bash "$SCRIPT_DIR/setup_cron.sh" --daily-only
