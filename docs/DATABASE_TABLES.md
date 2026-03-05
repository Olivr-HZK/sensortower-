# 当前数据库表说明

当前主数据库文件：**`data/sensortower_top100.db`**。下表列出其中各张表的用途与数据来源。

---

## 榜单与异动（Top100 工作流）

| 表名 | 用途 | 数据来源 / 脚本 |
|------|------|------------------|
| **apple_top100** | 存 iOS 指定国家、指定周一的 Top100 榜单（免费榜/畅销榜等），含 rank、app_id、app_name、downloads、revenue | `fetch_top100_to_db.js` 拉取 SensorTower ranking API |
| **android_top100** | 同上，Android 端 Top100 | `fetch_top100_to_db.js` |
| **rank_changes** | 榜单异动：本周 vs 上周的排名变化（新进、飙升、上升、下跌等），含 app_name、app_id、country、platform、downloads、revenue、publisher_name、store_url | `generate_rank_changes_from_db.js` 比对两个 top100 表；downloads/revenue 由 `fetch_top100_sales.js`、`fetch_rank_changes_sales.js` 写入 |

---

## 应用元数据与名称缓存

| 表名 | 用途 | 数据来源 / 脚本 |
|------|------|------------------|
| **app_metadata** | 应用元数据（name、publisher_name、url 等），按 (app_id, os) 存储；Top100 工作流与 App 列表工作流都会写入/更新 | `fetch_app_metadata_to_db.js`（从 Top100 取 app_id）、`fetch_applist_metadata_to_db.js`（从 appid_list.json 取 app_id） |
| **app_name_cache** | app_id + platform → 显示名称的缓存，供榜单/异动展示用 | `update_app_names_from_metadata.js`、`build_app_cache_and_update_display.js` 从 app_metadata 同步 |

---

## 商店信息爬取（Play / App Store 页面）

| 表名 | 用途 | 数据来源 / 脚本 |
|------|------|------------------|
| **gamestoreinfo** | Google Play 商店页爬下来的信息：标题、评分、安装量、开发者、分类、描述、截图等 | 各 storeinfo 爬虫（如 `weekly_us_free_top100_storeinfo.js`、`fetch_google_play_store_info.js`） |
| **gamestoreinfo_changes** | 记录 gamestoreinfo 的变更（某次爬取与上次的差异） | `weekly_us_free_top100_storeinfo.js` 等在做变更检测时写入 |
| **appstoreinfo** | App Store 商店页爬下来的信息：名称、副标题、价格、评分、年龄分级等 | 同上，针对 iOS app_id |
| **appstoreinfo_changes** | 记录 appstoreinfo 的变更 | 同上，变更检测时写入 |

---

## 竞品分析

| 表名 | 用途 | 数据来源 / 脚本 |
|------|------|------------------|
| **competitor_dynamics** | 竞品整体动态（某次拉取时某开发商的 iOS/Android 应用数量等） | `fetch_competitor_dynamics_to_db.js` |
| **competitor_apps** | 竞品应用列表（unified_app_id、unified_app_name、platform、app_id 等） | `fetch_competitor_dynamics_to_db.js` |

---

## App 列表周报（若用同一 DB）

若 **App 列表周报工作流** 使用同一数据库（默认即 `sensortower_top100.db`），还会多一张表：

| 表名 | 用途 | 数据来源 / 脚本 |
|------|------|------------------|
| **app_list_weekly_sales** | 自定义 app 列表的「上周」「上上周」按国家汇总的 downloads、revenue；主键 (app_id, platform, country, week_start) | `fetch_applist_sales_to_db.js`（数据来自 `appid_list.json`） |

若改用**新数据库**（见下），则 `app_list_weekly_sales` 与相关 `app_metadata` 只存在于新库中。

---

## 新数据库文件（App 列表专用，可选）

已为你新建：**`data/sensortower_applist.db`**。

其中只包含 App 列表工作流需要的表：

- **app_metadata**：仅存从 `appid_list.json` 拉取的应用元数据
- **app_list_weekly_sales**：仅存这些 app 的上周/上上周 revenue、downloads

使用方式：在跑 App 列表工作流前设置环境变量，指向新库即可，例如：

```bash
export SENSORTOWER_DB_FILE=data/sensortower_applist.db
node scripts/workflow_applist_weekly.js
```

这样 Top100、异动、商店爬取等仍用 `sensortower_top100.db`，App 列表周报单独用 `sensortower_applist.db`，两库互不影响。
