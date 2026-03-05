# 每周自动工作流设置指南

## 📋 概述

本文档说明如何设置每周一早上 10:30 自动执行完整工作流和商店信息爬取。

---

## 🚀 快速设置

### 方法 1：使用自动设置脚本（推荐）

```bash
# 1. 给脚本添加执行权限
chmod +x scripts/setup_cron.sh

# 2. 运行设置脚本
bash scripts/setup_cron.sh
```

脚本会自动：
- 检测 Node.js 路径
- 创建 cron 任务
- 设置每周一早上 10:30 执行

---

### 方法 2：手动设置 cron

```bash
# 1. 打开 crontab 编辑器
crontab -e

# 2. 添加以下行（替换为你的实际路径）
30 10 * * 1 cd /Users/oliver/guru/sensortower && /usr/local/bin/node scripts/weekly_automated_workflow.js >> logs/weekly_workflow.log 2>&1
```

**Cron 表达式说明**：
- `30 10 * * 1` = 每周一（1）早上 10:30（30分 10时）

---

## 📝 工作流脚本说明

### `weekly_automated_workflow.js`

**功能**：
1. 自动计算「本周一」日期
2. 执行完整周报工作流（`workflow_week_rank_changes.js <本周一>`）：榜单 API 用周日、下载/收益用当周周一~周日，库中仍以周一为周标识
3. 执行商店信息爬取和变更检测（`weekly_us_free_top100_storeinfo.js --date <本周一>`）
4. 记录详细日志

**日期约定**：详见 [WEEKLY_WORKFLOW.md](WEEKLY_WORKFLOW.md) 中「日期约定（周一→周日）」一节。

**执行内容**：

```
步骤 1: 完整周报工作流
  ├─ 获取 Top100 榜单
  ├─ 生成榜单异动
  ├─ 获取应用元数据
  ├─ 获取下载/收益数据
  └─ 补全开发者信息

步骤 2: 商店信息爬取和变更检测
  ├─ 爬取 Google Play 商店信息
  ├─ 爬取 App Store 商店信息
  ├─ 检测变更并记录
  └─ 更新商店信息表
```

---

## 📊 日志记录

### 日志位置

- **Cron 输出日志**：`logs/weekly_workflow.log`
- **详细执行日志**：`logs/weekly_workflow_YYYY-MM-DD.log`

### 查看日志

```bash
# 查看最新的 cron 日志
tail -f logs/weekly_workflow.log

# 查看今天的详细日志
cat logs/weekly_workflow_$(date +%Y-%m-%d).log

# 查看最近的日志文件
ls -lt logs/weekly_workflow_*.log | head -5
```

### 日志格式

```
[2026-02-10T10:30:00.000Z] 每周自动工作流开始执行
[2026-02-10T10:30:00.100Z] 本周一日期: 2026-02-09
[2026-02-10T10:30:00.200Z] 开始执行: 完整周报工作流
...
[2026-02-10T10:45:30.500Z] ✓ 完整周报工作流 执行成功
[2026-02-10T10:45:30.600Z] 开始执行: 商店信息爬取和变更检测
...
[2026-02-10T11:00:15.800Z] 每周自动工作流执行完成
[2026-02-10T11:00:15.900Z] 执行时间: 30.25 分钟
[2026-02-10T11:00:16.000Z] 成功: 2/2
```

---

## 🔧 配置说明

### 修改执行时间

编辑 cron 任务：

```bash
crontab -e
```

修改时间表达式：
- `30 10 * * 1` - 每周一早上 10:30
- `0 9 * * 1` - 每周一早上 9:00
- `0 14 * * 1` - 每周一下午 2:00

**Cron 格式**：`分钟 小时 日 月 星期`

### 修改工作流脚本

如果需要修改执行内容，编辑 `scripts/weekly_automated_workflow.js`：

```javascript
// 修改执行的步骤
// 添加或删除步骤
// 修改日期计算逻辑
```

---

## ✅ 验证设置

### 检查 cron 任务

```bash
# 查看当前 cron 任务
crontab -l

# 应该看到类似这样的输出：
# 30 10 * * 1 cd /Users/oliver/guru/sensortower && /usr/local/bin/node scripts/weekly_automated_workflow.js >> logs/weekly_workflow.log 2>&1
```

### 手动测试

```bash
# 手动运行一次，测试是否正常
node scripts/weekly_automated_workflow.js

# 检查日志
tail -20 logs/weekly_workflow_$(date +%Y-%m-%d).log
```

---

## 🐛 故障排除

### 问题 1：Cron 任务没有执行

**检查**：
```bash
# 1. 检查 cron 服务是否运行（macOS）
sudo launchctl list | grep cron

# 2. 检查 cron 日志（macOS）
log show --predicate 'process == "cron"' --last 1h

# 3. 检查脚本路径是否正确
which node
ls -l scripts/weekly_automated_workflow.js
```

**解决**：
- 确保 Node.js 路径正确
- 确保脚本路径是绝对路径
- 检查文件权限：`chmod +x scripts/weekly_automated_workflow.js`

### 问题 2：权限错误

**检查**：
```bash
# 检查日志目录权限
ls -ld logs/

# 检查数据库文件权限
ls -l data/sensortower_top100.db
```

**解决**：
```bash
# 创建日志目录
mkdir -p logs

# 确保有写权限
chmod 755 logs
```

### 问题 3：环境变量未加载

**问题**：Cron 执行时可能无法读取 `.env` 文件

**解决**：在脚本中明确指定环境变量路径，或使用绝对路径

### 问题 4：网络连接问题

**检查**：
- 确保服务器能访问 SensorTower API
- 确保能访问 Google Play 和 App Store
- 检查防火墙设置

---

## 📅 执行时间表

| 时间 | 执行内容 | 预计时长 |
|------|---------|---------|
| 10:30 | 开始执行 | - |
| 10:30-10:45 | 完整周报工作流 | ~15 分钟 |
| 10:45-11:00 | 商店信息爬取 | ~15 分钟 |
| 11:00 | 完成 | - |

**总计**：约 30 分钟

---

## 🔄 手动执行

如果需要手动触发执行：

```bash
# 直接运行脚本
node scripts/weekly_automated_workflow.js

# 或使用 npm 脚本（如果已配置）
npm run weekly-workflow
```

---

## 📋 前置条件检查

脚本会自动检查：

1. ✅ `.env` 文件是否存在
2. ✅ 数据库文件是否存在（不存在会在第一步创建）
3. ✅ Node.js 是否可用
4. ✅ 脚本文件是否存在

如果检查失败，脚本会记录错误并退出。

---

## 🛠️ 高级配置

### 添加邮件通知

修改 `weekly_automated_workflow.js`，添加邮件通知功能：

```javascript
const nodemailer = require('nodemailer');

function sendEmail(subject, body) {
  // 配置邮件发送
  // ...
}
```

### 添加 Slack/钉钉通知

```javascript
function sendSlackNotification(message) {
  // 发送到 Slack
  // ...
}
```

### 添加错误重试

```javascript
function runWithRetry(name, cmd, maxRetries = 3) {
  // 添加重试逻辑
  // ...
}
```

---

## 📚 相关文档

- [完整周报工作流说明](WEEKLY_WORKFLOW.md)
- [商店信息获取指南](GET_GAMESTOREINFO.md)
- [所有脚本功能说明](ALL_SCRIPTS.md)

---

## 💡 最佳实践

1. **定期检查日志**：每周二检查周一的执行日志
2. **监控执行时间**：如果执行时间异常，及时排查
3. **备份数据库**：定期备份数据库文件
4. **测试更新**：修改脚本后先手动测试
5. **保持更新**：定期更新依赖和脚本

---

## 🔗 相关命令

```bash
# 查看 cron 任务
crontab -l

# 编辑 cron 任务
crontab -e

# 删除所有 cron 任务（谨慎使用）
crontab -r

# 查看 cron 执行日志（macOS）
log show --predicate 'process == "cron"' --last 24h

# 测试脚本
node scripts/weekly_automated_workflow.js

# 查看日志
tail -f logs/weekly_workflow.log
```
