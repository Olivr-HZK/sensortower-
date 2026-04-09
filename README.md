# SensorTower 周报数据工作流

基于 SensorTower API 与本地 SQLite 的**休闲游戏（Casual）Top100 周报流水线**：抓取榜单、异动、元数据、下载/收益、商店信息（通过 metadata 接口）、并支持 AI 生成 Top5 综述与下架检测。另提供**我方产品**在美国区免费榜下的周环比检测（见下文「我方产品检测」）。

---

## 环境要求

- **Node.js**（主运行环境）
- **sqlite3** 命令行（系统自带或 `brew install sqlite3`）
- **Playwright**（仅商店页爬取步骤需要）：`npx playwright install chromium`
- **Python 3**（可选）：运行 S3 同步、多维表格导出、或根目录实验性 `fetch_top100_to_db.py` 时，执行 `pip install -r requirements.txt`（见 `requirements.txt` 内注释）

---

## 快速开始

### 1. 安装依赖

```bash
npm install
# 若需跑商店页爬取
npx playwright install chromium
# 若需跑 Python 辅助脚本（S3、导出、requests 类脚本）
pip install -r requirements.txt
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
# OPENROUTER_MODEL=qwen/qwen3-32b
# OPENROUTER_FALLBACK_MODEL=qwen/qwen3-30b-a3b
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

### 3. 跑完整周报工作流（推荐）

传入「本周一」日期（YYYY-MM-DD），一次执行 8 步：Top100、异动、Metadata、应用名、下载/收益、Publisher、Top5 综述、US 免费榜 metadata 对比、下架检测。

```bash
node scripts/workflow_week_rank_changes.js 2026-03-02
# 或
npm run workflow-week 2026-03-02
```

### 4. 定时任务（每周一 10:30）

```bash
bash scripts/setup_cron.sh
```

会注册：`weekly_automated_workflow.js`（内部计算本周一 → 跑完整 8 步周报工作流）。

---

## 项目结构

```
sensortower/
├── scripts/                    # 主脚本（Node.js）
│   ├── workflow_week_rank_changes.js   # 8 步周报工作流
│   ├── weekly_automated_workflow.js    # 定时任务入口
│   ├── fetch_top100_to_db.js          # Top100 榜单（Casual）
│   ├── generate_rank_changes_from_db.js
│   ├── fetch_app_metadata_to_db.js
│   ├── update_app_names_from_metadata.js
│   ├── fetch_top100_sales.js           # 下载/收益
│   ├── refill_rank_changes_publisher.js
│   ├── generate_top5_overview.js          # 前五异动综述（最近四周）
│   ├── fetch_us_free_metadata_and_compare.js # US 免费榜商店页 metadata 变更检测
│   ├── detect_removed_games.js            # 下架检测（写库 weekly_removed_games）
│   ├── test_us_free_removed.js            # 下架测试（仅 JSON）
│   ├── test_weekly_workflow_dryrun.js     # 每周工作流 DRYRUN（写入临时 DB）
│   ├── weekly_us_free_top100_storeinfo.js # 旧版商店页爬取（Playwright，可选手动使用）
│   ├── us_free_appid_weekly_rank_changes.js  # 我方产品 US 免费榜周环比 + 飞书
│   ├── fetch_us_free_category_ranking_summary.js
│   ├── fetch_app_ranks_workflow.js
│   ├── copy_arrow_madness_to_us_free_weekly.js
│   ├── setup_cron.sh
│   └── ...
├── arrow_madness_rank_parse.js   # 与 compare_and_summarize / 我方产品周报共用解析
├── compare_and_summarize.js
├── fetch_app_ranks.js
├── data/                       # SQLite 数据库（默认 sensortower_top100.db；DRYRUN: sensortower_top100_dryrun.db）
├── output/                    # CSV、测试 JSON 等
├── logs/                      # 工作流日志
├── docs/                      # 详细文档
├── .env                       # 本地配置（不提交）
├── package.json
└── requirements.txt           # Python 依赖（可选）
```

---

## 工作流步骤概览（8 步，周报主流程）

| 步骤 | 脚本 | 说明 |
|------|------|------|
| 1 | `fetch_top100_to_db.js` | 抓取上周日+本周日 iOS/Android **Casual** Top100，rank_date 存周一 |
| 2 | `generate_rank_changes_from_db.js` | 生成异动表 + `榜单异动.csv` |
| 3 | `fetch_app_metadata_to_db.js` | 拉取 app_metadata |
| 3.5 | `update_app_names_from_metadata.js` | 用 metadata 更新 Top100 应用名 |
| 4 | `fetch_top100_sales.js` | 上一周下载量/收益写入 Top100 与 rank_changes |
| 5 | `refill_rank_changes_publisher.js` | 补全 publisher、store_url |
| 6 | `generate_top5_overview.js` | 最近四周 Top5 异动综述（可选 OpenRouter） |
| 7 | `fetch_us_free_metadata_and_compare.js` | US 免费榜商店页 metadata 快照与两周对比 |
| 8 | `detect_removed_games.js` | 检测上一周榜单中的游戏是否已下架 |

- **榜单品类**：iOS `7003`（Casual），Android `game_casual`。  
- **日期约定**：用户/定时任务只传「本周一」；榜单 API 用周日，库存周一；下载/收益为「上一周」周一～周日；`detect_removed_games.js` 在主工作流中会自动改查「上周一」对应榜单。

---

## 商店页相关流程

### 1. US 免费榜商店页 metadata 变更检测（推荐）

通过 SensorTower `/v1/{os}/apps` metadata 接口，每周对 US 免费榜 Top100 的商店页核心字段做对比：

- 字段范围：`name`、`description`、`subtitle`、`short_description`、`screenshot_urls`
- 表：
  - `weekly_metadata_snapshot`：每周一的 metadata 快照（`rank_date + app_id + os` 为主键）
  - `weekly_metadata_changes`：两周都在榜的 app，若上述字段有变化，则记录 old/new
- 首次运行某周时，仅写入 `weekly_metadata_snapshot`，**不会生成变更记录**；从第二周开始才会产生 `weekly_metadata_changes`。

运行方式：

```bash
# 单独跑一周的 metadata 对比
node scripts/fetch_us_free_metadata_and_compare.js --date 2026-03-02
```

在自动化工作流中，这一步已经包含在 `workflow_week_rank_changes.js` 主流程里。

### 2. 旧版商店页爬取（Playwright）

`weekly_us_free_top100_storeinfo.js` 通过 Playwright 打开 App Store / Google Play 实时页面，解析 subtitle / description / 截图并写入：

- `gamestoreinfo` / `appstoreinfo`
- `gamestoreinfo_changes` / `appstoreinfo_changes`

> 目前自动化工作流默认 **不再调用** 该脚本，如需 HTML 级别的精细字段，可手动执行：
>
> ```bash
> node scripts/weekly_us_free_top100_storeinfo.js --date 2026-03-02
> ```

---

## 我方产品检测（US 免费榜周环比）

针对在 `data/appid_us.json` 中登记的我方 App，按**美国区免费榜**下各品类/分榜维度做**周环比**排名（默认对比「上上周日 → 上周日」），结果写入本地 SQLite `data/us_free_appid_weekly.db`，并可推送飞书。该流程与上文「Casual Top100 周报」**独立并行**，同样需要 `SENSORTOWER_API_TOKEN`。

### 数据与配置

| 文件 / 库 | 说明 |
|-----------|------|
| `data/appid_us.json` | 我方产品清单（含 `apple_app_id`、`google_app_id`、产品编码等）；字段 `us_free_category_ranking_summary` 由步骤 1 回写；可选 `competitors`（`[{ name, apple_app_id?, google_app_id? }]`）与本品共用同一套 summary 榜单维度，仅 app id 不同，飞书内竞品默认折叠展示 |
| `data/us_free_appid_weekly.db` | 周环比排名结果（本地生成，默认不提交） |

### 推荐工作流

1. **刷新 US 免费榜品类摘要**（写入 `appid_us.json`）  
   调用 `GET /v1/{os}/category/category_ranking_summary`，为每个产品记录在美国免费榜下出现的品类与分榜，避免盲查维度。  
   ```bash
   node scripts/fetch_us_free_category_ranking_summary.js
   ```

2. **周环比排名与简报**（写库 + 可选飞书）  
   依据 `us_free_category_ranking_summary` 展开查询维度，用 `category_history` 批量拉取排名（与根目录 `arrow_madness_rank_parse.js` 解析逻辑一致）；若摘要为空则回退为 game / casual / board / card / puzzle 等维度组合；若配置了 `competitors`，则按同一维度拉竞品并与本品一起出简报/飞书。  
   ```bash
   node scripts/us_free_appid_weekly_rank_changes.js [DATE_NEW] [DATE_OLD]
   npm run us-free-weekly
   ```  
   不传日期时，`DATE_NEW` 为「最近一个周日」、`DATE_OLD` 为其前一周同日。  
   其它用法：`--no-feishu` 不写飞书；`--feishu-only` 仅用库内已有数据重推飞书；`--verify-urls` 校验概览链接。  
   环境变量：`SENSORTOWER_API_TOKEN`（必填）；`FEISHU_WEBHOOK_URL`（推送时）；`SENSORTOWER_OVERVIEW_BASE`（默认中国区概览域名）；`ST_CHINA_OVERVIEW_PARENT_ID`（可选，概览 URL 中的 project）；`FEISHU_RANK_DETAIL_EXPANDED=1`（可选，排名明细折叠块默认展开）。遇 API 频率限制（如 11232）脚本会退避重试。

3. **（可选）仅重发飞书**  
   ```bash
   npm run us-free-weekly-feishu
   # 或 node scripts/us_free_appid_weekly_rank_changes.js --feishu-only [DATE_NEW] [DATE_OLD]
   ```

4. **（可选）导出 US Casual 免费榜历史 CSV**  
   对 `appid_us.json` 中全部产品拉取 US + Casual + 免费榜区间历史，输出 `output/app_ranks_us_casual.csv`。  
   ```bash
   node scripts/fetch_app_ranks_workflow.js 2026-03-22
   ```

5. **Arrow Madness 单产品管线（与历史脚本兼容）**  
   根目录 `fetch_app_ranks.js`、`compare_and_summarize.js` 面向单游戏 `arrow_madness.db`；若需把该结果并入「我方产品」周报库（与 `appid_us.json` 中 G-058 / internal_name Arrow2 对齐），可执行：  
   ```bash
   npm run copy-arrow2-us-free
   ```

---

## 常用命令

```bash
# 仅抓指定周 Top100
node scripts/fetch_top100_to_db.js 2026-03-02

# 仅生成异动
node scripts/generate_rank_changes_from_db.js

# 仅跑下架检测（参数代表要检测的那一周周一）
node scripts/detect_removed_games.js 2026-02-23

# 测试美国免费榜下架（不写库，输出 JSON）
node scripts/test_us_free_removed.js

# DRYRUN：在临时数据库上完整跑一遍每周工作流（不影响正式库）
node scripts/test_weekly_workflow_dryrun.js 2026-03-02

# 我方产品 US 免费榜：先刷新 appid_us.json 摘要，再跑周环比（详见「我方产品检测」）
node scripts/fetch_us_free_category_ranking_summary.js
npm run us-free-weekly
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
