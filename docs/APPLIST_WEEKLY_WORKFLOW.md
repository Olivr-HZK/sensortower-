# App 列表周报工作流（无 Top100）

本工作流**不依赖 Top100 榜单**，从自定义的 app 列表文件读取 app_id，拉取这些 app 的 **metadata** 以及**上周、上上周**的 **revenue** 和 **downloads**，写入同一数据库，便于每周一自动跑数。

---

## 1. 准备 app 列表

在 `data/appid_list.json` 中维护要跟踪的 app，格式为 JSON 数组，每项包含 `app_id` 与 `platform`：

```json
[
  { "app_id": "284882215", "platform": "ios" },
  { "app_id": "com.example.game", "platform": "android" }
]
```

- **iOS**：`app_id` 为数字 ID（如 App Store 的 id）。
- **Android**：`app_id` 为包名（package name）。

可把 `data/appid_list.json` 换成自己的路径，并在下面命令中传入该路径。

---

## 2. 工作流脚本

**主入口**：`scripts/workflow_applist_weekly.js`

会按顺序执行：

1. **fetch_applist_metadata_to_db.js**  
   从 app 列表拉取 metadata，写入 `app_metadata` 表（与 Top100 工作流共用同一张表）。
2. **fetch_applist_sales_to_db.js**  
   拉取「上周」「上上周」的 downloads/revenue，写入 `app_list_weekly_sales` 表。

### 日期含义（以「本周一」为基准）

- **上周**：上周一 ~ 上周日（本周一 -7 天 至 本周一 -1 天）
- **上上周**：上上周一 ~ 上上周日（本周一 -14 天 至 本周一 -8 天）

### 用法

```bash
# 使用默认 data/appid_list.json，本周一 = 今天所在周的周一
node scripts/workflow_applist_weekly.js

# 指定「本周一」日期
node scripts/workflow_applist_weekly.js 2026-02-24

# 指定列表文件 + 本周一
node scripts/workflow_applist_weekly.js /path/to/appid_list.json 2026-02-24
```

依赖：

- 项目根目录 `.env` 中配置 `SENSORTOWER_API_TOKEN`
- 数据库路径：默认 `data/sensortower_top100.db`，可通过环境变量 `SENSORTOWER_DB_FILE` 覆盖

---

## 3. 数据库表

### app_metadata（已有）

与 Top100 工作流共用。字段包含 `app_id`、`os`、`name`、`publisher_name`、`url` 等，由 metadata 接口写入。

### app_list_weekly_sales（本工作流新增）

| 字段        | 说明 |
|-------------|------|
| app_id      | 应用 ID |
| platform    | ios / android |
| country     | 国家码（US, JP, GB, DE, IN） |
| week_start  | 当周周一日期 YYYY-MM-DD |
| downloads   | 当周下载量 |
| revenue     | 当周收益 |

主键：`(app_id, platform, country, week_start)`。  
每次运行会覆盖对应 `week_start` 的数据（上周、上上周各一条/国家）。

---

## 4. 每周一自动执行（Cron）

在服务器上保留此工作流，并希望**每周一**自动执行时，可加一条 cron，例如（按需改路径和时间）：

```bash
# 每周一 10:35 执行
35 10 * * 1 cd /path/to/sensortower && node scripts/workflow_applist_weekly.js >> logs/applist_weekly.log 2>&1
```

确保：

- `logs/` 目录存在（或改为已有日志目录）
- 若使用虚拟环境，在 `cd` 后先 `source venv/bin/activate` 再执行 `node`（本工作流为 Node，一般不需要 Python 虚拟环境）

可与现有「Top100 + 周报」的周一任务错开几分钟，避免同时打 API。

---

## 5. 单独跑某一步（可选）

```bash
# 只拉取列表内 app 的 metadata
node scripts/fetch_applist_metadata_to_db.js
node scripts/fetch_applist_metadata_to_db.js /path/to/appid_list.json

# 只拉取上周、上上周 revenue/download（默认用「今天所在周周一」）
node scripts/fetch_applist_sales_to_db.js
node scripts/fetch_applist_sales_to_db.js 2026-02-24
node scripts/fetch_applist_sales_to_db.js /path/to/appid_list.json 2026-02-24
```

---

## 6. 与 Top100 工作流的区别

| 项目       | Top100 工作流                     | App 列表周报工作流           |
|------------|-----------------------------------|------------------------------|
| 数据来源   | 榜单 API（Top100）                | 本地 `appid_list.json`       |
| 是否抓榜   | 是                                | 否                           |
| Metadata   | 写入 `app_metadata`               | 同上                         |
| 销量数据   | 写 `apple_top100`/`android_top100`、`rank_changes` | 写 `app_list_weekly_sales`   |
| 周数       | 与榜单周一致                      | 固定「上周 + 上上周」        |

两个工作流可并存，共用 `app_metadata` 和同一数据库文件。
