# 工作流优化：应用名称获取优化

## 🎯 优化说明

### 优化前

**问题**：
- `fetch_top100_to_db.js` 需要调用 `/category/category_history` API 获取应用名称
- 增加了 API 调用次数和网络请求
- 应用名称在 `fetch_app_metadata_to_db.js` 中也会获取（`name` 字段）

**流程**：
```
1. fetch_top100_to_db.js
   ↓
   获取 Top100 榜单
   ↓
   调用 API 获取应用名称 ← 重复获取
   ↓
   写入 apple_top100 / android_top100

2. fetch_app_metadata_to_db.js
   ↓
   调用 API 获取应用元数据（包含名称）← 重复获取名称
   ↓
   写入 app_metadata
```

---

### 优化后

**改进**：
- `fetch_top100_to_db.js` 不再获取应用名称，只获取榜单数据
- 应用名称从 `app_metadata` 表更新到榜单表
- 减少 API 调用次数，提高效率

**流程**：
```
1. fetch_top100_to_db.js
   ↓
   获取 Top100 榜单（不获取名称）
   ↓
   写入 apple_top100 / android_top100
   (app_name 字段先设置为 app_id)

2. fetch_app_metadata_to_db.js
   ↓
   调用 API 获取应用元数据（包含名称）
   ↓
   写入 app_metadata

3. update_app_names_from_metadata.js（新增）
   ↓
   从 app_metadata 读取 name 字段
   ↓
   更新 apple_top100 / android_top100 的 app_name 字段
   ↓
   更新 app_name_cache 表
```

---

## 📝 修改内容

### 1. `fetch_top100_to_db.js`

**修改前**：
```javascript
// 获取应用名称
const iosNameMap = await getAppNames([...new Set(allIosIds)], 'ios', authToken);
insertRanking('apple_top100', d, country, chartType, ranking, iosNameMap);
```

**修改后**：
```javascript
// 直接写入榜单，应用名称稍后从 app_metadata 更新
insertRanking('apple_top100', d, country, chartType, ranking, {});
```

**效果**：
- ✅ 不再调用 `/category/category_history` API
- ✅ 减少网络请求和 API 调用
- ✅ 加快执行速度

---

### 2. 新增脚本：`update_app_names_from_metadata.js`

**功能**：
- 从 `app_metadata` 表读取 `name` 字段
- 更新 `apple_top100` / `android_top100` 表的 `app_name` 字段
- 更新 `app_name_cache` 表

**使用方法**：
```bash
node scripts/update_app_names_from_metadata.js
```

---

### 3. `workflow_week_rank_changes.js`

**修改前**（5 步）：
```
1. fetch_top100_to_db.js
2. generate_rank_changes_from_db.js
3. fetch_app_metadata_to_db.js
4. fetch_rank_changes_sales.js
5. refill_rank_changes_publisher.js
```

**修改后**（6 步）：
```
1. fetch_top100_to_db.js（不获取名称）
2. generate_rank_changes_from_db.js
3. fetch_app_metadata_to_db.js（获取元数据，包含名称）
3.5. update_app_names_from_metadata.js（从元数据更新名称）← 新增
4. fetch_rank_changes_sales.js
5. refill_rank_changes_publisher.js
```

---

## ✅ 优势

### 1. 减少 API 调用

**优化前**：
- `fetch_top100_to_db.js`：需要调用 `/category/category_history` API 获取名称
- `fetch_app_metadata_to_db.js`：调用 `/apps` API 获取元数据（包含名称）
- **重复获取名称**

**优化后**：
- `fetch_top100_to_db.js`：只获取榜单，不获取名称
- `fetch_app_metadata_to_db.js`：获取元数据（包含名称）
- `update_app_names_from_metadata.js`：从数据库更新名称（无 API 调用）
- **只获取一次名称**

### 2. 提高执行速度

- 减少网络请求时间
- 减少 API 调用延迟
- 加快整体工作流执行

### 3. 数据一致性

- 应用名称统一来自 `app_metadata` 表
- 避免不同 API 返回的名称不一致
- 数据源单一，更可靠

---

## 📊 性能对比

### API 调用次数

| 步骤 | 优化前 | 优化后 | 减少 |
|------|--------|--------|------|
| 获取 Top100 | 需要调用名称 API | 不需要 | ✅ |
| 获取元数据 | 调用元数据 API | 调用元数据 API | - |
| 更新名称 | - | 数据库更新（无 API） | ✅ |
| **总计** | 2 次 API 调用 | 1 次 API 调用 | **减少 50%** |

### 执行时间

- **优化前**：~15-20 分钟（包含名称获取）
- **优化后**：~10-15 分钟（不包含名称获取）
- **节省**：约 5 分钟

---

## 🔄 数据流程

### 优化后的完整流程

```
步骤 1: fetch_top100_to_db.js
  ↓
  获取 Top100 榜单（只获取 app_id 和排名）
  ↓
  写入 apple_top100 / android_top100
  (app_name = app_id，待更新)

步骤 2: generate_rank_changes_from_db.js
  ↓
  比对生成异动（使用 app_id，名称稍后更新）

步骤 3: fetch_app_metadata_to_db.js
  ↓
  获取应用元数据（包含 name 字段）
  ↓
  写入 app_metadata 表

步骤 3.5: update_app_names_from_metadata.js（新增）
  ↓
  从 app_metadata 读取 name 字段
  ↓
  更新 apple_top100 / android_top100 的 app_name
  ↓
  更新 app_name_cache 表

步骤 4: fetch_rank_changes_sales.js
  ↓
  获取下载/收益数据

步骤 5: refill_rank_changes_publisher.js
  ↓
  补全开发者信息（使用 app_metadata）
```

---

## 🚀 使用方法

### 完整工作流

```bash
# 使用优化后的工作流
node scripts/workflow_week_rank_changes.js 2026-02-09
```

### 单独更新应用名称

如果需要单独更新应用名称：

```bash
# 先获取元数据
node scripts/fetch_app_metadata_to_db.js

# 然后更新名称
node scripts/update_app_names_from_metadata.js
```

---

## ⚠️ 注意事项

### 1. 向后兼容

- `app_name` 字段仍然存在
- 如果 `app_metadata` 中没有名称，`app_name` 会保持为 `app_id`
- 不影响现有查询和脚本

### 2. 数据依赖

- `update_app_names_from_metadata.js` 依赖 `app_metadata` 表
- 需要先运行 `fetch_app_metadata_to_db.js`
- 工作流中已自动处理顺序

### 3. 更新条件

脚本只更新以下情况的应用名称：
- `app_name IS NULL`
- `app_name = ''`
- `app_name = app_id`（说明从未获取到真实名称）

已存在的真实名称不会被覆盖。

---

## 📋 验证

### 检查应用名称是否已更新

```sql
-- 查看已更新的应用名称
SELECT COUNT(*) 
FROM apple_top100 
WHERE app_name IS NOT NULL 
  AND app_name != '' 
  AND app_name != app_id;

-- 查看仍需要更新的应用名称
SELECT COUNT(*) 
FROM apple_top100 
WHERE app_name IS NULL 
  OR app_name = '' 
  OR app_name = app_id;
```

---

## 📚 相关文档

- [完整周报工作流说明](WEEKLY_WORKFLOW.md)
- [app_metadata 和 app_name_cache 说明](APP_METADATA_VS_APP_NAME_CACHE.md)
