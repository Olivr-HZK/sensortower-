# 三条定时工作流说明

本仓库与 SensorTower 相关的**三条独立管线**：每周 Top100 大盘周报、每日我方产品 US 免费榜（游戏总榜）、每日指定产品 + 竞品对比。配置入口均为项目根目录 `.env`；定时任务从项目根执行 `node`，以便加载 `.env`（或由脚本自行读入）。

| 工作流 | 入口脚本 | 默认数据库 | 典型调度 |
|--------|-----------|------------|----------|
| ① 每周 Top100 周报 | `scripts/weekly_automated_workflow.js` | `data/sensortower_top100.db` | 每周一 10:30 |
| ② 每日我方产品总榜 | `scripts/us_free_appid_weekly_rank_changes.js --daily --no-competitors` | `data/us_free_appid_weekly.db` | 每天 10:00 |
| ③ 每日本品 + 竞品 | `scripts/arrow_madness_daily_competitors.js` | `data/us_free_appid_weekly.db`（与 ② 同库） | 每天 10:05 |

更细的步骤拆解见 [WEEKLY_WORKFLOW.md](WEEKLY_WORKFLOW.md)、[AUTOMATED_WORKFLOW.md](AUTOMATED_WORKFLOW.md)（周报部分）。

---

## ① 每周 Top100 周报

### 用途

以 **Puzzle 等品类、多国的 iOS/Android Top100** 为核心：拉榜、异动、元数据、下载与收益、Top5 综述、商店页变更与下架检测等，最后通过 **飞书 / 企业微信** 推送 Markdown 周报。

日期约定：**统一以「本周一」标识该周**；榜单 API 使用周日数据、库内 `rank_date` 存周一等，详见 [WEEKLY_WORKFLOW.md](WEEKLY_WORKFLOW.md)「日期约定」。

### 入口与内部步骤

- **入口**：`node scripts/weekly_automated_workflow.js`（`package.json` 中 `npm run weekly-automated`）
- **步骤 1**：`workflow_week_rank_changes.js <本周一>`（脚本内自动算本周一，无需改 cron）
- **步骤 2**：`send_sensortower_weekly_push.py --date <本周一>`（飞书/企微）
- **跳过推送**（只跑库内流程）：环境变量 `SKIP_SENSORTOWER_WEEKLY_PUSH=1`
- **Python 路径**：可用 `SENSORTOWER_WEEKLY_PUSH_PYTHON` 或 `PYTHON` 指定

### 环境与数据

- **必需**：`.env` 中 `SENSORTOWER_API_TOKEN`；周报推送需 `FEISHU_WEBHOOK_URL` / `WEWORK_WEBHOOK_URL` 等（以 `send_sensortower_weekly_push.py` 为准）
- **数据库**：默认 `data/sensortower_top100.db`，可用 `SENSORTOWER_DB_FILE` 覆盖

### 手动执行

```bash
cd /path/to/sensortower
node scripts/weekly_automated_workflow.js
```

### 定时任务设置

**推荐**：周任务与「每日我方产品」可一并安装：

```bash
bash scripts/setup_cron.sh
```

- 默认 **每周一 10:30**：`30 10 * * 1`
- 覆盖调度：`SENSORTOWER_WEEKLY_CRON="30 9 * * 1" bash scripts/setup_cron.sh`
- 仅写入周任务：`bash scripts/setup_cron.sh --weekly-only`
- 日志：`logs/weekly_workflow.log`；按日详细日志：`logs/weekly_workflow_YYYY-MM-DD.log`

**手动 crontab 示例**（路径换成本机 `node`）：

```cron
30 10 * * 1 cd /path/to/sensortower && /usr/local/bin/node scripts/weekly_automated_workflow.js >> logs/weekly_workflow.log 2>&1
```

---

## ② 每日我方产品 US 免费榜（总榜，不含竞品）

### 用途

按 `data/appid_us.json` 配置，拉 **US 区、我方产品** 在 **iOS（iPhone）与 Android 游戏总榜** 免费维度的排名，写入 SQLite，并推送 **日环比**（昨天 vs 前天，日历由时区决定）。  
使用 `--daily --no-competitors` 时 **不包含竞品**，且维度收敛为上述总榜（无 summary 时也不会再五类全拉）。

### 入口

```bash
node scripts/us_free_appid_weekly_rank_changes.js --daily --no-competitors
```

常用别名：`npm run us-free-daily`；仅飞书：`npm run us-free-daily-feishu`；仅企微：`npm run us-free-daily-wework`。

### 环境与数据

- **必需**：`SENSORTOWER_API_TOKEN`；推送：`FEISHU_WEBHOOK_URL`、`WEWORK_WEBHOOK_URL`（可选其一或组合，视参数而定）
- **日环比日期**：`US_FREE_DAILY_CALENDAR_TZ`（默认 `Asia/Shanghai`；若与美区日历对齐可改为 `America/Los_Angeles`）。
- **数据库**：`data/us_free_appid_weekly.db`
- **产品维度**：`data/appid_us.json`

### 其它常用参数（节选）

- `--no-feishu` / `--no-wework`：跳过对应渠道
- `--feishu-only` / `--wework-only`：只发一个渠道

### 定时任务设置

与 **①** 相同脚本 `setup_cron.sh` 会写入「每日我方」一条：

```bash
bash scripts/setup_cron.sh
```

- 默认 **每天 10:00**：`0 10 * * *`
- 覆盖：`US_FREE_DAILY_CRON="0 9 * * *" bash scripts/setup_cron.sh`
- 仅安装每日我方：`bash scripts/setup_cron.sh --daily-only`（或 `bash scripts/setup_us_free_daily_cron.sh`，等价）
- 日志：`logs/us_free_daily.log`

**手动 crontab 示例**：

```cron
0 10 * * * cd /path/to/sensortower && /usr/local/bin/node scripts/us_free_appid_weekly_rank_changes.js --daily --no-competitors >> logs/us_free_daily.log 2>&1
```

---

## ③ 每日指定产品 + 竞品对比

### 用途

独立管线：针对 **一条** `appid_us.json` 中的产品（默认 `internal_name=Arrow2`），在 **iPhone / iPad / Android × Games、Casual、Puzzle（免费榜）** 等维度上拉取本品与 **competitors** 的排名，写入库，并可推送飞书（可用 `--no-feishu` 关闭）。  
**日期**与 ② 一致：默认 **昨天 vs 前天**，由 `US_FREE_DAILY_CALENDAR_TZ` 决定「今天」的日历日。

### 入口

```bash
node scripts/arrow_madness_daily_competitors.js
```

常用：`npm run arrow-madness-daily-competitors`；不发飞书：`npm run arrow-madness-daily-competitors-no-feishu`。

指定产品示例：

```bash
node scripts/arrow_madness_daily_competitors.js --internal-name Arrow2
node scripts/arrow_madness_daily_competitors.js --product G-058
APPID_US_COMPETITORS_INTERNAL_NAME=WaterSort node scripts/arrow_madness_daily_competitors.js
```

### 环境与数据

- **必需**：`SENSORTOWER_API_TOKEN`；飞书：`FEISHU_WEBHOOK_URL`（若未使用 `--no-feishu`）
- **默认产品**：`APPID_US_COMPETITORS_INTERNAL_NAME`（默认 Arrow2），或命令行 `--internal-name` / `--product`
- **数据库**：默认 `data/us_free_appid_weekly.db`（与 US 免费榜日报/周报同库；`app_ranks` 列与周报一致），可用 `APPID_US_COMPETITORS_DB` 覆盖。若曾使用旧库 `data/appid_us_competitors_daily.db`，可执行 `npm run migrate-competitors-to-us-free` 一次性迁入
- **配置**：`data/appid_us.json`

### 定时任务设置

**单独安装**（与 `setup_cron.sh` 无关，需额外执行一次）：

```bash
bash scripts/setup_arrow_madness_daily_cron.sh
```

- 默认 **每天 10:05**：`5 10 * * *`
- 覆盖：`ARROW_MADNESS_DAILY_CRON="10 10 * * *" bash scripts/setup_arrow_madness_daily_cron.sh`
- 非交互全替换：`YES=1 bash scripts/setup_arrow_madness_daily_cron.sh`
- 日志：`logs/arrow_madness_daily_competitors.log`

**手动 crontab 示例**：

```cron
5 10 * * * cd /path/to/sensortower && /usr/local/bin/node scripts/arrow_madness_daily_competitors.js >> logs/arrow_madness_daily_competitors.log 2>&1
```

---

## 一次性装好三条定时任务

1. 配置好项目根 `.env`（`SENSORTOWER_API_TOKEN`、各 Webhook 等）。
2. 执行：

```bash
bash scripts/setup_cron.sh          # ① 每周 + ② 每日我方
bash scripts/setup_arrow_madness_daily_cron.sh   # ③ 每日本品+竞品
```

3. 核对：`crontab -l`。

**注意**：② 与 ③ 若在同一台机器、时刻接近，会并行打 SensorTower API；若遇频率限制，可适当错开 `US_FREE_DAILY_CRON` 与 `ARROW_MADNESS_DAILY_CRON`（仓库默认已错开 10:00 / 10:05）。

---

## `package.json` 相关 npm 脚本（速查）

| 命令 | 含义 |
|------|------|
| `npm run weekly-automated` | ① 每周 Top100 周报入口 |
| `npm run setup-cron` | 安装 ① + ② 的 crontab |
| `npm run setup-us-free-daily-cron` | 仅安装 ②（等同 `setup_cron.sh --daily-only`） |
| `npm run setup-arrow-madness-daily-cron` | 仅安装 ③ 的 crontab |
| `npm run us-free-daily` | ② 手动跑一日（含推送） |
| `npm run arrow-madness-daily-competitors` | ③ 手动跑一日（含推送） |
| `npm run migrate-competitors-to-us-free` | 历史数据：从旧库 `appid_us_competitors_daily.db` 迁入 `us_free_appid_weekly.db`（可重复执行） |
