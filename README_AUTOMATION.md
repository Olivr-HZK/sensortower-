# 每周自动工作流快速设置

## 🚀 一键设置

```bash
# 方法 1：使用自动设置脚本（推荐）
bash scripts/setup_cron.sh

# 方法 2：使用 npm 脚本
npm run setup-cron
```

## 📋 设置后的效果

- ✅ 每周一 **10:30**：`weekly_automated_workflow.js`（Top100 周报 + 推送）
- ✅ 每天 **10:00**：我方产品 US 免费榜日报（`--daily --no-competitors`）
- ✅ 第三条「每日本品 + 竞品」：**不会**由本脚本安装，需另执行 `npm run setup-arrow-madness-daily-cron` 或 `bash scripts/setup_arrow_madness_daily_cron.sh`
- ✅ 详细说明见 [docs/THREE_WORKFLOWS.md](docs/THREE_WORKFLOWS.md)

## 🔍 查看日志

```bash
# 查看最新的执行日志
tail -f logs/weekly_workflow.log

# 查看今天的详细日志
cat logs/weekly_workflow_$(date +%Y-%m-%d).log
```

## 🧪 手动测试

```bash
# 手动运行一次（测试）
npm run weekly-automated

# 或直接运行
node scripts/weekly_automated_workflow.js
```

## 📚 详细文档

- [三条工作流说明](docs/THREE_WORKFLOWS.md)（周 Top100 / 日我方 / 日竞品）
- [自动化与定时任务](docs/AUTOMATED_WORKFLOW.md)
