# Google Play 商店信息爬取脚本

## 功能说明

`fetch_google_play_store_info.js` 脚本从数据库 `android_top100` 表中读取游戏的 `app_id`，批量爬取 Google Play 商店页面信息，并将解析后的数据存入 `gamestoreinfo` 表。

## 使用方法

### 1. 安装依赖

确保已安装 Playwright：

```bash
npm install
npx playwright install chromium
```

### 2. 运行脚本

```bash
# 爬取所有未爬取的游戏（从 android_top100 读取）
node scripts/fetch_google_play_store_info.js

# 只爬取前 10 个游戏（用于测试）
node scripts/fetch_google_play_store_info.js 10
```

## 数据库表结构

### gamestoreinfo 表

| 字段 | 类型 | 说明 |
|------|------|------|
| app_id | TEXT (PK) | 应用 ID（来自 android_top100） |
| package_id | TEXT | 包名 |
| title | TEXT | 应用名称 |
| rating | REAL | 评分（0-5） |
| installs | TEXT | 安装量（如 "100,000,000+"） |
| developer | TEXT | 开发者/发行商 |
| category | TEXT | 分类（如 "动作"） |
| category_id | TEXT | 分类 ID |
| short_description | TEXT | 短描述 |
| full_description | TEXT | 完整描述 |
| content_rating | TEXT | 年龄分级（如 "18 岁以上"） |
| content_rating_labels | TEXT | 内容标签（JSON 数组） |
| price_type | TEXT | 购买类型（购买/安装/免费） |
| store_url | TEXT | 商店链接 |
| icon_url | TEXT | 图标 URL |
| screenshot_urls | TEXT | 截图 URL 列表（JSON 数组） |
| video_thumbnail_url | TEXT | 视频缩略图 URL |
| video_id | TEXT | 视频 ID |
| similar_app_ids | TEXT | 类似应用 ID 列表（JSON 数组） |
| event_end_time | TEXT | 活动结束时间 |
| crawled_at | TEXT | 爬取时间 |
| updated_at | TEXT | 更新时间 |

## 工作流程

1. **读取数据源**：
   - 从 `android_top100` 表获取去重的 `app_id` 列表
   - 通过 JOIN `app_metadata` 表获取对应的 `url`（只处理 `os='android'` 且有 `url` 的记录）
2. **过滤已爬取**：检查 `gamestoreinfo` 表，跳过已爬取的应用
3. **批量爬取**：
   - 使用从 `app_metadata` 获取的 `url` 访问 Google Play 页面
   - 使用 Playwright 打开页面
   - 解析页面中的 `AF_initDataCallback(ds:4)` 数据
   - 提取应用信息
4. **保存数据**：将解析结果存入 `gamestoreinfo` 表

## 数据依赖

脚本依赖 `app_metadata` 表中的 `url` 字段：
- 确保已运行 `fetch_app_metadata_to_db.js android` 来填充 `app_metadata` 表
- 只有 `os='android'` 且 `url IS NOT NULL` 的应用才会被爬取

## 注意事项

- **请求频率**：每个请求间隔 2 秒，避免被封
- **错误处理**：爬取失败的应用会记录但不会中断整个流程
- **数据更新**：使用 `INSERT OR REPLACE`，重复运行会更新已存在的数据
- **网络要求**：需要能访问 Google Play 商店

## 示例输出

```
初始化 gamestoreinfo 表...
从 android_top100 读取 app_id...
共找到 487 个 app_id
已爬取 0 个，待爬取 487 个
[1/487] 爬取: com.block.juggle (已用时: 5s, 预计剩余: 2435s)
  ✓ 成功: Block Puzzle (4.5⭐)
[2/487] 爬取: com.ecffri.arrows (已用时: 8s, 预计剩余: 2424s)
  ✓ 成功: Arrows.io (4.2⭐)
...
完成！成功: 485, 失败: 2, 总用时: 1620s
```

## 相关脚本

- `crawl_google_play.js` - 单个应用的爬取和解析逻辑
- `fetch_top100_to_db.js` - 将 Top100 榜单数据写入数据库
