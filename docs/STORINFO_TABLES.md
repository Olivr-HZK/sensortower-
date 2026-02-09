# gamestoreinfo 和 appstoreinfo 表说明

## 📊 概述

`gamestoreinfo` 和 `appstoreinfo` 这两个表用于存储从应用商店页面**直接爬取**的详细信息，与 `app_metadata`（从 SensorTower API 获取）不同，这些数据是通过爬虫从 Google Play 和 App Store 页面获取的。

---

## 🎮 gamestoreinfo 表（Google Play 商店信息）

### 数据来源
- **爬取方式**：使用 Playwright 爬取 Google Play 商店页面
- **数据源**：从 `android_top100` 表读取 `app_id`，然后访问对应的 Google Play 页面
- **依赖**：需要先运行 `fetch_app_metadata_to_db.js` 获取商店链接（`url` 字段）

### 主要字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `app_id` | TEXT (PK) | 应用 ID |
| `package_id` | TEXT | 包名（如 `com.example.app`） |
| `title` | TEXT | 应用名称 |
| `rating` | REAL | 评分（0-5） |
| `installs` | TEXT | 安装量（如 "100,000,000+"） |
| `developer` | TEXT | 开发者/发行商名称 |
| `category` | TEXT | 分类（如 "动作"、"益智"） |
| `category_id` | TEXT | 分类 ID |
| `short_description` | TEXT | 短描述 |
| `full_description` | TEXT | 完整描述 |
| `content_rating` | TEXT | 年龄分级（如 "18 岁以上"） |
| `content_rating_labels` | TEXT | 内容标签（JSON 数组） |
| `price_type` | TEXT | 购买类型（购买/安装/免费） |
| `store_url` | TEXT | Google Play 商店链接 |
| `icon_url` | TEXT | 应用图标 URL |
| `screenshot_urls` | TEXT | 截图 URL 列表（JSON 数组） |
| `video_thumbnail_url` | TEXT | 视频缩略图 URL |
| `video_id` | TEXT | YouTube 视频 ID |
| `similar_app_ids` | TEXT | 类似应用 ID 列表（JSON 数组） |
| `event_end_time` | TEXT | 活动结束时间 |
| `crawled_at` | TEXT | 爬取时间 |
| `updated_at` | TEXT | 更新时间 |

### 获取方式

```bash
# 从 android_top100 表读取 app_id，爬取 Google Play 信息
node scripts/fetch_google_play_store_info.js

# 只爬取前 10 个（用于测试）
node scripts/fetch_google_play_store_info.js 10

# 或者使用完整工作流（US Top100）
node scripts/weekly_us_free_top100_storeinfo.js
```

### 特点
- ✅ 包含更详细的商店页面信息（截图、视频、描述等）
- ✅ 包含用户评分和安装量数据
- ✅ 包含内容分级和标签信息
- ⚠️ 需要网络访问 Google Play
- ⚠️ 爬取速度较慢（每个请求间隔 2 秒）

---

## 🍎 appstoreinfo 表（App Store 商店信息）

### 数据来源
- **爬取方式**：使用 Playwright 爬取 App Store 页面
- **数据源**：从 `apple_top100` 表读取 `app_id`，然后访问对应的 App Store 页面
- **依赖**：需要先运行 `fetch_app_metadata_to_db.js` 获取商店链接（`url` 字段）

### 主要字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `app_id` | TEXT (PK) | 应用 ID |
| `app_name` | TEXT | 应用名称 |
| `subtitle` | TEXT | 副标题 |
| `price` | TEXT | 价格（如 "Free"、"¥6.00"） |
| `price_type` | TEXT | 价格类型 |
| `rating` | REAL | 评分（0-5） |
| `rating_count` | TEXT | 评分数量 |
| `age_rating` | TEXT | 年龄分级 |
| `category` | TEXT | 分类 |
| `category_id` | TEXT | 分类 ID |
| `developer` | TEXT | 开发者名称 |
| `developer_id` | TEXT | 开发者 ID |
| `developer_url` | TEXT | 开发者链接 |
| `languages` | TEXT | 支持的语言 |
| `size` | TEXT | 应用大小（如 "123.4 MB"） |
| `size_bytes` | TEXT | 应用大小（字节） |
| `icon_url` | TEXT | 应用图标 URL |
| `screenshot_urls` | TEXT | 截图 URL 列表（JSON 数组） |
| `description` | TEXT | 完整描述 |
| `description_short` | TEXT | 短描述 |
| `release_notes` | TEXT | 更新日志 |
| `version` | TEXT | 版本号 |
| `last_updated` | TEXT | 最后更新时间 |
| `compatibility` | TEXT | 兼容性信息 |
| `in_app_purchases` | TEXT | 应用内购买信息 |
| `store_url` | TEXT | App Store 链接 |
| `crawled_at` | TEXT | 爬取时间 |
| `updated_at` | TEXT | 更新时间 |

### 获取方式

```bash
# 使用完整工作流（US Top100，包含 iOS 和 Android）
node scripts/weekly_us_free_top100_storeinfo.js

# 指定日期
node scripts/weekly_us_free_top100_storeinfo.js --date 2026-02-03

# 限制数量
node scripts/weekly_us_free_top100_storeinfo.js --limit 50
```

### 特点
- ✅ 包含 App Store 特有的信息（更新日志、版本号等）
- ✅ 包含应用大小和兼容性信息
- ✅ 包含开发者链接和详细信息
- ⚠️ 需要网络访问 App Store
- ⚠️ 爬取速度较慢

---

## 📋 变更表（Changes Tables）

### gamestoreinfo_changes
记录 `gamestoreinfo` 表的数据变更历史。

**字段**：
- `id` - 主键
- `app_id` - 应用 ID
- `rank_date` - 排名日期
- `changed_at` - 变更时间
- `changes_json` - 变更内容（JSON）
- `old_data_json` - 旧数据（JSON）
- `new_data_json` - 新数据（JSON）

### appstoreinfo_changes
记录 `appstoreinfo` 表的数据变更历史。

**字段**：同上

---

## 🔄 与其他表的关系

### 数据流程

```
1. fetch_top100_to_db.js
   ↓
   apple_top100 / android_top100（榜单数据）
   ↓
2. fetch_app_metadata_to_db.js
   ↓
   app_metadata（API 获取的基本信息 + 商店链接）
   ↓
3. fetch_google_play_store_info.js / weekly_us_free_top100_storeinfo.js
   ↓
   gamestoreinfo / appstoreinfo（爬取的详细商店信息）
```

### 表之间的关系

| 表名 | 数据来源 | 用途 | 特点 |
|------|---------|------|------|
| `app_metadata` | SensorTower API | 应用基本元数据 | 快速、批量获取 |
| `gamestoreinfo` | Google Play 爬虫 | Android 商店详细信息 | 详细、包含用户数据 |
| `appstoreinfo` | App Store 爬虫 | iOS 商店详细信息 | 详细、包含版本信息 |

---

## 💡 使用建议

### 何时使用 app_metadata
- ✅ 需要快速获取大量应用的基本信息
- ✅ 不需要详细的商店页面信息
- ✅ 需要开发者名称、商店链接等基础数据

### 何时使用 gamestoreinfo/appstoreinfo
- ✅ 需要详细的商店页面信息（截图、描述、评分等）
- ✅ 需要监控商店信息的变化
- ✅ 需要用户评分和安装量数据
- ✅ 需要应用版本和更新日志

### 推荐工作流

```bash
# 1. 获取榜单
node scripts/fetch_top100_to_db.js 2026-02-09

# 2. 获取 API 元数据（快速）
node scripts/fetch_app_metadata_to_db.js

# 3. 如果需要详细商店信息，再爬取（较慢）
node scripts/fetch_google_play_store_info.js
# 或
node scripts/weekly_us_free_top100_storeinfo.js
```

---

## 📊 当前数据状态

- `gamestoreinfo`：100 条记录
- `appstoreinfo`：100 条记录
- `gamestoreinfo_changes`：已清空
- `appstoreinfo_changes`：已清空

---

## 🔍 查询示例

### 查看 Google Play 应用信息
```sql
SELECT app_id, title, developer, rating, installs 
FROM gamestoreinfo 
ORDER BY rating DESC 
LIMIT 10;
```

### 查看 App Store 应用信息
```sql
SELECT app_id, app_name, developer, rating, price 
FROM appstoreinfo 
ORDER BY rating DESC 
LIMIT 10;
```

### 对比 API 数据和爬取数据
```sql
-- 查看 API 获取的数据
SELECT app_id, publisher_name, url 
FROM app_metadata 
WHERE os = 'android' 
LIMIT 5;

-- 查看爬取的数据
SELECT app_id, title, developer, store_url 
FROM gamestoreinfo 
LIMIT 5;
```
