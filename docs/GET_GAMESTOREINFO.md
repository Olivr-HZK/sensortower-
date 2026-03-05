# 获取 gamestoreinfo 和 gamestoreinfo_changes 指南

## 📊 概述

`gamestoreinfo` 表存储从 Google Play 商店页面爬取的详细信息，`gamestoreinfo_changes` 表自动记录这些信息的变化历史。

---

## 🎯 获取方式

### 方式 1：只获取商店信息（不检测变更）⭐ 简单

**脚本**：`fetch_google_play_store_info.js`

**功能**：
- 从 `android_top100` 表读取 `app_id`
- 使用 Playwright 爬取 Google Play 商店页面
- 解析并存储到 `gamestoreinfo` 表
- **不检测变更**，只更新数据

**使用方法**：
```bash
# 爬取所有未爬取的应用（从 android_top100 表读取）
node scripts/fetch_google_play_store_info.js

# 只爬取前 10 个（用于测试）
node scripts/fetch_google_play_store_info.js 10

# 只爬取前 50 个
node scripts/fetch_google_play_store_info.js 50
```

**特点**：
- ✅ 简单直接，只爬取商店信息
- ✅ 自动跳过已爬取的应用
- ❌ 不检测变更，不会写入 `gamestoreinfo_changes` 表

**前置条件**：
1. 需要先运行 `fetch_app_metadata_to_db.js` 获取商店链接（`url` 字段）
2. 需要安装 Playwright：`npx playwright install chromium`

---

### 方式 2：获取商店信息 + 自动检测变更 ⭐ 推荐

**脚本**：`weekly_us_free_top100_storeinfo.js`

**功能**：
- 获取 US 免费榜 Top100（Android + iOS）
- 爬取商店信息并写入 `gamestoreinfo` / `appstoreinfo` 表
- **自动检测变更**：对比新旧数据，如有变化写入 `gamestoreinfo_changes` / `appstoreinfo_changes` 表

**使用方法**：
```bash
# 默认爬取 100 个应用（US Top100）
node scripts/weekly_us_free_top100_storeinfo.js

# 指定日期（使用该日期的榜单）
node scripts/weekly_us_free_top100_storeinfo.js --date 2026-02-09

# 限制数量（用于测试）
node scripts/weekly_us_free_top100_storeinfo.js --limit 50
```

**特点**：
- ✅ **自动检测变更**，记录到 `gamestoreinfo_changes` 表
- ✅ 同时获取 Android 和 iOS 的商店信息
- ✅ 包含变更历史记录
- ⚠️ 只处理 US 免费榜 Top100

**前置条件**：
1. 需要先运行 `fetch_top100_to_db.js` 获取榜单数据
2. 需要先运行 `fetch_app_metadata_to_db.js` 获取商店链接
3. 需要安装 Playwright：`npx playwright install chromium`

---

## 🔄 完整工作流

### 推荐流程（包含变更检测）

```bash
# 1. 获取 Top100 榜单
node scripts/fetch_top100_to_db.js 2026-02-09

# 2. 获取应用元数据（包含商店链接）
node scripts/fetch_app_metadata_to_db.js

# 3. 爬取商店信息并检测变更
node scripts/weekly_us_free_top100_storeinfo.js --date 2026-02-09
```

### 简单流程（只获取商店信息）

```bash
# 1. 获取应用元数据（包含商店链接）
node scripts/fetch_app_metadata_to_db.js

# 2. 爬取 Google Play 商店信息
node scripts/fetch_google_play_store_info.js
```

---

## 📋 数据流程

### 方式 1：fetch_google_play_store_info.js

```
android_top100 表
  ↓ (读取 app_id)
app_metadata 表
  ↓ (获取 url)
Google Play 页面
  ↓ (Playwright 爬取)
解析数据
  ↓
gamestoreinfo 表
  (INSERT OR REPLACE，更新数据)
```

### 方式 2：weekly_us_free_top100_storeinfo.js

```
apple_top100 / android_top100 表
  ↓ (读取 US Top100)
app_metadata 表
  ↓ (获取 url)
Google Play / App Store 页面
  ↓ (Playwright 爬取)
解析数据
  ↓
对比旧数据（从 gamestoreinfo / appstoreinfo 表读取）
  ↓
如果有变化
  ↓
gamestoreinfo_changes / appstoreinfo_changes 表
  ↓
gamestoreinfo / appstoreinfo 表
  (更新数据)
```

---

## 🔍 变更检测说明

### 自动检测的字段

`weekly_us_free_top100_storeinfo.js` 会自动检测以下字段的变化：

- `rating` - 评分变化
- `installs` / `rating_count` - 安装量/评分数量变化
- `title` / `app_name` - 应用名称变化
- `developer` - 开发者变化
- `category` - 分类变化
- `description` - 描述变化
- `price` / `price_type` - 价格变化
- `version` / `last_updated` - 版本更新
- `screenshot_urls` - 截图变化
- 等等...

**不检测的字段**：
- `crawled_at` - 爬取时间
- `updated_at` - 更新时间

### 变更记录格式

```json
{
  "rating": {
    "old": "4.5",
    "new": "4.6"
  },
  "installs": {
    "old": "100M+",
    "new": "500M+"
  },
  "title": {
    "old": "Old App Name",
    "new": "New App Name"
  }
}
```

---

## 📊 查询示例

### 查看 gamestoreinfo 数据

```sql
-- 查看所有应用
SELECT app_id, title, developer, rating, installs 
FROM gamestoreinfo 
ORDER BY rating DESC 
LIMIT 10;

-- 查看特定应用
SELECT * FROM gamestoreinfo WHERE app_id = 'com.example.app';
```

### 查看变更记录

```sql
-- 查看所有变更记录
SELECT 
  app_id,
  rank_date,
  changed_at,
  changes_json
FROM gamestoreinfo_changes
ORDER BY changed_at DESC
LIMIT 10;

-- 查看特定应用的变更历史
SELECT 
  changed_at,
  changes_json,
  old_data_json,
  new_data_json
FROM gamestoreinfo_changes
WHERE app_id = 'com.example.app'
ORDER BY changed_at DESC;

-- 查看评分变化的记录
SELECT 
  app_id,
  changed_at,
  json_extract(changes_json, '$.rating') as rating_change
FROM gamestoreinfo_changes
WHERE changes_json LIKE '%rating%'
ORDER BY changed_at DESC;
```

### 统计变更情况

```sql
-- 统计变更最多的应用
SELECT 
  app_id,
  COUNT(*) as change_count
FROM gamestoreinfo_changes
GROUP BY app_id
ORDER BY change_count DESC
LIMIT 10;

-- 统计最近一周的变更数量
SELECT 
  DATE(changed_at) as date,
  COUNT(*) as change_count
FROM gamestoreinfo_changes
WHERE changed_at >= date('now', '-7 days')
GROUP BY DATE(changed_at)
ORDER BY date DESC;
```

---

## ⚙️ 配置说明

### 延迟设置

两个脚本都使用 2 秒延迟，避免被封：

```javascript
const DELAY_MS = 2000; // 每个请求间隔 2 秒
```

如果需要调整，可以修改脚本中的 `DELAY_MS` 常量。

### 批次大小

`fetch_google_play_store_info.js` 会批量处理，自动跳过已爬取的应用。

---

## ⚠️ 注意事项

### 1. 前置条件

- **必须**先运行 `fetch_app_metadata_to_db.js` 获取商店链接
- **必须**安装 Playwright：`npx playwright install chromium`
- **建议**先运行 `fetch_top100_to_db.js` 获取榜单数据

### 2. 网络要求

- 需要能访问 Google Play 商店
- 如果在国内，可能需要配置代理
- 爬取速度较慢（每个请求 2 秒延迟）

### 3. 数据更新

- `fetch_google_play_store_info.js`：使用 `INSERT OR REPLACE`，会覆盖已有数据
- `weekly_us_free_top100_storeinfo.js`：会检测变更并记录历史

### 4. 错误处理

- 单个应用爬取失败不会中断整个流程
- 失败的应用会记录错误信息，但不会写入数据库

---

## 🚀 快速开始

### 第一次使用

```bash
# 1. 安装 Playwright（如果还没安装）
npx playwright install chromium

# 2. 获取应用元数据（包含商店链接）
node scripts/fetch_app_metadata_to_db.js

# 3. 爬取商店信息（推荐：包含变更检测）
node scripts/weekly_us_free_top100_storeinfo.js --limit 10

# 或只爬取商店信息（简单）
node scripts/fetch_google_play_store_info.js 10
```

### 定期更新（每周）

```bash
# 1. 获取最新榜单
node scripts/fetch_top100_to_db.js 2026-02-09

# 2. 更新应用元数据
node scripts/fetch_app_metadata_to_db.js

# 3. 爬取商店信息并检测变更
node scripts/weekly_us_free_top100_storeinfo.js --date 2026-02-09
```

---

## 📈 执行时间估算

- **fetch_google_play_store_info.js**：
  - 每个应用约 3-5 秒（包含 2 秒延迟）
  - 100 个应用约 5-8 分钟

- **weekly_us_free_top100_storeinfo.js**：
  - Android 100 个：约 5-8 分钟
  - iOS 100 个：约 5-8 分钟
  - 总计：约 10-16 分钟

---

## 🔗 相关文档

- [商店信息表说明](STORINFO_TABLES.md)
- [变更表说明](STORINFO_CHANGES.md)
- [所有脚本功能说明](ALL_SCRIPTS.md)
