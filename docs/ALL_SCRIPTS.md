# 所有脚本功能说明

本文档列出了项目中所有脚本的功能和使用方法。

---

## 📊 核心工作流脚本

### 1. `workflow_week_rank_changes.js` ⭐
**完整周度工作流脚本**

**功能**：一条命令完成所有步骤，获取每周 Top100 榜单和异动数据

**执行步骤**：
1. 抓取本周一 + 上周一的 Top100 榜单
2. 生成榜单异动
3. 拉取应用元数据
4. 拉取异动应用的下载/收益数据
5. 补全开发者信息和商店链接

**使用方法**：
```bash
node scripts/workflow_week_rank_changes.js 2026-02-09
```

---

## 🎯 Top100 榜单相关

### 2. `fetch_top100_to_db.js` ⭐
**获取 Top100 榜单数据**

**功能**：
- 从 SensorTower API 获取指定周一的 iOS/Android Top100 榜单
- 覆盖 Puzzle 品类（iOS: 7012, Android: game_puzzle）
- 覆盖 5 个国家：US, JP, GB, DE, IN
- 榜单类型：免费榜 + 畅销榜
- 自动获取应用名称并写入数据库

**使用方法**：
```bash
# 指定本周一日期
node scripts/fetch_top100_to_db.js 2026-02-09

# 不传参数（从起始日期到今天的每个周一都抓取）
node scripts/fetch_top100_to_db.js
```

**输出**：`apple_top100` / `android_top100` 表

---

### 3. `generate_rank_changes_from_db.js` ⭐
**生成榜单异动**

**功能**：
- 比对本周一和上周一的排名变化
- 识别异动类型：新进榜单、排名飙升、排名上升、排名下跌
- 生成异动榜单并写入数据库和 CSV

**使用方法**：
```bash
# 指定本周一日期
node scripts/generate_rank_changes_from_db.js 2026-02-09

# 不传参数（自动使用数据库中最新的两个周一）
node scripts/generate_rank_changes_from_db.js
```

**输出**：`rank_changes` 表 + `output/榜单异动.csv`

---

### 4. `fetch_all_hot_games_and_changes.js`
**获取所有品类的最热游戏和异动**

**功能**：
- 获取所有品类的免费榜和畅销榜 Top 100
- 获取所有品类的榜单异动
- 输出到 CSV 文件

**使用方法**：
```bash
node scripts/fetch_all_hot_games_and_changes.js
```

**输出**：`all_hot_games.csv` + `all_rank_changes.csv`

---

## 📱 应用元数据相关

### 5. `fetch_app_metadata_to_db.js` ⭐
**获取应用元数据**

**功能**：
- 从 `apple_top100` / `android_top100` 表读取 `app_id`
- 调用 SensorTower API 获取应用元数据
- 写入 `app_metadata` 表

**使用方法**：
```bash
# 获取所有平台
node scripts/fetch_app_metadata_to_db.js

# 只获取 iOS
node scripts/fetch_app_metadata_to_db.js ios

# 只获取 Android
node scripts/fetch_app_metadata_to_db.js android
```

**输出**：`app_metadata` 表

---

### 6. `refill_app_names.js`
**补全应用名称**

**功能**：
- 修复数据库中应用名称缺失或等于 app_id 的情况
- 调用 API 重新获取应用名称
- 更新 `apple_top100` / `android_top100` 表和 `app_name_cache` 表

**使用方法**：
```bash
node scripts/refill_app_names.js
```

---

### 7. `refill_app_metadata_url.js`
**补全应用元数据的商店链接**

**功能**：
- 为 `app_metadata` 表中缺失 `url` 的记录补全商店链接
- 根据 `app_id` 和平台自动生成链接

**使用方法**：
```bash
node scripts/refill_app_metadata_url.js
```

---

### 8. `build_app_cache_and_update_display.js`
**构建应用名称缓存和更新显示字段**

**功能**：
1. 从 `apple_top100` / `android_top100` 表提取应用名称，写入 `app_name_cache` 表
2. 为榜单表添加 `country_display` 和 `chart_type_display` 字段

**使用方法**：
```bash
node scripts/build_app_cache_and_update_display.js
```

---

## 💰 销售数据相关

### 9. `fetch_rank_changes_sales.js` ⭐
**获取异动应用的下载/收益数据**

**功能**：
- 从 `rank_changes` 表读取异动应用的 `app_id`
- 调用 SensorTower API 获取当周的下载量和收益数据
- 更新 `rank_changes` 表的 `downloads` 和 `revenue` 字段

**使用方法**：
```bash
# 指定本周一日期
node scripts/fetch_rank_changes_sales.js 2026-02-09

# 不传参数（使用 rank_changes 表中的日期）
node scripts/fetch_rank_changes_sales.js
```

---

### 10. `ai_sales_crawler.js`
**AI 产品销量爬虫**

**功能**：
- 根据 `data/ai_product.json` 中的产品名与 app_id
- 请求 SensorTower API 获取上周的销量数据
- 写入 CSV 文件

**使用方法**：
```bash
node scripts/ai_sales_crawler.js
```

**输出**：`ai_sales_estimates.csv`

---

### 11. `ai_sales_batch_crawler.js`
**AI 产品批量销量爬虫**

**功能**：批量爬取 AI 产品的销量数据

**使用方法**：
```bash
node scripts/ai_sales_batch_crawler.js
```

---

### 12. `ai_sales_estimates.js`
**AI 产品销量估算**

**功能**：估算 AI 产品的销量数据

**使用方法**：
```bash
node scripts/ai_sales_estimates.js
```

---

## 🏪 商店信息爬取相关

### 13. `fetch_google_play_store_info.js`
**爬取 Google Play 商店信息**

**功能**：
- 从 `android_top100` 表读取 `app_id`
- 使用 Playwright 爬取 Google Play 商店页面
- 解析并存储到 `gamestoreinfo` 表

**使用方法**：
```bash
# 爬取所有未爬取的应用
node scripts/fetch_google_play_store_info.js

# 只爬取前 10 个（测试）
node scripts/fetch_google_play_store_info.js 10
```

**输出**：`gamestoreinfo` 表

---

### 14. `weekly_us_free_top100_storeinfo.js` ⭐
**US Top100 商店信息爬取（含变更检测）**

**功能**：
- 获取 US 免费榜 Top100（Android + iOS）
- 爬取商店信息并写入 `gamestoreinfo` / `appstoreinfo` 表
- **自动检测变更**：对比新旧数据，如有变化写入 `gamestoreinfo_changes` / `appstoreinfo_changes` 表

**使用方法**：
```bash
# 默认爬取 100 个
node scripts/weekly_us_free_top100_storeinfo.js

# 指定日期
node scripts/weekly_us_free_top100_storeinfo.js --date 2026-02-09

# 限制数量
node scripts/weekly_us_free_top100_storeinfo.js --limit 50
```

**输出**：`gamestoreinfo` / `appstoreinfo` 表 + 变更记录

---

### 15. `weekly_new_top50_storeinfo.js`
**新进 Top50 商店信息爬取**

**功能**：
- 从 `rank_changes` 表筛选「新进 Top50」的前 3 个应用
- 爬取 Android/iOS 商店信息
- 写入 `gamestoreinfo` / `appstoreinfo` 表

**使用方法**：
```bash
node scripts/weekly_new_top50_storeinfo.js

# 指定日期
node scripts/weekly_new_top50_storeinfo.js --date 2026-02-09

# 指定数量
node scripts/weekly_new_top50_storeinfo.js --top 5
```

---

### 16. `weekly_free_chart_storeinfo.js`
**免费榜商店信息爬取**

**功能**：爬取免费榜应用的商店信息

**使用方法**：
```bash
node scripts/weekly_free_chart_storeinfo.js
```

---

### 17. `crawl_google_play.js`
**Google Play 页面解析模块**

**功能**：提供 Google Play 页面解析函数，供其他脚本调用

**导出函数**：`parseGooglePlayPage(html, appId)`

---

### 18. `crawl_appstore.js`
**App Store 页面解析模块**

**功能**：提供 App Store 页面解析函数，供其他脚本调用

**导出函数**：`parseAppStorePage(html)`

---

## 🔗 数据补全相关

### 19. `refill_rank_changes_publisher.js` ⭐
**补全异动表的开发者信息和商店链接**

**功能**：
- 从 `app_metadata` 表读取开发者名称
- 生成或补全商店链接
- 更新 `rank_changes` 表的 `publisher_name` 和 `store_url` 字段

**使用方法**：
```bash
node scripts/refill_rank_changes_publisher.js
```

---

### 20. `refill_rank_changes_store_url.js`
**补全异动表的商店链接**

**功能**：为 `rank_changes` 表补全商店链接

**使用方法**：
```bash
node scripts/refill_rank_changes_store_url.js
```

---

## 🏢 竞品监控相关

### 21. `fetch_competitor_dynamics_to_db.js`
**获取竞品动态数据**

**功能**：
- 从 SensorTower API 获取竞品公司的当前产品数
- 监控 iOS / Android / 总数
- 写入 `competitor_dynamics` 表

**使用方法**：
```bash
# 获取所有竞品数据
node scripts/fetch_competitor_dynamics_to_db.js

# 只测试一条
node scripts/fetch_competitor_dynamics_to_db.js test
```

**输出**：`competitor_dynamics` 表

---

### 22. `market_monitor_v1.6.js`
**市场趋势监测系统（Google Apps Script）**

**功能**：
- Google Sheets 插件脚本
- 监测 Puzzle 品类的市场趋势
- 竞品列表扩展到 136 家公司
- 生成周报并导出到 Google Doc

**使用场景**：在 Google Sheets 中使用

---

## 🧪 测试脚本

### 23. `test_category_rankings.js`
**测试品类排行榜获取**

**功能**：测试获取单个品类的排行榜数据

**使用方法**：
```bash
node scripts/test_category_rankings.js
```

---

### 24. `test_rank_changes.js`
**测试榜单异动生成**

**功能**：测试榜单异动生成功能

**使用方法**：
```bash
node scripts/test_rank_changes.js
```

---

### 25. `test_fetch_app_metadata.js`
**测试应用元数据获取**

**功能**：测试应用元数据获取功能

**使用方法**：
```bash
node scripts/test_fetch_app_metadata.js
```

---

### 26. `test_fetch_competitor_dynamics_one.js`
**测试竞品动态获取（单个）**

**功能**：测试单个竞品动态数据获取

**使用方法**：
```bash
node scripts/test_fetch_competitor_dynamics_one.js
```

---

### 27. `test_crawl_url.js`
**测试 URL 爬取**

**功能**：测试商店页面爬取功能

**使用方法**：
```bash
node scripts/test_crawl_url.js
```

---

## ☁️ 数据同步相关（Python）

### 28. `export_to_bitable.py`
**导出数据到飞书多维表格**

**功能**：
- 将 SQLite 数据库中的数据同步到飞书多维表格
- 支持多个表的同步配置
- 自动获取最新数据并同步

**使用方法**：
```bash
python scripts/export_to_bitable.py
```

**配置**：需要在脚本中配置飞书应用凭证和多维表格信息

---

### 29. `push_sensortower_db_to_s3.py`
**上传数据库到 S3**

**功能**：
- 将本地 `sensortower_top100.db` 上传到 AWS S3
- 生成预签名下载链接
- 支持 MinIO/OSS 等兼容 S3 的服务

**使用方法**：
```bash
python scripts/push_sensortower_db_to_s3.py --db data/sensortower_top100.db
```

**配置**：在 `.env` 中配置 AWS 凭证和 S3 信息

---

### 30. `fetch_sensortower_db.py`
**从远程下载数据库**

**功能**：
- 从远程地址下载最新的数据库文件
- 覆盖本地文件
- 支持 SHA256 校验和备份

**使用方法**：
```bash
python scripts/fetch_sensortower_db.py

# 指定 URL
python scripts/fetch_sensortower_db.py --url <下载地址>
```

**配置**：在 `.env` 中配置 `SENSORTOWER_DB_URL`

---

## 🔧 工具脚本

### 31. `fix_playwright.sh`
**修复 Playwright 安装**

**功能**：修复 Playwright 浏览器安装问题

**使用方法**：
```bash
bash scripts/fix_playwright.sh
```

---

## 📋 脚本分类总结

### 核心工作流（推荐使用）
- `workflow_week_rank_changes.js` - 完整周度工作流

### 榜单数据获取
- `fetch_top100_to_db.js` - 获取 Top100 榜单
- `generate_rank_changes_from_db.js` - 生成异动榜单
- `fetch_all_hot_games_and_changes.js` - 获取所有品类数据

### 应用元数据
- `fetch_app_metadata_to_db.js` - 获取应用元数据
- `refill_app_names.js` - 补全应用名称
- `refill_app_metadata_url.js` - 补全商店链接
- `build_app_cache_and_update_display.js` - 构建缓存

### 销售数据
- `fetch_rank_changes_sales.js` - 获取下载/收益数据
- `ai_sales_crawler.js` - AI 产品销量爬虫
- `ai_sales_batch_crawler.js` - AI 产品批量爬虫
- `ai_sales_estimates.js` - AI 产品销量估算

### 商店信息爬取
- `fetch_google_play_store_info.js` - Google Play 爬虫
- `weekly_us_free_top100_storeinfo.js` - US Top100 商店信息（含变更检测）
- `weekly_new_top50_storeinfo.js` - 新进 Top50 商店信息
- `weekly_free_chart_storeinfo.js` - 免费榜商店信息
- `crawl_google_play.js` - Google Play 解析模块
- `crawl_appstore.js` - App Store 解析模块

### 数据补全
- `refill_rank_changes_publisher.js` - 补全开发者信息
- `refill_rank_changes_store_url.js` - 补全商店链接

### 竞品监控
- `fetch_competitor_dynamics_to_db.js` - 获取竞品动态
- `market_monitor_v1.6.js` - Google Sheets 市场监测

### 数据同步
- `export_to_bitable.py` - 导出到飞书多维表格
- `push_sensortower_db_to_s3.py` - 上传到 S3
- `fetch_sensortower_db.py` - 从远程下载

### 测试脚本
- `test_*.js` - 各种测试脚本

---

## 🚀 快速开始推荐

### 获取每周数据（完整流程）
```bash
node scripts/workflow_week_rank_changes.js 2026-02-09
```

### 分步执行
```bash
# 1. 获取 Top100 榜单
node scripts/fetch_top100_to_db.js 2026-02-09

# 2. 生成异动榜单
node scripts/generate_rank_changes_from_db.js 2026-02-09

# 3. 获取应用元数据
node scripts/fetch_app_metadata_to_db.js

# 4. 获取下载/收益数据
node scripts/fetch_rank_changes_sales.js 2026-02-09

# 5. 补全开发者信息
node scripts/refill_rank_changes_publisher.js
```

---

## 📝 注意事项

1. **环境变量**：大部分脚本需要 `.env` 文件中配置 `SENSORTOWER_API_TOKEN`
2. **数据库路径**：默认使用 `data/sensortower_top100.db`，可通过环境变量 `SENSORTOWER_DB_FILE` 覆盖
3. **依赖安装**：爬虫脚本需要安装 Playwright：`npx playwright install chromium`
4. **日期格式**：所有日期参数格式为 `YYYY-MM-DD`，且必须是周一

---

## 📚 相关文档

- [使用指南：获取每周 Top100 榜单和异动榜单](USAGE_GUIDE.md)
- [第4步和第5步使用指南](STEP4_STEP5_USAGE.md)
- [商店信息表说明](STORINFO_TABLES.md)
- [变更表说明](STORINFO_CHANGES.md)
