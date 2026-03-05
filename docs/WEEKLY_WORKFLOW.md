# 完整周报工作流脚本说明

## 📊 工作流概述

`workflow_week_rank_changes.js` 是完整周报工作流的主脚本，它会按顺序执行 **6 个步骤**，完成从榜单获取到数据补全的全部流程。

---

## 📅 日期约定（周一→周日）

所有脚本**统一以「本周一」作为该周的标识**（用户/定时任务只传周一日期），内部对 API 的用法如下：

| 用途 | 用户/工作流传入 | API 实际使用 | 库中存储 |
|------|------------------|--------------|----------|
| 榜单 | 本周一（及上周一） | 请求**周日**的榜单（周一 - 1 天） | `rank_date` = **周一** |
| 下载/收益 | 本周一 | `end_date` = 周日，`start_date` = 当周周一（共 7 天 Mon~Sun） | `rank_date_current` = **周一** |

- **定时任务**：每周一 10:30 执行 `weekly_automated_workflow.js`，脚本内计算「本周一」并传给工作流，无需改 cron 表达式。
- **数据库**：默认 `data/sensortower_top100.db`，可通过环境变量 `SENSORTOWER_DB_FILE` 覆盖。

---

## 🔄 工作流步骤详解

### 主脚本
**`workflow_week_rank_changes.js`** - 工作流编排脚本

**功能**：按顺序调用以下 6 个脚本，完成完整的数据获取和处理流程（已优化：应用名称从 app_metadata 更新）

**使用方法**：
```bash
node scripts/workflow_week_rank_changes.js 2026-02-09
```

---

### 步骤 1：获取 Top100 榜单数据

**脚本**：`fetch_top100_to_db.js`

**功能**：
- 传入「本周一」时：API 拉取**上周日、本周日**的 iOS/Android Top100 榜单，库中 `rank_date` 存**上周一、本周一**
- 覆盖 Puzzle 品类（iOS: 7012, Android: game_puzzle）、5 国（US, JP, GB, DE, IN）、免费榜 + 畅销榜
- 应用名称从 app_metadata 更新（本步不拉名称）

**执行命令**：
```bash
node fetch_top100_to_db.js 2026-02-09
```

**输出**：
- `apple_top100` 表：iOS Top100 榜单数据（app_name 字段先设置为 app_id）
- `android_top100` 表：Android Top100 榜单数据（app_name 字段先设置为 app_id）

**依赖**：
- `.env` 中配置 `SENSORTOWER_API_TOKEN`
- 系统安装 `sqlite3` 命令行工具

---

### 步骤 2：生成榜单异动

**脚本**：`generate_rank_changes_from_db.js`

**功能**：
- 比对本周一和上周一的排名变化
- 识别异动类型：
  - 🆕 新进榜单
  - 🚀 排名飙升（上升≥20位）
  - 📈 排名上升（上升≥10位）
  - 📉 排名下跌（下跌≥20位）
- 生成异动榜单

**执行命令**：
```bash
node generate_rank_changes_from_db.js 2026-02-09
```

**输出**：
- `rank_changes` 表：异动数据（包含应用名称、排名变化等）
- `output/榜单异动.csv`：CSV 格式的异动榜单

**依赖**：
- 需要先有步骤 1 的数据（`apple_top100` / `android_top100` 表）

---

### 步骤 3：获取应用元数据

**脚本**：`fetch_app_metadata_to_db.js`

**功能**：
- 从 `apple_top100` / `android_top100` 表读取所有 `app_id`
- 调用 SensorTower API 获取应用元数据
- 批量获取（每批 100 个）
- 已存在的记录不会重复请求
- **包含应用名称**：`name` 字段包含应用名称

**执行命令**：
```bash
node fetch_app_metadata_to_db.js
```

**输出**：
- `app_metadata` 表：应用元数据（包含应用名称、开发者名称、商店链接等）

---

### 步骤 3.5：从元数据更新应用名称 ⭐ 新增

**脚本**：`update_app_names_from_metadata.js`

**功能**：
- 从 `app_metadata` 表读取 `name` 字段（应用名称）
- 更新 `apple_top100` / `android_top100` 表的 `app_name` 字段
- 更新 `app_name_cache` 表

**执行命令**：
```bash
node update_app_names_from_metadata.js
```

**输出**：
- 更新 `apple_top100` / `android_top100` 表的 `app_name` 字段
- 更新 `app_name_cache` 表

**优势**：
- ✅ 无需 API 调用（从数据库读取）
- ✅ 数据一致性（统一来自 app_metadata）
- ✅ 减少网络请求

**依赖**：
- 需要先有步骤 1 的数据（`apple_top100` / `android_top100` 表）
- `.env` 中配置 `SENSORTOWER_API_TOKEN`

---

### 步骤 4：获取下载/收益数据

**脚本**：`fetch_rank_changes_sales.js`

**功能**：
- 传入「本周一」时：API 区间为**当周周一 ~ 周日**（共 7 天），拉取异动应用的下载量/收益
- 从 `rank_changes` 表读取异动 `app_id`，按平台分批请求，写回 `downloads`、`revenue`

**执行命令**：
```bash
node fetch_rank_changes_sales.js 2026-02-09
```

**输出**：
- 更新 `rank_changes` 表的 `downloads`（下载量）和 `revenue`（收益）字段

**依赖**：
- 需要先有步骤 2 的数据（`rank_changes` 表）
- `.env` 中配置 `SENSORTOWER_API_TOKEN`

---

### 步骤 5：补全开发者信息和商店链接

**脚本**：`refill_rank_changes_publisher.js`

**功能**：
- 从 `app_metadata` 表读取开发者名称（`publisher_name`）
- 生成或补全商店链接（`store_url`）
- 更新 `rank_changes` 表的这两个字段

**执行命令**：
```bash
node refill_rank_changes_publisher.js
```

**输出**：
- 更新 `rank_changes` 表的 `publisher_name`（开发者/公司）和 `store_url`（商店链接）字段

**依赖**：
- 需要先有步骤 3 的数据（`app_metadata` 表）
- 需要先有步骤 2 的数据（`rank_changes` 表）

---

## 📋 完整工作流总结

### 执行顺序

```
workflow_week_rank_changes.js
    ↓
1. fetch_top100_to_db.js
    ↓ (输出: apple_top100, android_top100，app_name 待更新)
2. generate_rank_changes_from_db.js
    ↓ (输出: rank_changes, 榜单异动.csv)
3. fetch_app_metadata_to_db.js
    ↓ (输出: app_metadata，包含应用名称)
3.5. update_app_names_from_metadata.js ⭐ 新增
    ↓ (更新: apple_top100.app_name, android_top100.app_name, app_name_cache)
4. fetch_rank_changes_sales.js
    ↓ (更新: rank_changes.downloads, rank_changes.revenue)
5. refill_rank_changes_publisher.js
    ↓ (更新: rank_changes.publisher_name, rank_changes.store_url)
完成！
```

### 最终输出

**数据库表**：
- `apple_top100` - iOS Top100 榜单数据（应用名称已从 app_metadata 更新）
- `android_top100` - Android Top100 榜单数据（应用名称已从 app_metadata 更新）
- `rank_changes` - 完整的异动数据（包含下载量、收益、开发者信息、商店链接）
- `app_metadata` - 应用元数据（包含应用名称）
- `app_name_cache` - 应用名称缓存（已从 app_metadata 更新）

**CSV 文件**：
- `output/榜单异动.csv` - 异动榜单（Excel 可打开）

---

## 🚀 使用方法

### 方式 1：使用完整工作流（推荐）⭐

```bash
# 一条命令完成所有步骤
node scripts/workflow_week_rank_changes.js 2026-02-09
```

### 方式 2：分步执行

如果需要单独执行某个步骤，可以手动运行：

```bash
# 步骤 1：获取 Top100 榜单（不获取应用名称）
node scripts/fetch_top100_to_db.js 2026-02-09

# 步骤 2：生成异动榜单（从库中最新两个周一自动比对）
node scripts/generate_rank_changes_from_db.js

# 步骤 3：获取应用元数据（包含应用名称）
node scripts/fetch_app_metadata_to_db.js

# 步骤 3.5：从元数据更新应用名称 ⭐ 新增
node scripts/update_app_names_from_metadata.js

# 步骤 4：获取下载/收益数据
node scripts/fetch_rank_changes_sales.js 2026-02-09

# 步骤 5：补全开发者信息
node scripts/refill_rank_changes_publisher.js
```

---

## ⏱️ 执行时间估算

- **步骤 1**：3-8 分钟（已优化：不再获取应用名称，速度更快）
- **步骤 2**：< 1 分钟（数据库查询和比对）
- **步骤 3**：5-15 分钟（取决于应用数量）
- **步骤 3.5**：< 1 分钟（数据库更新，无 API 调用）
- **步骤 4**：3-10 分钟（取决于异动应用数量）
- **步骤 5**：< 1 分钟（数据库更新）

**总计**：约 12-35 分钟（优化后节省约 3-5 分钟）

---

## 📊 数据流程图

```
┌─────────────────────────────────────────────────────────┐
│              workflow_week_rank_changes.js              │
│                    (主工作流脚本)                       │
└─────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  步骤 1       │ │  步骤 2       │ │  步骤 3       │
│ fetch_top100  │ │ generate_     │ │ fetch_app_    │
│ _to_db.js     │ │ rank_changes  │ │ metadata      │
└───────────────┘ └───────────────┘ └───────────────┘
        │               │               │
        │               ▼               │
        │       rank_changes 表         │
        │               │               │
        │               ▼               │
        │       ┌───────────────┐       │
        │       │  步骤 4       │       │
        │       │ fetch_rank_   │       │
        │       │ changes_sales │       │
        │       └───────────────┘       │
        │               │               │
        │               ▼               │
        │       rank_changes 表         │
        │       (含 downloads/revenue)  │
        │               │               │
        │               ▼               │
        │       ┌───────────────┐       │
        │       │  步骤 5       │       │
        │       │ refill_rank_ │       │
        │       │ changes_     │       │
        │       │ publisher    │       │
        │       └───────────────┘       │
        │               │               │
        └───────────────┼───────────────┘
                        ▼
            ┌───────────────────────┐
            │   最终数据输出        │
            │                       │
            │ - apple_top100        │
            │ - android_top100      │
            │ - rank_changes        │
            │   (完整数据)          │
            │ - app_metadata        │
            │ - 榜单异动.csv        │
            └───────────────────────┘
```

---

## ⚠️ 注意事项

1. **日期格式**：必须是 `YYYY-MM-DD` 格式，且必须是周一
2. **前置条件**：确保 `.env` 文件中配置了 `SENSORTOWER_API_TOKEN`
3. **数据库路径**：默认使用 `data/sensortower_top100.db`
4. **错误处理**：如果某个步骤失败，工作流会中断，需要手动修复后重新运行
5. **数据覆盖**：使用 `INSERT OR REPLACE` 和 `INSERT OR IGNORE`，不会丢失已有数据

---

## 🔍 验证工作流执行结果

### 检查数据库表

```sql
-- 检查 Top100 数据
SELECT COUNT(*) FROM apple_top100 WHERE rank_date = '2026-02-09';
SELECT COUNT(*) FROM android_top100 WHERE rank_date = '2026-02-09';

-- 检查异动数据
SELECT COUNT(*) FROM rank_changes WHERE rank_date_current = '2026-02-09';

-- 检查元数据
SELECT COUNT(*) FROM app_metadata;

-- 检查异动数据是否完整（包含下载量和开发者信息）
SELECT 
  COUNT(*) as total,
  COUNT(downloads) as has_downloads,
  COUNT(revenue) as has_revenue,
  COUNT(publisher_name) as has_publisher
FROM rank_changes 
WHERE rank_date_current = '2026-02-09';
```

### 检查 CSV 文件

```bash
# 查看 CSV 文件
head -20 output/榜单异动.csv

# 统计行数（包含表头）
wc -l output/榜单异动.csv
```

---

## 📚 相关文档

- [使用指南：获取每周 Top100 榜单和异动榜单](USAGE_GUIDE.md)
- [第4步和第5步使用指南](STEP4_STEP5_USAGE.md)
- [所有脚本功能说明](ALL_SCRIPTS.md)
