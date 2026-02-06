# 异动榜单在 Google 表格中实现「可点击应用名称」

与 `market_monitor_v1.6.js` 中写入 Google 表格时的效果一致：应用名称可点击，跳转到 App Store / Google Play。

## 原理（market_monitor 的做法）

- **商店链接**  
  - iOS：`https://apps.apple.com/app/id` + appId  
  - Android：`https://play.google.com/store/apps/details?id=` + appId  

- **可点击单元格**：用公式 `=HYPERLINK("链接", "显示文字")` 写入单元格，例如：  
  `=HYPERLINK("https://apps.apple.com/app/id123","游戏名")`

## 本项目的做法

1. **CSV / 数据库**  
   - `generate_rank_changes_from_db.js` 已输出 **商店链接** 列（以及 DB 中 `rank_changes.store_url`）。  
   - 榜单异动 CSV 列顺序中包含「商店链接」一列。

2. **导入到 Google 表格后得到可点击名称**  
   - 把 `榜单异动.csv` 导入到 Google 表格（文件 → 导入 → 上传）。  
   - 假设：**B 列 = 应用名称**，**K 列 = 商店链接**（按你实际列号调整）。  
   - 在「应用名称」列右侧插入一列，例如在 C 列第一行数据行输入：  
     `=HYPERLINK(K2,B2)`  
   - 向下拖动填充整列。  
   - 可将原 B 列「应用名称」隐藏，用 C 列作为可点击的应用名称列。

若你的 CSV 列顺序不同，把上面公式里的 `K2` 换成商店链接所在列、`B2` 换成应用名称所在列即可。

## 已有数据补全

若之前生成的异动没有「商店链接」列，可运行：

```bash
node refill_rank_changes_publisher.js
```

会同时补全 `publisher_name` 和 `store_url`。之后重新导出 CSV 或在表格中从 DB 再导出一份，即可按上面步骤做可点击名称。
