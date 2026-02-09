# gamestoreinfo_changes 和 appstoreinfo_changes 变更表说明

## 📊 概述

`gamestoreinfo_changes` 和 `appstoreinfo_changes` 这两个表用于**自动记录**商店信息的变化历史。当重新爬取商店信息时，如果发现数据有变化，会自动将变更记录写入这些表中。

---

## 🔄 工作原理

### 自动检测变更

当运行 `weekly_us_free_top100_storeinfo.js` 脚本时，会执行以下流程：

```
1. 爬取商店信息
   ↓
2. 检查数据库中是否已有该应用的信息（oldRow）
   ↓
3. 对比新旧数据（diffStoreInfo）
   ↓
4. 如果发现有变化
   ↓
5. 写入变更表（changes）
   ↓
6. 更新主表（gamestoreinfo / appstoreinfo）
```

### 变更检测逻辑

```javascript
// 对比新旧数据的每个字段
function diffStoreInfo(oldRow, newRow, columns) {
  const changes = {};
  for (const c of columns) {
    // 跳过时间戳字段
    if (c === 'crawled_at' || c === 'updated_at') continue;
    
    const oldVal = oldRow ? oldRow[c] : null;
    const newVal = newRow[c];
    
    // 如果值不同，记录变更
    if (oldVal !== newVal) {
      changes[c] = { old: oldVal, new: newVal };
    }
  }
  return changes;
}
```

---

## 📋 表结构

### gamestoreinfo_changes

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER (PK) | 主键，自增 |
| `app_id` | TEXT (NOT NULL) | 应用 ID |
| `rank_date` | TEXT | 排名日期（可选） |
| `changed_at` | TEXT | 变更时间（默认当前时间） |
| `changes_json` | TEXT | 变更内容（JSON 格式） |
| `old_data_json` | TEXT | 旧数据（JSON 格式） |
| `new_data_json` | TEXT | 新数据（JSON 格式） |

### appstoreinfo_changes

表结构与 `gamestoreinfo_changes` 相同。

---

## 🔍 变更记录示例

### changes_json 格式

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

### 完整记录示例

```sql
SELECT 
  app_id,
  rank_date,
  changed_at,
  changes_json,
  old_data_json,
  new_data_json
FROM gamestoreinfo_changes
LIMIT 1;
```

---

## 🚀 如何生成变更记录

### 方法1：使用完整工作流脚本（推荐）

```bash
# 爬取 US Top100，自动检测变更
node scripts/weekly_us_free_top100_storeinfo.js

# 指定日期
node scripts/weekly_us_free_top100_storeinfo.js --date 2026-02-09

# 限制数量（用于测试）
node scripts/weekly_us_free_top100_storeinfo.js --limit 50
```

### 工作流程

1. **读取榜单**：从 `apple_top100` 或 `android_top100` 表读取 Top100 应用
2. **获取商店链接**：从 `app_metadata` 表获取商店 URL
3. **爬取商店信息**：使用 Playwright 爬取 Google Play 或 App Store 页面
4. **解析数据**：解析页面获取应用信息
5. **对比变更**：
   - 如果数据库中已有该应用的信息，对比新旧数据
   - 如果发现变化，记录到变更表
6. **更新主表**：使用 `INSERT OR REPLACE` 更新主表

---

## 📊 变更检测的字段

### gamestoreinfo 检测的字段

- `package_id` - 包名
- `title` - 应用名称
- `rating` - 评分
- `installs` - 安装量
- `developer` - 开发者
- `category` - 分类
- `category_id` - 分类 ID
- `short_description` - 短描述
- `full_description` - 完整描述
- `content_rating` - 内容分级
- `content_rating_labels` - 内容标签
- `price_type` - 价格类型
- `store_url` - 商店链接
- `icon_url` - 图标 URL
- `screenshot_urls` - 截图 URL
- `video_thumbnail_url` - 视频缩略图
- `video_id` - 视频 ID
- `similar_app_ids` - 类似应用
- `event_end_time` - 活动结束时间

**不检测的字段**：
- `crawled_at` - 爬取时间
- `updated_at` - 更新时间

### appstoreinfo 检测的字段

- `app_name` - 应用名称
- `subtitle` - 副标题
- `price` - 价格
- `price_type` - 价格类型
- `rating` - 评分
- `rating_count` - 评分数量
- `age_rating` - 年龄分级
- `category` - 分类
- `category_id` - 分类 ID
- `developer` - 开发者
- `developer_id` - 开发者 ID
- `developer_url` - 开发者链接
- `languages` - 支持的语言
- `size` - 应用大小
- `size_bytes` - 应用大小（字节）
- `icon_url` - 图标 URL
- `screenshot_urls` - 截图 URL
- `description` - 描述
- `description_short` - 短描述
- `release_notes` - 更新日志
- `version` - 版本号
- `last_updated` - 最后更新时间
- `compatibility` - 兼容性
- `in_app_purchases` - 应用内购买

**不检测的字段**：
- `crawled_at` - 爬取时间
- `updated_at` - 更新时间

---

## 💡 使用场景

### 1. 监控应用信息变化

定期运行脚本，自动记录应用信息的变化：

```bash
# 每周运行一次，记录变更
node scripts/weekly_us_free_top100_storeinfo.js --date 2026-02-09
```

### 2. 分析变更趋势

查询变更记录，分析哪些应用的信息变化最频繁：

```sql
-- 查看变更最多的应用
SELECT 
  app_id,
  COUNT(*) as change_count
FROM gamestoreinfo_changes
GROUP BY app_id
ORDER BY change_count DESC
LIMIT 10;
```

### 3. 查看特定应用的变更历史

```sql
-- 查看某个应用的变更历史
SELECT 
  changed_at,
  changes_json,
  old_data_json,
  new_data_json
FROM gamestoreinfo_changes
WHERE app_id = 'com.example.app'
ORDER BY changed_at DESC;
```

### 4. 分析评分变化

```sql
-- 查看评分变化的记录
SELECT 
  app_id,
  changed_at,
  json_extract(changes_json, '$.rating') as rating_change
FROM gamestoreinfo_changes
WHERE changes_json LIKE '%rating%'
ORDER BY changed_at DESC;
```

---

## 🔍 查询示例

### 查看最近的变更记录

```sql
SELECT 
  app_id,
  rank_date,
  changed_at,
  changes_json
FROM gamestoreinfo_changes
ORDER BY changed_at DESC
LIMIT 10;
```

### 统计变更类型

```sql
-- 统计哪些字段变化最频繁
SELECT 
  json_extract(changes_json, '$') as changes
FROM gamestoreinfo_changes
LIMIT 1;
```

### 查看特定日期的变更

```sql
SELECT 
  app_id,
  changed_at,
  changes_json
FROM gamestoreinfo_changes
WHERE rank_date = '2026-02-09'
ORDER BY changed_at DESC;
```

---

## ⚠️ 注意事项

1. **首次运行**：如果数据库中还没有该应用的信息，不会生成变更记录（因为没有旧数据可对比）

2. **重复运行**：每次运行脚本都会重新爬取，如果数据有变化就会记录

3. **数据量**：变更表会持续增长，建议定期清理或归档旧数据

4. **性能**：变更检测会增加一些处理时间，但影响很小

5. **清空变更表**：如果需要清空变更记录：
   ```sql
   DELETE FROM gamestoreinfo_changes;
   DELETE FROM appstoreinfo_changes;
   ```

---

## 📈 最佳实践

### 1. 定期运行

建议每周运行一次，记录商店信息的变化：

```bash
# 每周一运行
node scripts/weekly_us_free_top100_storeinfo.js --date 2026-02-09
```

### 2. 监控关键字段

重点关注以下字段的变化：
- `rating` - 评分变化
- `installs` / `rating_count` - 用户增长
- `title` / `app_name` - 应用名称变化
- `version` / `last_updated` - 版本更新
- `price` / `price_type` - 价格变化

### 3. 数据归档

定期将旧数据归档，避免变更表过大：

```sql
-- 归档3个月前的数据
DELETE FROM gamestoreinfo_changes 
WHERE changed_at < date('now', '-3 months');
```

---

## 🔗 相关脚本

- `weekly_us_free_top100_storeinfo.js` - 主要脚本，自动检测变更
- `fetch_google_play_store_info.js` - 只爬取 Google Play，不检测变更
- `crawl_google_play.js` - Google Play 页面解析逻辑
- `crawl_appstore.js` - App Store 页面解析逻辑
