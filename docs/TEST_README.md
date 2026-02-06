# 品类排行榜测试脚本

## 功能

- 从 `category.json` 中选取 **Puzzle 之外** 的品类：
  - **iOS**：取第一个非 Puzzle 品类（当前为 Games/Casual，ID 7003）
  - **Android**：取第一个非 Puzzle 品类（当前为 game_casual）
- 仅拉取 **美国（US）** 的 **免费榜** Top 100
- 调用 SensorTower API：`/ranking` + `/category/category_history` 获取排名和应用名称
- 结果写入本地 **`test_rankings_us.csv`**（UTF-8 带 BOM，Excel 可正确打开）

## 运行

```bash
# 确保 .env 中已配置 SENSORTOWER_API_TOKEN
node test_category_rankings.js
```

## 输出 CSV 列

| 列名     | 说明       |
|----------|------------|
| 平台     | iOS / Android |
| 品类ID   | 如 7003、game_casual |
| 品类名称 | 如 Games/Casual |
| 榜单类型 | 免费榜     |
| 国家     | US         |
| 排名     | 1–100      |
| App ID   | 应用 ID    |
| 应用名称 | 从 API 获取的名称 |

## 依赖

- Node.js（无额外 npm 包，仅使用内置 `fs`、`path`、`https`）
- `.env` 中配置 `SENSORTOWER_API_TOKEN`
- 同目录下存在 `category.json`

## 修改所选品类

编辑 `category.json` 中 `ios` / `android` 下各品类顺序即可；脚本会取 **第一个非 Puzzle 的品类**。  
若希望固定为某个品类，可修改 `pickNonPuzzleCategory` 或传参指定品类 ID。
