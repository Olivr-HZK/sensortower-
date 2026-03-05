# app_metadata 数据来源说明

## 📊 数据来源

`fetch_app_metadata_to_db.js` 脚本**从 Top100 榜单中的所有应用**获取元数据，而不是只获取异动榜单中的应用。

---

## 🔍 代码分析

### 数据获取逻辑

```javascript
/** 从 apple_top100 / android_top100 取去重 app_id */
function getAppIdsFromTop100(os) {
  const table = os === 'ios' ? 'apple_top100' : 'android_top100';
  try {
    const out = execSync(
      `sqlite3 -separator '|' "${DB_FILE}" "SELECT DISTINCT app_id FROM ${table} WHERE app_id IS NOT NULL AND app_id != ''"`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
    return [...new Set(out.trim().split('\n').map((l) => l.split('|')[0].trim()).filter(Boolean))];
  } catch (e) {
    return [];
  }
}
```

**关键点**：
- ✅ 从 `apple_top100` / `android_top100` 表读取
- ✅ 使用 `SELECT DISTINCT app_id` 获取所有去重的应用 ID
- ✅ **不是**从 `rank_changes` 表读取

---

## 📈 数据对比

### 当前数据统计

| 数据源 | iOS 应用数 | Android 应用数 |
|--------|-----------|---------------|
| **Top100 榜单** | 526 个 | 518 个 |
| **app_metadata** | 527 个 | 518 个 |
| **异动榜单** (2026-02-09) | ~146 个 | - |

### 说明

- `app_metadata` 的数量与 Top100 榜单基本一致
- 说明 `app_metadata` 是从 **Top100 榜单中的所有应用**获取的
- 不是只获取异动榜单中的应用

---

## 🎯 为什么从 Top100 获取？

### 优势

1. **数据完整性**：
   - Top100 榜单包含所有上榜应用
   - 异动榜单只包含有变化的 ~146 个应用
   - 获取 Top100 的所有应用元数据，可以用于更多场景

2. **提前准备**：
   - 即使应用没有异动，也可能需要元数据
   - 补全开发者信息、商店链接等操作需要完整的元数据

3. **减少重复请求**：
   - 已存在的 `(app_id, os)` 不会重复请求
   - 一次获取，多次使用

### 使用场景

- ✅ 补全异动表的开发者信息（需要所有应用的元数据）
- ✅ 提供商店链接（用于爬取商店信息）
- ✅ 应用基本信息查询
- ✅ 后续分析需要完整的应用信息

---

## 🔄 数据流程

```
步骤 1: fetch_top100_to_db.js
  ↓
  获取 Top100 榜单
  ↓
  写入 apple_top100 / android_top100 表
  (包含所有上榜应用的 app_id)

步骤 3: fetch_app_metadata_to_db.js
  ↓
  从 apple_top100 / android_top100 读取所有 app_id
  ↓
  调用 /v1/{os}/apps API
  ↓
  写入 app_metadata 表
  (包含所有 Top100 应用的元数据)

步骤 5: refill_rank_changes_publisher.js
  ↓
  从 app_metadata 读取开发者信息
  ↓
  更新 rank_changes 表
  (只更新异动应用的信息)
```

---

## 💡 如果只想获取异动应用的元数据

如果需要只获取异动应用的元数据（节省 API 调用），可以修改脚本：

### 方案 1：修改脚本添加选项

```javascript
// 添加命令行参数
const onlyRankChanges = process.argv.includes('--rank-changes-only');

function getAppIds(os) {
  if (onlyRankChanges) {
    // 从 rank_changes 表读取
    return getAppIdsFromRankChanges(os);
  } else {
    // 从 Top100 表读取（默认）
    return getAppIdsFromTop100(os);
  }
}
```

### 方案 2：创建新脚本

创建一个新脚本 `fetch_rank_changes_metadata_to_db.js`，专门从 `rank_changes` 表读取 `app_id`。

---

## 📋 当前实现的好处

### 1. 数据完整性

获取所有 Top100 应用的元数据，确保：
- 所有上榜应用都有元数据
- 后续操作不需要再次请求
- 数据更完整

### 2. 性能优化

- 已存在的 `(app_id, os)` 不会重复请求
- 一次获取，多次使用
- 减少后续的 API 调用

### 3. 灵活性

- 可以用于补全异动表
- 可以用于爬取商店信息
- 可以用于其他分析需求

---

## 🔍 验证方法

### 查看数据来源

```sql
-- 查看 Top100 中的 app_id 数量
SELECT COUNT(DISTINCT app_id) FROM apple_top100;
SELECT COUNT(DISTINCT app_id) FROM android_top100;

-- 查看 app_metadata 中的 app_id 数量
SELECT COUNT(DISTINCT app_id) FROM app_metadata WHERE os = 'ios';
SELECT COUNT(DISTINCT app_id) FROM app_metadata WHERE os = 'android';

-- 对比：Top100 中的 app_id 是否都在 app_metadata 中
SELECT COUNT(*) as missing_count
FROM (
  SELECT DISTINCT app_id FROM apple_top100
  EXCEPT
  SELECT app_id FROM app_metadata WHERE os = 'ios'
);
```

### 查看异动应用数量

```sql
-- 查看异动应用数量
SELECT COUNT(DISTINCT app_id) FROM rank_changes WHERE rank_date_current = '2026-02-09';

-- 对比：异动应用 vs Top100 应用
SELECT 
  (SELECT COUNT(DISTINCT app_id) FROM rank_changes WHERE rank_date_current = '2026-02-09') as rank_changes_count,
  (SELECT COUNT(DISTINCT app_id) FROM apple_top100) as top100_count;
```

---

## 📊 总结

| 问题 | 答案 |
|------|------|
| **数据来源** | Top100 榜单中的所有应用 |
| **不是** | 只获取异动榜单中的应用 |
| **原因** | 数据完整性、提前准备、减少重复请求 |
| **当前数量** | iOS: 527 个，Android: 518 个 |
| **异动应用数量** | ~146 个（远少于 Top100） |

---

## 🚀 建议

### 当前实现（推荐）

保持当前实现，从 Top100 获取所有应用的元数据：
- ✅ 数据完整
- ✅ 一次获取，多次使用
- ✅ 已存在的不会重复请求

### 如果需要优化

如果 API 调用次数有限制，可以考虑：
1. 先获取异动应用的元数据（必需）
2. 再获取其他应用的元数据（可选）

但当前实现已经通过去重机制避免了重复请求，所以效率已经很高了。
