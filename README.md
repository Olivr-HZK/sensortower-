# SensorTower 周报数据工作流

基于 SensorTower API 与本地 SQLite 的**休闲游戏（Casual）Top100 周报流水线**：抓取榜单、异动、元数据、下载/收益、商店信息，并支持 AI 生成前五异动描述与下架检测。

---

## 环境要求

- **Node.js**（主运行环境）
- **sqlite3** 命令行（系统自带或 `brew install sqlite3`）
- **Playwright**（仅商店页爬取步骤需要）：`npx playwright install chromium`
- **Python 3**（可选）：用于 S3 同步、导出等脚本时需安装 `requirements.txt` 依赖

---

## 快速开始

### 1. 安装依赖

```bash
npm install
# 若需跑商店页爬取
npx playwright install chromium
```

### 2. 配置环境变量

在项目根目录创建 `.env`（勿提交到 Git），例如：

```bash
# 必填：SensorTower API
SENSORTOWER_API_TOKEN=你的token

# 可选：数据库路径（默认 data/sensortower_top100.db）
# SENSORTOWER_DB_FILE=data/sensortower_top100.db

# 可选：AI 前五异动描述 / 综述（OpenRouter 中转）
# OPENROUTER_API_KEY=sk-or-v1-...
# OPENROUTER_MODEL=google/gemini-3-pro-preview
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

### 3. 跑完整周报工作流（推荐）

传入「本周一」日期（YYYY-MM-DD），一次执行 7 步：Top100、异动、Metadata、应用名、下载/收益、Publisher、前五描述、Top5 综述。

```bash
node scripts/workflow_week_rank_changes.js 2026-03-02
# 或
npm run workflow-week 2026-03-02
```

### 4. 定时任务（每周一 10:30）

```bash
bash scripts/setup_cron.sh
```

会注册：`weekly_automated_workflow.js`（内部计算本周一 → 跑上述工作流 + US 免费榜商店信息爬取）。

---

## 项目结构

```
sensortower/
├── scripts/                    # 主脚本（Node.js）
│   ├── workflow_week_rank_changes.js   # 7 步周报工作流
│   ├── weekly_automated_workflow.js    # 定时任务入口
│   ├── fetch_top100_to_db.js          # Top100 榜单（Casual）
│   ├── generate_rank_changes_from_db.js
│   ├── fetch_app_metadata_to_db.js
│   ├── update_app_names_from_metadata.js
│   ├── fetch_top100_sales.js           # 下载/收益
│   ├── refill_rank_changes_publisher.js
│   ├── generate_weekly_top5_comments.js # 前五一句话描述
│   ├── generate_top5_overview.js       # 前五异动综述
│   ├── detect_removed_games.js         # 下架检测（写库）
│   ├── test_us_free_removed.js         # 下架测试（仅 JSON）
│   ├── weekly_us_free_top100_storeinfo.js
│   ├── setup_cron.sh
│   └── ...
├── data/                       # SQLite 数据库（默认 sensortower_top100.db）
├── output/                    # CSV、测试 JSON 等
├── logs/                      # 工作流日志
├── docs/                      # 详细文档
├── .env                       # 本地配置（不提交）
├── package.json
└── requirements.txt           # Python 依赖（可选）
```

---

## 工作流步骤概览（7 步）

| 步骤 | 脚本 | 说明 |
|------|------|------|
| 1 | `fetch_top100_to_db.js` | 抓取上周日+本周日 iOS/Android **Casual** Top100，rank_date 存周一 |
| 2 | `generate_rank_changes_from_db.js` | 生成异动表 + `榜单异动.csv` |
| 3 | `fetch_app_metadata_to_db.js` | 拉取 app_metadata |
| 3.5 | `update_app_names_from_metadata.js` | 用 metadata 更新 Top100 应用名 |
| 4 | `fetch_top100_sales.js` | 上一周下载量/收益写入 Top100 与 rank_changes |
| 5 | `refill_rank_changes_publisher.js` | 补全 publisher、store_url |
| 6 | `generate_weekly_top5_comments.js` | 各榜单前五一句话异动（可选 OpenRouter） |
| 7 | `generate_top5_overview.js` | 最近四周 Top5 异动综述（可选 OpenRouter） |

- **榜单品类**：iOS `7003`（Casual），Android `game_casual`。  
- **日期约定**：用户/定时任务只传「本周一」；榜单 API 用周日，库存周一；下载/收益为「上一周」周一～周日。

---

## 常用命令

```bash
# 仅抓指定周 Top100
node scripts/fetch_top100_to_db.js 2026-03-02

# 仅生成异动
node scripts/generate_rank_changes_from_db.js

# 仅跑下架检测（写 weekly_removed_games 表）
node scripts/detect_removed_games.js 2026-03-02

# 测试美国免费榜下架（不写库，输出 JSON）
node scripts/test_us_free_removed.js
```

---

## 文档

- [周报工作流详解](docs/WEEKLY_WORKFLOW.md)
- [自动化与定时任务](docs/AUTOMATED_WORKFLOW.md)
- [使用指南（Top100 / 异动）](docs/USAGE_GUIDE.md)
- [数据库表说明](docs/DATABASE_TABLES.md)
- [API 文档](docs/API_DOCUMENTATION.md)

---

## 注意事项

- `.env`、`data/*.db`、`logs/*.log`、`output/*.csv` 等已加入 `.gitignore`，不会提交。
- 定时任务在 cron 下 PATH 较简，脚本内已用 `process.execPath` 与固定 PATH 前缀，若仍报 `node`/`sqlite3` 找不到，可在 crontab 中写清 node 绝对路径。

---

## 许可证

仅供学习与研究使用。
