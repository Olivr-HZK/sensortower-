# 第4步和第5步使用指南

## 📊 第4步：拉取异动应用的下载/收益数据

### 功能说明
从 `rank_changes` 表中读取异动的 `app_id`，调用 SensorTower API 获取当周的下载量和收益数据，然后写回 `rank_changes` 表的 `downloads` 和 `revenue` 字段。

### 使用方法

```bash
# 方式1：指定本周一的日期（推荐）
node scripts/fetch_rank_changes_sales.js 2026-02-09

# 方式2：不传参数（自动使用 rank_changes 表中第一条记录的日期）
node scripts/fetch_rank_changes_sales.js
```

### 工作原理
1. 从 `rank_changes` 表读取异动应用的 `app_id`、`platform`、`country`
2. 按平台（iOS/Android）分批调用 `/v1/{ios|android}/sales_report_estimates` API
3. 获取指定周（本周一到本周日）的下载量和收益数据
4. 更新 `rank_changes` 表的 `downloads` 和 `revenue` 字段

### 参数说明
- **日期参数**（可选）：格式 `YYYY-MM-DD`，作为 `end_date`（本周日）
- **start_date**：自动计算为 `end_date - 7` 天（本周一）
- **批次大小**：每批请求 100 个 `app_id`
- **延迟**：批次之间延迟 400ms，避免 API 限流

### 输出结果
- 更新 `rank_changes` 表的 `downloads`（下载量）和 `revenue`（收益）字段
- 控制台显示更新的记录数

### 注意事项
- 需要先运行第2步（`generate_rank_changes_from_db.js`）生成异动数据
- 如果 `rank_changes` 表为空，脚本会报错退出
- API 调用可能需要一些时间，取决于异动应用的数量

---

## 🔧 第5步：补全开发者信息和商店链接

### 功能说明
为 `rank_changes` 表补全「开发者/公司」（`publisher_name`）和「商店链接」（`store_url`）字段。不会覆盖已有的异动数据。

### 使用方法

```bash
# 直接运行，无需参数
node scripts/refill_rank_changes_publisher.js
```

### 工作原理
1. 从 `app_metadata` 表读取 `(app_id, os)` 对应的 `publisher_name` 和 `url`
2. 遍历 `rank_changes` 表中的所有记录
3. 根据 `app_id` 和 `platform` 匹配 `app_metadata` 中的数据
4. 如果 `app_metadata` 中没有，则根据 `app_id` 和 `platform` 生成商店链接
5. 更新 `rank_changes` 表的 `publisher_name` 和 `store_url` 字段

### 数据来源
- **publisher_name**：从 `app_metadata` 表获取（需要先运行第3步）
- **store_url**：
  - 优先从 `app_metadata` 表获取
  - 如果没有，则根据 `app_id` 和 `platform` 自动生成：
    - iOS: `https://apps.apple.com/app/id{app_id}`
    - Android: `https://play.google.com/store/apps/details?id={app_id}`

### 输出结果
- 更新 `rank_changes` 表的 `publisher_name` 和 `store_url` 字段
- 控制台显示：
  - `publisher_name` 有值的记录数
  - `publisher_name` 无匹配的记录数
  - `store_url` 已全部填充

### 注意事项
- **前置条件**：建议先运行第3步（`fetch_app_metadata_to_db.js`）获取应用元数据
- 如果没有运行第3步，`publisher_name` 可能为空，但 `store_url` 仍会自动生成
- 不会覆盖 `rank_changes` 表中已有的其他数据

### Google Sheets 使用技巧
脚本运行后，在 Google Sheets 中导入数据时，可以添加一列使用公式：
```
=HYPERLINK(K2,B2)
```
- `K2` = 商店链接列
- `B2` = 应用名称列

这样可以得到可点击的应用名称，直接跳转到应用商店。

---

## 🔄 完整工作流示例

如果你想一次性完成所有步骤，可以使用完整工作流：

```bash
# 一条命令完成所有5步
node scripts/workflow_week_rank_changes.js 2026-02-09
```

这会按顺序执行：
1. 抓取 Top100 榜单
2. 生成榜单异动
3. 拉取 App Metadata
4. 拉取下载/收益数据 ⭐
5. 补全开发者信息和商店链接 ⭐

---

## 📋 当前数据状态检查

### 检查下载/收益数据是否已填充
```bash
sqlite3 data/sensortower_top100.db "SELECT COUNT(*) FROM rank_changes WHERE rank_date_current = '2026-02-09' AND (downloads IS NULL OR revenue IS NULL);"
```

### 检查开发者信息是否已填充
```bash
sqlite3 data/sensortower_top100.db "SELECT COUNT(*) FROM rank_changes WHERE rank_date_current = '2026-02-09' AND (publisher_name IS NULL OR publisher_name = '');"
```

---

## 🚀 快速开始

### 只运行第4步和第5步

```bash
# 1. 拉取下载/收益数据
node scripts/fetch_rank_changes_sales.js 2026-02-09

# 2. 补全开发者信息和商店链接
node scripts/refill_rank_changes_publisher.js
```

### 使用 npm 脚本（如果已配置）

```bash
npm run fetch-sales 2026-02-09
# 然后手动运行第5步（目前 package.json 中没有配置）
node scripts/refill_rank_changes_publisher.js
```
