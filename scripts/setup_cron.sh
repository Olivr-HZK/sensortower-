#!/bin/bash
#
# 一键写入 crontab：SensorTower 每周 Top100 工作流（含末尾 Python 周报推送）+ 我方产品 US 免费榜日报（拉 API 写库并推送）
#
# 每周（默认 周一 10:30）
#   cd <项目根> && node scripts/weekly_automated_workflow.js >> logs/weekly_workflow.log 2>&1
#   → 内部：workflow_week_rank_changes.js（8 步）成功后执行 send_sensortower_weekly_push.py --date <本周一>
#   需：Node、python3、.env（SENSORTOWER_API_TOKEN、飞书/企微 Webhook 等）
#   跳过推送（仅跑库内工作流）：在 crontab 命令前加环境变量 SKIP_SENSORTOWER_WEEKLY_PUSH=1
#
# 每日（默认 每天 10:00，本机时区）
#   cd <项目根> && node scripts/us_free_appid_weekly_rank_changes.js --daily --no-competitors >> logs/us_free_daily.log 2>&1
#   → 按 data/appid_us.json 配置拉 SensorTower 排名写入 data/us_free_appid_weekly.db，并推送飞书/企微（日环比）
#   调度覆盖：环境变量 US_FREE_DAILY_CRON（默认 0 10 * * *）；日历时区见脚本内 US_FREE_DAILY_CALENDAR_TZ
#
# 第三条（每日本品+竞品，默认 10:05）：本脚本不写入，请单独执行
#   bash scripts/setup_arrow_madness_daily_cron.sh
#   或 npm run setup-arrow-madness-daily-cron
#   说明见 docs/THREE_WORKFLOWS.md
#
# 用法：
#   bash scripts/setup_cron.sh                    # 周 + 日都写入（已存在则分别询问是否替换；YES=1 非交互全替换）
#   bash scripts/setup_cron.sh --weekly-only
#   bash scripts/setup_cron.sh --daily-only
#   YES=1 bash scripts/setup_cron.sh
#   SENSORTOWER_WEEKLY_CRON="30 9 * * 1" US_FREE_DAILY_CRON="0 9 * * *" bash scripts/setup_cron.sh
#

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

INSTALL_WEEKLY=1
INSTALL_DAILY=1
for arg in "$@"; do
  case "$arg" in
    --weekly-only) INSTALL_DAILY=0 ;;
    --daily-only) INSTALL_WEEKLY=0 ;;
    -h|--help)
      head -n 35 "$0" | tail -n +2
      exit 0
      ;;
  esac
done

if [[ "$INSTALL_WEEKLY" -eq 0 && "$INSTALL_DAILY" -eq 0 ]]; then
  echo "错误: 未选择任何任务（勿同时传冲突参数）"
  exit 1
fi

NODE_PATH=$(command -v node)
if [[ -z "$NODE_PATH" ]]; then
  echo "错误: 未找到 node，请先安装 Node.js"
  exit 1
fi

mkdir -p "$PROJECT_ROOT/logs"

# ---------- 每周 Top100 + 推送 ----------
WEEKLY_SCRIPT="$PROJECT_ROOT/scripts/weekly_automated_workflow.js"
WEEKLY_MARKER="weekly_automated_workflow.js"
WEEKLY_CRON_EXPR="${SENSORTOWER_WEEKLY_CRON:-30 10 * * 1}"
WEEKLY_LOG="$PROJECT_ROOT/logs/weekly_workflow.log"
WEEKLY_CMD="cd $PROJECT_ROOT && $NODE_PATH $WEEKLY_SCRIPT >> $WEEKLY_LOG 2>&1"

# ---------- 我方产品日报（爬取 + 推送）----------
DAILY_JS="$PROJECT_ROOT/scripts/us_free_appid_weekly_rank_changes.js"
DAILY_MARKER="us_free_appid_weekly_rank_changes.js --daily --no-competitors"
DAILY_CRON_EXPR="${US_FREE_DAILY_CRON:-0 10 * * *}"
DAILY_LOG="$PROJECT_ROOT/logs/us_free_daily.log"
DAILY_CMD="cd $PROJECT_ROOT && $NODE_PATH $DAILY_JS --daily --no-competitors >> $DAILY_LOG 2>&1"

confirm_replace() {
  local existing="$1"
  if [[ -z "$existing" ]]; then
    return 0
  fi
  echo "⚠️  检测到已存在的任务："
  echo "$existing"
  echo ""
  if [[ "${YES:-}" == "1" ]]; then
    return 0
  fi
  read -r -p "是否替换为当前脚本中的命令？(y/n): " -n 1
  echo ""
  [[ ${REPLY:-n} =~ ^[Yy]$ ]]
}

# 每周
if [[ "$INSTALL_WEEKLY" -eq 1 ]]; then
  if [[ ! -f "$WEEKLY_SCRIPT" ]]; then
    echo "错误: 未找到 $WEEKLY_SCRIPT"
    exit 1
  fi
  EXISTING_W=$(crontab -l 2>/dev/null | grep -F "$WEEKLY_MARKER" || true)
  if [[ -n "$EXISTING_W" ]]; then
    if confirm_replace "$EXISTING_W"; then
      (crontab -l 2>/dev/null || true) | grep -vF "$WEEKLY_MARKER" | crontab - || true
    else
      echo "已跳过「每周 Top100」cron 写入"
      INSTALL_WEEKLY=0
    fi
  fi
  if [[ "$INSTALL_WEEKLY" -eq 1 ]]; then
    ( (crontab -l 2>/dev/null || true) | grep -vF "$WEEKLY_MARKER" || true
      echo "$WEEKLY_CRON_EXPR $WEEKLY_CMD"
    ) | crontab -
    echo "✅ 每周任务已写入"
    echo "   调度: $WEEKLY_CRON_EXPR （可用 SENSORTOWER_WEEKLY_CRON 覆盖）"
    echo "   日志: $WEEKLY_LOG"
  fi
fi

# 每日（我方产品）
if [[ "$INSTALL_DAILY" -eq 1 ]]; then
  if [[ ! -f "$DAILY_JS" ]]; then
    echo "错误: 未找到 $DAILY_JS"
    exit 1
  fi
  EXISTING_D=$(crontab -l 2>/dev/null | grep -F "$DAILY_MARKER" || true)
  if [[ -n "$EXISTING_D" ]]; then
    if confirm_replace "$EXISTING_D"; then
      (crontab -l 2>/dev/null || true) | grep -vF "$DAILY_MARKER" | crontab - || true
    else
      echo "已跳过「每日我方产品」cron 写入"
      INSTALL_DAILY=0
    fi
  fi
  if [[ "$INSTALL_DAILY" -eq 1 ]]; then
    ( (crontab -l 2>/dev/null || true) | grep -vF "$DAILY_MARKER" || true
      echo "$DAILY_CRON_EXPR $DAILY_CMD"
    ) | crontab -
    echo "✅ 每日任务（我方产品 US 免费榜日环比）已写入"
    echo "   调度: $DAILY_CRON_EXPR （可用 US_FREE_DAILY_CRON 覆盖）"
    echo "   日志: $DAILY_LOG"
  fi
fi

echo ""
echo "环境变量请配置: $PROJECT_ROOT/.env"
echo "  周报推送: FEISHU_WEBHOOK_URL / WEWORK_WEBHOOK_URL（及 send_sensortower_weekly_push.py 所需项）"
echo "  日报与我方产品: SENSORTOWER_API_TOKEN、同上 Webhook；产品维度见 data/appid_us.json"
echo ""
echo "查看当前 crontab: crontab -l"
echo "手动测周报: cd $PROJECT_ROOT && $NODE_PATH $WEEKLY_SCRIPT"
echo "手动测日报: cd $PROJECT_ROOT && $NODE_PATH $DAILY_JS --daily --no-competitors"
