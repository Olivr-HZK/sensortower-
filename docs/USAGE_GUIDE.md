# 📊 使用指南：获取每周 Top100 榜单和异动榜单

## 🎯 快速开始

### 方式一：使用完整工作流（推荐）⭐

**一条命令完成所有步骤**：抓取 Top100、生成异动、拉取元数据和销售数据

```bash
# 指定本周一的日期（格式：YYYY-MM-DD）
node scripts/workflow_week_rank_changes.js 2026-02-02

# 示例：获取 2026年2月2日这一周的榜单和异动
node scripts/workflow_week_rank_changes.js 2026-02-02
```

**工作流包含的步骤**：
1. ✅ 抓取本周一 + 上周一的 Top100 榜单（iOS/Android）
2. ✅ 比对生成榜单异动
3. ✅ 拉取应用元数据
4. ✅ 拉取异动应用的下载/收益数据
5. ✅ 补全开发者信息和商店链接

**输出结果**：
- 数据库：`data/sensortower_top100.db`
  - `apple_top100` / `android_top100` 表：榜单数据
  - `rank_changes` 表：异动数据（包含下载量、收益等）
  - `app_metadata` 表：应用元数据
- CSV 文件：`output/榜单异动.csv`

---

### 方式二：分步执行

#### 步骤 1：获取每周 Top100 榜单

```bash
# 方式 A：指定本周一的日期（只抓取指定周）
node scripts/fetch_top100_to_db.js 2026-02-02

# 方式 B：不传参数（自动抓取从起始日期到今天的每个周一）
node scripts/fetch_top100_to_db.js
```

**说明**：
- 默认抓取 Puzzle 品类（iOS: 7012, Android: game_puzzle）
- 覆盖国家：US, JP, GB, DE, IN
- 榜单类型：免费榜 + 畅销榜
- 数据保存到：`data/sensortower_top100.db`

#### 步骤 2：生成榜单异动

```bash
# 方式 A：指定本周一的日期
node scripts/generate_rank_changes_from_db.js 2026-02-02

# 方式 B：不传参数（自动使用数据库中最新的两个周一）
node scripts/generate_rank_changes_from_db.js
```

**说明**：
- 比对本周一和上周一的排名变化
- 识别异动类型：
  - 🆕 新进榜单
  - 🚀 排名飙升（上升≥20位）
  - 📈 排名上升（上升≥10位）
  - 📉 排名下跌（下跌≥20位）
- 输出：`output/榜单异动.csv` + 数据库 `rank_changes` 表

#### 步骤 3（可选）：拉取异动应用的下载/收益数据

```bash
# 指定本周一的日期
node scripts/fetch_rank_changes_sales.js 2026-02-02

# 不传参数（使用 rank_changes 表中的第一条记录的日期）
node scripts/fetch_rank_changes_sales.js
```

**说明**：
- 从 `rank_changes` 表读取异动应用
- 拉取当周的下载量和收益数据
- 更新回 `rank_changes` 表的 `downloads` 和 `revenue` 字段

---

## 📋 命令总结

| 需求 | 推荐命令 | 说明 |
|------|---------|------|
| **获取每周 Top100 + 异动（完整流程）** | `node scripts/workflow_week_rank_changes.js 2026-02-02` | ⭐ 推荐，一条命令完成所有步骤 |
| **仅获取 Top100 榜单** | `node scripts/fetch_top100_to_db.js 2026-02-02` | 抓取指定周的榜单数据 |
| **仅生成异动榜单** | `node scripts/generate_rank_changes_from_db.js 2026-02-02` | 需要先有榜单数据 |
| **拉取下载/收益数据** | `node scripts/fetch_rank_changes_sales.js 2026-02-02` | 需要先有异动数据 |

---

## 📅 日期格式说明

所有命令中的日期参数格式为：`YYYY-MM-DD`

**示例**：
- ✅ `2026-02-02` - 正确
- ❌ `2026-2-2` - 错误（需要补零）
- ❌ `02/02/2026` - 错误（格式不对）

**注意**：日期必须是**周一**，脚本会自动计算上周一。

---

## 📁 数据存储位置

### 数据库文件
- 位置：`data/sensortower_top100.db`
- 表结构：
  - `apple_top100` - iOS Top100 榜单
  - `android_top100` - Android Top100 榜单
  - `rank_changes` - 榜单异动数据
  - `app_metadata` - 应用元数据
  - `app_name_cache` - 应用名称缓存

### CSV 输出文件
- `output/榜单异动.csv` - 异动榜单（Excel 可打开）

---

## ⚙️ 前置条件

1. **配置环境变量**
   ```bash
   # 确保项目根目录有 .env 文件
   SENSORTOWER_API_TOKEN=your_api_token_here
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **系统要求**
   - Node.js
   - sqlite3 命令行工具（macOS 默认自带）

---

## 🔍 常见问题

### Q: 如何知道本周一是哪天？
A: 可以使用以下命令查看：
```bash
# macOS/Linux
date -v+Mon -v+Mon -v+1d +%Y-%m-%d  # 下周一
date -v-Mon +%Y-%m-%d                # 本周一
date -v-Mon -v-7d +%Y-%m-%d          # 上周一
```

### Q: 不传日期参数会怎样？
A: 
- `fetch_top100_to_db.js`：会从起始日期（2025-12-29）到今天的每个周一都抓取
- `generate_rank_changes_from_db.js`：会自动使用数据库中最新的两个周一进行比对

### Q: 数据库文件在哪里？
A: 默认在 `data/sensortower_top100.db`，可以通过环境变量 `SENSORTOWER_DB_FILE` 指定其他位置。

### Q: 如何查看数据库内容？
A: 使用 sqlite3 命令行工具：
```bash
sqlite3 data/sensortower_top100.db
# 然后执行 SQL 查询，例如：
# SELECT * FROM rank_changes LIMIT 10;
```

---

## 📚 相关文档

- [API 文档](API_DOCUMENTATION.md)
- [工作流说明](WORKFLOW_README.md)
- [快速开始指南](QUICK_START.md)
