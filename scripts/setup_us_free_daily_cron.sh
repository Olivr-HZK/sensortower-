#!/bin/bash
#
# 设置「US 免费榜日总结」每日自动推送（飞书 + 企业微信，拉 API 写库后推送）
#
# 对应命令：node scripts/us_free_appid_weekly_rank_changes.js --daily --no-competitors
# 日期：脚本内按 US_FREE_DAILY_CALENDAR_TZ（默认 Asia/Shanghai 北京时间）计算「相邻两日」日环比。
#
# 环境变量（与手动执行相同）：Node 会读取「项目根目录」.env，不在 crontab 里写 URL。
#   FEISHU_WEBHOOK_URL   飞书机器人 Webhook
#   WEWORK_WEBHOOK_URL   企业微信机器人 Webhook
#   SENSORTOWER_API_TOKEN
#   SENSORTOWER_OVERVIEW_BASE（可选，默认 https://app.sensortower-china.com）
# 更换推送地址：只编辑 $PROJECT_ROOT/.env 中对应行即可。
# 日报日期：默认 Asia/Shanghai（北京时间「昨天 vs 前天」）；若要美区商店日可在 .env 设 US_FREE_DAILY_CALENDAR_TZ=America/Los_Angeles
#
# 用法：
#   bash scripts/setup_us_free_daily_cron.sh
#   YES=1 bash scripts/setup_us_free_daily_cron.sh   # 已存在任务时自动覆盖，无交互
#

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

NODE_PATH=$(command -v node)
if [ -z "$NODE_PATH" ]; then
    echo "错误: 未找到 node，请先安装 Node.js"
    exit 1
fi

DAILY_JS="$PROJECT_ROOT/scripts/us_free_appid_weekly_rank_changes.js"
if [ ! -f "$DAILY_JS" ]; then
    echo "错误: 未找到 $DAILY_JS"
    exit 1
fi

mkdir -p "$PROJECT_ROOT/logs"

# 唯一标识（用于 crontab 去重/替换）
DAILY_MARKER="us_free_appid_weekly_rank_changes.js --daily --no-competitors"

# 默认：每天 10:00 按「本机时区」执行（常见：Mac 在国内则约等于北京时间上午 10 点）
# 如需改时间：编辑本脚本 CRON_EXPR 或 crontab -e
CRON_EXPR="${US_FREE_DAILY_CRON:-0 10 * * *}"

LOG_FILE="$PROJECT_ROOT/logs/us_free_daily.log"
CRON_CMD="cd $PROJECT_ROOT && $NODE_PATH $DAILY_JS --daily --no-competitors >> $LOG_FILE 2>&1"

EXISTING=$(crontab -l 2>/dev/null | grep -F "$DAILY_MARKER" || true)

if [ -n "$EXISTING" ]; then
    echo "⚠️  已存在 US 免费榜日报定时任务："
    echo "$EXISTING"
    echo ""
    if [ "${YES:-}" = "1" ]; then
        REPLY=y
    else
        read -p "是否替换为新的时间与命令？(y/n): " -n 1 -r
        echo ""
    fi
    if [[ ! ${REPLY:-n} =~ ^[Yy]$ ]]; then
        echo "已取消"
        exit 0
    fi
    crontab -l 2>/dev/null | grep -vF "$DAILY_MARKER" | crontab - || true
fi

( crontab -l 2>/dev/null; echo "$CRON_EXPR $CRON_CMD" ) | crontab -

echo "✅ US 免费榜日报 cron 已写入"
echo ""
echo "  调度: $CRON_EXPR （本机时区；可用环境变量 US_FREE_DAILY_CRON 覆盖默认 0 10 * * *）"
echo "  日志: $LOG_FILE"
echo "  环境: 编辑 $PROJECT_ROOT/.env（FEISHU_WEBHOOK_URL、WEWORK_WEBHOOK_URL、SENSORTOWER_API_TOKEN 等）"
echo ""
echo "查看: crontab -l"
echo "手动跑一次: cd $PROJECT_ROOT && $NODE_PATH $DAILY_JS --daily --no-competitors"
