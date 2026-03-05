# app_metadata 和 app_name_cache 表说明

## 📊 概述

数据库中有两个表都与应用信息相关，但它们的作用和来源不同：

- **`app_metadata`** - 应用元数据表（完整信息）
- **`app_name_cache`** - 应用名称缓存表（仅名称）

---

## 🗄️ app_metadata 表

### 数据来源

**脚本**：`fetch_app_metadata_to_db.js`

**API 接口**：`/v1/{ios|android}/apps`

**数据源**：从 `apple_top100` / `android_top100` 表读取 `app_id`

### 获取方式

```bash
# 获取所有平台的应用元数据
node scripts/fetch_app_metadata_to_db.js

# 只获取 iOS
node scripts/fetch_app_metadata_to_db.js ios

# 只获取 Android
node scripts/fetch_app_metadata_to_db.js android
```

### 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `app_id` | TEXT (PK) | 应用 ID |
| `os` | TEXT (PK) | 平台（ios/android） |
| `name` | TEXT | 应用名称 |
| `publisher_name` | TEXT | 开发者/发行商名称 |
| `publisher_id` | TEXT | 开发者 ID |
| `humanized_name` | TEXT | 人性化名称 |
| `icon_url` | TEXT | 图标 URL |
| `url` | TEXT | 商店链接 |
| `canonical_country` | TEXT | 规范国家 |
| `active` | TEXT | 是否活跃 |
| `categories` | TEXT | 分类（JSON） |
| `valid_countries` | TEXT | 有效国家（JSON） |
| `top_countries` | TEXT | Top 国家（JSON） |
| `app_view_url` | TEXT | 应用查看 URL |
| `publisher_profile_url` | TEXT | 开发者资料 URL |
| ... | ... | 其他字段（动态） |

### 特点

- ✅ **完整信息**：包含应用的所有元数据
- ✅ **包含商店链接**：`url` 字段可用于爬取商店信息
- ✅ **包含开发者信息**：`publisher_name` 可用于补全异动表
- ✅ **去重机制**：已存在的 `(app_id, os)` 不会重复请求
- ✅ **批量获取**：每批 100 个 `app_id`

### 用途

1. **补全异动表的开发者信息**：`refill_rank_changes_publisher.js` 使用
2. **提供商店链接**：用于爬取商店信息（`fetch_google_play_store_info.js`）
3. **应用基本信息查询**：提供应用的完整元数据

### 数据流程

```
apple_top100 / android_top100 表
  ↓ (读取 app_id)
SensorTower API: /v1/{os}/apps
  ↓ (批量请求，每批 100 个)
解析响应数据
  ↓
app_metadata 表
  (INSERT OR REPLACE)
```

---

## 📝 app_name_cache 表

### 数据来源

**脚本**：`fetch_top100_to_db.js`（自动创建和更新）

**API 接口**：`/v1/{ios|android}/category/category_history`

**数据源**：在获取 Top100 榜单时，自动获取应用名称并缓存

### 创建时机

1. **自动创建**：`fetch_top100_to_db.js` 执行时自动创建
2. **自动更新**：每次获取应用名称时自动更新缓存

### 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `app_id` | TEXT (PK) | 应用 ID |
| `app_name` | TEXT | 应用名称 |
| `platform` | TEXT (PK) | 平台（ios/android） |

**主键**：`(app_id, platform)`

### 特点

- ✅ **仅存储名称**：只缓存应用名称，数据量小
- ✅ **自动缓存**：获取名称时自动写入缓存
- ✅ **优先读取**：下次获取名称时优先从缓存读取
- ✅ **减少 API 调用**：避免重复请求相同应用名称

### 用途

1. **加速名称获取**：`fetch_top100_to_db.js` 获取应用名称时优先读缓存
2. **减少 API 调用**：已缓存的应用名称不再调用 API
3. **提高性能**：避免重复的网络请求

### 数据流程

```
fetch_top100_to_db.js 执行
  ↓
需要获取应用名称
  ↓
先查 app_name_cache 表
  ↓
如果缓存中有 → 直接使用
如果缓存中没有 → 调用 API 获取
  ↓
写入 app_name_cache 表
  ↓
使用名称写入 apple_top100 / android_top100 表
```

---

## 🔄 两者的关系和区别

### 相同点

- 都存储应用相关信息
- 都按 `(app_id, platform)` 区分
- 都用于减少 API 调用

### 不同点

| 特性 | app_metadata | app_name_cache |
|------|-------------|----------------|
| **数据来源** | `/v1/{os}/apps` API | `/v1/{os}/category/category_history` API |
| **数据内容** | 完整的应用元数据 | 仅应用名称 |
| **创建脚本** | `fetch_app_metadata_to_db.js` | `fetch_top100_to_db.js`（自动） |
| **更新频率** | 手动运行脚本 | 自动更新（获取榜单时） |
| **主要用途** | 补全开发者信息、提供商店链接 | 加速名称获取、减少 API 调用 |
| **数据量** | 较大（包含所有字段） | 较小（仅名称） |
| **当前记录数** | 1045 条 | 995 条 |

---

## 📋 使用场景

### 使用 app_metadata

```bash
# 场景 1：需要补全异动表的开发者信息
node scripts/refill_rank_changes_publisher.js
# → 从 app_metadata 读取 publisher_name

# 场景 2：需要商店链接来爬取商店信息
node scripts/fetch_google_play_store_info.js
# → 从 app_metadata 读取 url

# 场景 3：需要完整的应用元数据
# → 直接查询 app_metadata 表
```

### 使用 app_name_cache

```bash
# 场景 1：获取 Top100 榜单时自动使用
node scripts/fetch_top100_to_db.js 2026-02-09
# → 自动从 app_name_cache 读取名称，减少 API 调用

# 场景 2：补全应用名称时使用
node scripts/refill_app_names.js
# → 从 app_name_cache 读取已缓存的名称
```

---

## 🔍 查询示例

### 查询 app_metadata

```sql
-- 查看应用元数据
SELECT app_id, name, publisher_name, url 
FROM app_metadata 
WHERE os = 'ios' 
LIMIT 10;

-- 查看特定应用的元数据
SELECT * FROM app_metadata 
WHERE app_id = '123456789' AND os = 'ios';

-- 统计各平台的应用数量
SELECT os, COUNT(*) as count 
FROM app_metadata 
GROUP BY os;
```

### 查询 app_name_cache

```sql
-- 查看应用名称缓存
SELECT app_id, app_name, platform 
FROM app_name_cache 
WHERE platform = 'ios' 
LIMIT 10;

-- 查看特定应用名称
SELECT app_name 
FROM app_name_cache 
WHERE app_id = '123456789' AND platform = 'ios';

-- 统计各平台的缓存数量
SELECT platform, COUNT(*) as count 
FROM app_name_cache 
GROUP BY platform;
```

### 对比查询

```sql
-- 查看哪些应用有元数据但没有名称缓存
SELECT m.app_id, m.os, m.name as metadata_name, c.app_name as cached_name
FROM app_metadata m
LEFT JOIN app_name_cache c 
  ON m.app_id = c.app_id AND m.os = c.platform
WHERE c.app_name IS NULL
LIMIT 10;

-- 查看哪些应用有名称缓存但没有元数据
SELECT c.app_id, c.platform, c.app_name
FROM app_name_cache c
LEFT JOIN app_metadata m 
  ON c.app_id = m.app_id AND c.platform = m.os
WHERE m.app_id IS NULL
LIMIT 10;
```

---

## 💡 最佳实践

### 1. 何时运行 fetch_app_metadata_to_db.js

- ✅ 在完整工作流中（第 3 步）
- ✅ 需要补全开发者信息时
- ✅ 需要商店链接来爬取商店信息时
- ✅ 定期更新（每周一次）

### 2. app_name_cache 的维护

- ✅ **自动维护**：`fetch_top100_to_db.js` 会自动更新
- ✅ **无需手动操作**：缓存会在获取榜单时自动创建和更新
- ✅ **可手动补全**：使用 `refill_app_names.js` 补全缺失的名称

### 3. 数据同步

- 两个表的数据可能不完全一致（因为来源不同）
- `app_metadata` 更完整，包含更多信息
- `app_name_cache` 更轻量，主要用于加速名称获取

---

## 🔄 数据更新流程

### 完整工作流中的数据更新

```
步骤 1: fetch_top100_to_db.js
  ↓
  获取 Top100 榜单
  ↓
  自动获取应用名称（优先读 app_name_cache）
  ↓
  写入 apple_top100 / android_top100
  ↓
  更新 app_name_cache（如果名称是新获取的）

步骤 3: fetch_app_metadata_to_db.js
  ↓
  从 apple_top100 / android_top100 读取 app_id
  ↓
  调用 /v1/{os}/apps API
  ↓
  写入 app_metadata 表

步骤 5: refill_rank_changes_publisher.js
  ↓
  从 app_metadata 读取 publisher_name
  ↓
  更新 rank_changes 表
```

---

## 📊 当前数据状态

- **app_metadata**：1045 条记录
- **app_name_cache**：995 条记录

---

## 🚀 手动执行

### 获取应用元数据

```bash
# 获取所有平台
node scripts/fetch_app_metadata_to_db.js

# 只获取 iOS
node scripts/fetch_app_metadata_to_db.js ios

# 只获取 Android
node scripts/fetch_app_metadata_to_db.js android
```

### 补全应用名称（会更新 app_name_cache）

```bash
node scripts/refill_app_names.js
```

### 构建应用名称缓存（从榜单表提取）

```bash
node scripts/build_app_cache_and_update_display.js
```

---

## 📚 相关文档

- [完整周报工作流说明](WEEKLY_WORKFLOW.md)
- [所有脚本功能说明](ALL_SCRIPTS.md)
