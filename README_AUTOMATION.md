# 每周自动工作流快速设置

## 🚀 一键设置

```bash
# 方法 1：使用自动设置脚本（推荐）
bash scripts/setup_cron.sh

# 方法 2：使用 npm 脚本
npm run setup-cron
```

## 📋 设置后的效果

- ✅ 每周一早上 10:30 自动执行
- ✅ 完整周报工作流（Top100 + 异动 + 元数据 + 销售数据）
- ✅ 商店信息爬取和变更检测
- ✅ 自动记录详细日志

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

查看 [AUTOMATED_WORKFLOW.md](docs/AUTOMATED_WORKFLOW.md) 获取完整说明。
