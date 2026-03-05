#!/bin/bash
#
# 设置每周一早上 10:30 自动执行工作流的 cron 任务
#
# 工作流逻辑：执行 weekly_automated_workflow.js → 计算「本周一」→ 跑完整周报工作流（榜单用周日、下载/收益用当周周一~周日）+ 商店信息爬取。
# 详见 scripts/weekly_automated_workflow.js 顶部注释及 docs/WEEKLY_WORKFLOW.md。
#
# 使用方法：
#   bash scripts/setup_cron.sh
#

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Node.js 路径（自动检测）
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "错误: 未找到 node 命令，请确保 Node.js 已安装并在 PATH 中"
    exit 1
fi

# 脚本路径
WORKFLOW_SCRIPT="$PROJECT_ROOT/scripts/weekly_automated_workflow.js"

# 检查脚本是否存在
if [ ! -f "$WORKFLOW_SCRIPT" ]; then
    echo "错误: 未找到工作流脚本: $WORKFLOW_SCRIPT"
    exit 1
fi

# Cron 表达式：每周一早上 10:30
# 格式：分钟 小时 日 月 星期
CRON_EXPR="30 10 * * 1"

# Cron 任务命令
CRON_CMD="cd $PROJECT_ROOT && $NODE_PATH $WORKFLOW_SCRIPT >> logs/weekly_workflow.log 2>&1"

# 检查是否已存在相同的 cron 任务
EXISTING_CRON=$(crontab -l 2>/dev/null | grep -F "$WORKFLOW_SCRIPT")

if [ -n "$EXISTING_CRON" ]; then
    echo "⚠️  检测到已存在的 cron 任务："
    echo "$EXISTING_CRON"
    echo ""
    read -p "是否要替换现有任务？(y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消"
        exit 0
    fi
    # 删除旧任务
    crontab -l 2>/dev/null | grep -v "$WORKFLOW_SCRIPT" | crontab -
fi

# 添加新的 cron 任务
(crontab -l 2>/dev/null; echo "$CRON_EXPR $CRON_CMD") | crontab -

echo "✅ Cron 任务已设置成功！"
echo ""
echo "任务详情："
echo "  时间: 每周一早上 10:30"
echo "  命令: $CRON_CMD"
echo ""
echo "查看当前 cron 任务："
echo "  crontab -l"
echo ""
echo "删除 cron 任务："
echo "  crontab -e"
echo "  # 然后删除包含 weekly_automated_workflow.js 的行"
echo ""
echo "查看日志："
echo "  tail -f $PROJECT_ROOT/logs/weekly_workflow.log"
