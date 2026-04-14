#!/bin/bash
#
# 设置「Arrow Madness + 竞品」每日榜单工作流（拉 API 写库 + 可选飞书）
#
# 对应命令：node scripts/arrow_madness_daily_competitors.js
# 日期：与 US 免费日报相同，默认 US_FREE_DAILY_CALENDAR_TZ（默认 Asia/Shanghai）「昨天 vs 前天」。
# 产品：默认拉 appid_us.json 中 APPID_US_COMPETITORS_INTERNAL_NAME（默认 Arrow2）；可在 .env 里改，或改 crontab 命令行追加 --internal-name / --product。
# 数据库：默认 data/us_free_appid_weekly.db（与 US 免费榜同库）；可用 APPID_US_COMPETITORS_DB 覆盖。
#
# 环境变量：Node 读取项目根 .env（SENSORTOWER_API_TOKEN、FEISHU_WEBHOOK_URL 等）
#
# 用法：
#   bash scripts/setup_arrow_madness_daily_cron.sh
#   YES=1 bash scripts/setup_arrow_madness_daily_cron.sh
#

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

NODE_PATH=$(command -v node)
if [ -z "$NODE_PATH" ]; then
  echo "错误: 未找到 node"
  exit 1
fi

DAILY_JS="$PROJECT_ROOT/scripts/arrow_madness_daily_competitors.js"
if [ ! -f "$DAILY_JS" ]; then
  echo "错误: 未找到 $DAILY_JS"
  exit 1
fi

mkdir -p "$PROJECT_ROOT/logs"

MARKER="arrow_madness_daily_competitors.js"
CRON_EXPR="${ARROW_MADNESS_DAILY_CRON:-5 10 * * *}"
LOG_FILE="$PROJECT_ROOT/logs/arrow_madness_daily_competitors.log"
CRON_CMD="cd $PROJECT_ROOT && $NODE_PATH $DAILY_JS >> $LOG_FILE 2>&1"

EXISTING=$(crontab -l 2>/dev/null | grep -F "$MARKER" || true)

if [ -n "$EXISTING" ]; then
  echo "⚠️  已存在 Arrow Madness 日报定时任务："
  echo "$EXISTING"
  echo ""
  if [ "${YES:-}" = "1" ]; then
    REPLY=y
  else
    read -p "是否替换？(y/n): " -n 1 -r
    echo ""
  fi
  if [[ ! ${REPLY:-n} =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
  fi
  crontab -l 2>/dev/null | grep -vF "$MARKER" | crontab - || true
fi

( crontab -l 2>/dev/null; echo "$CRON_EXPR $CRON_CMD" ) | crontab -

echo "✅ Arrow Madness 竞品日报 cron 已写入"
echo ""
echo "  调度: $CRON_EXPR （可用 ARROW_MADNESS_DAILY_CRON 覆盖）"
echo "  日志: $LOG_FILE"
echo "  手动: cd $PROJECT_ROOT && $NODE_PATH $DAILY_JS"
echo ""
