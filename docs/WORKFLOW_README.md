# 📊 完整工作流：获取所有最热游戏和榜单异动

## 📋 概述

`fetch_all_hot_games_and_changes.js` 是一个完整的工作流脚本，用于获取所有品类的最热游戏和榜单异动数据。

## 🎯 功能

### 1. 获取所有最热游戏
- **覆盖范围**：所有品类（iOS 7个品类 + Android 7个品类）
- **榜单类型**：免费榜 + 畅销榜
- **数据量**：每个榜单 Top 100
- **输出文件**：`all_hot_games.csv`

### 2. 获取所有榜单异动
- **覆盖范围**：所有品类（iOS 7个品类 + Android 7个品类）
- **榜单类型**：免费榜
- **分析范围**：Top 50
- **异动类型**：
  - 🆕 新进榜单（上周不在Top 50，本周进入）
  - 🚀 排名飙升（上升≥20位）
  - 📈 排名上升（上升≥10位）
  - 📉 排名下跌（下跌≥20位）
- **输出文件**：`all_rank_changes.csv`

## 🚀 使用方法

### 前置条件

1. **配置 API Token**
   ```bash
   # 确保 .env 文件中配置了 SENSORTOWER_API_TOKEN
   SENSORTOWER_API_TOKEN=your_token_here
   ```

2. **确保 category.json 存在**
   - 文件应包含所有品类的配置

### 运行脚本

```bash
node fetch_all_hot_games_and_changes.js
```

或者（如果已设置可执行权限）：

```bash
./fetch_all_hot_games_and_changes.js
```

## 📊 输出文件

### 1. `all_hot_games.csv`

**表头结构**：
```
平台,品类ID,品类名称,榜单类型,国家,排名,App ID,应用名称
```

**示例数据**：
```csv
iOS,7003,Games/Casual,免费榜,US,1,123456789,应用名称
iOS,7003,Games/Casual,免费榜,US,2,987654321,应用名称2
Android,game_casual,Games/Casual,免费榜,US,1,com.example.app,应用名称3
```

**数据说明**：
- 包含所有品类、所有榜单类型、Top 100 的完整数据
- 预计总记录数：iOS (7品类 × 2榜单 × 100) + Android (7品类 × 2榜单 × 100) = 2800 条

### 2. `all_rank_changes.csv`

**表头结构**：
```
信号,应用名称,App ID,国家,平台,品类ID,品类名称,本周排名,上周排名,变化,异动类型
```

**示例数据**：
```csv
🔴,应用名称,123456789,US,iOS,7003,Games/Casual,10,35,↑25,🚀 排名飙升
🟡,应用名称2,987654321,US,iOS,7003,Games/Casual,15,28,↑13,📈 排名上升
🟢,应用名称3,111222333,US,Android,game_casual,Games/Casual,20,5,↓15,📉 排名下跌
🔴,应用名称4,444555666,US,iOS,7004,Games/Board,25,-,NEW,🆕 新进榜单
```

**数据说明**：
- 只包含有异动的应用（新进榜单、排名飙升、排名上升、排名下跌）
- 异动类型说明：
  - 🔴 红色信号：新进榜单、排名飙升
  - 🟡 黄色信号：排名上升
  - 🟢 绿色信号：排名下跌

## ⚙️ 配置参数

脚本中的配置参数（可在代码中修改）：

```javascript
const CONFIG = {
  COUNTRIES: ['US'],              // 国家列表
  TOP_N: 100,                     // 最热游戏获取数量
  RANK_CHANGE_THRESHOLD: 20,      // 排名变化阈值（飙升/下跌）
  TOP_N_CHANGES: 50,              // 异动分析范围（Top 50）
};
```

## 📈 执行流程

1. **加载配置**
   - 读取 `.env` 获取 API Token
   - 读取 `category.json` 获取品类列表

2. **获取最热游戏**
   - 遍历所有品类（iOS + Android）
   - 对每个品类获取免费榜和畅销榜
   - 批量获取应用名称
   - 保存到 `all_hot_games.csv`

3. **获取榜单异动**
   - 遍历所有品类（iOS + Android）
   - 对比本周和上周的排名
   - 识别异动应用
   - 批量获取应用名称
   - 保存到 `all_rank_changes.csv`

## ⏱️ 执行时间

- **预计时间**：10-20 分钟（取决于 API 响应速度）
- **API 调用次数**：
  - 最热游戏：约 28 次 `/ranking` + 约 100-200 次 `/category/category_history`
  - 榜单异动：约 14 次 `/ranking` + 约 50-100 次 `/category/category_history`

## 🔍 与测试脚本的区别

| 特性 | 测试脚本 | 完整工作流 |
|------|---------|-----------|
| 品类范围 | 单个非Puzzle品类 | 所有品类 |
| 榜单类型 | 仅免费榜 | 免费榜 + 畅销榜 |
| 异动分析 | 仅免费榜 | 仅免费榜 |
| 输出文件 | 分别输出iOS/Android | 合并输出 |

## 📝 注意事项

1. **API 限制**：脚本中已添加适当的延迟（300-500ms），避免触发 API 限流
2. **错误处理**：单个品类或榜单失败不会影响整体执行
3. **文件编码**：CSV 文件使用 UTF-8 BOM 编码，确保 Excel 正确显示中文
4. **数据日期**：默认使用昨天的数据（`getDateString(1)`）

## 🐛 故障排除

### 问题：API Token 未找到
**解决**：检查 `.env` 文件是否存在且包含 `SENSORTOWER_API_TOKEN`

### 问题：category.json 未找到
**解决**：确保 `category.json` 文件存在于项目根目录

### 问题：部分品类数据为空
**可能原因**：
- API 返回空数据
- 品类ID不正确
- 日期数据不可用

**解决**：检查控制台输出的错误信息

### 问题：CSV 文件中文乱码
**解决**：使用支持 UTF-8 BOM 的编辑器（如 Excel、VS Code）打开文件

## 📚 相关文件

- `test_category_rankings.js` - 测试脚本：获取单个品类的排行榜
- `test_rank_changes.js` - 测试脚本：获取单个品类的榜单异动
- `category.json` - 品类配置文件
- `API_DOCUMENTATION.md` - API 详细文档
