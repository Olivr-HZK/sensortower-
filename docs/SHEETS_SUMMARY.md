# 📊 Google Sheets 工作表快速参考

## 📋 工作表列表（共10张）

| # | 工作表名称 | 列数 | 主要 API | 调用次数 | 数据来源 |
|---|-----------|------|---------|---------|---------|
| 1 | `iOS Top Charts` | 7 | `/ranking`<br>`/category/category_history` | ~20-30次 | SensorTower API |
| 2 | `Android Top Charts` | 7 | `/ranking`<br>`/category/category_history` | ~20-30次 | SensorTower API |
| 3 | `📈 榜单异动` | 9 | `/ranking`<br>`/category/category_history` | ~25-35次 | 对比本周/上周 |
| 4 | `📈 起量产品` | 8 | `/sales_report_estimates_comparison_attributes` | 1次 | SensorTower API |
| 5 | `👀 竞品动态` | 6 | `/unified/publishers/apps` | 136次 | SensorTower API |
| 6 | `📦 竞品App库` | 7 | `/unified/publishers/apps` | 136次（首次） | SensorTower API |
| 7 | `🆕 竞品新品` | 7 | `/unified/publishers/apps` | 136次（每次） | 对比基准库 |
| 8 | `📅 历史新品` | 7 | `/apps/{appId}` | 数千次（分批） | 基准库 + API |
| 9 | `📊 起量分析` | 17 | `/sales_report_estimates` | 数百次（分批） | 历史新品 + API |
| 10 | `📊 周报汇总` | 动态 | 无 | 0次 | 从其他表读取 |

---

## 📊 工作表详细信息

### 1️⃣ iOS Top Charts
- **列**：排名、App ID、应用名称、国家、榜单类型、平台、抓取日期
- **API**：`/ios/ranking` + `/ios/category/category_history`
- **数据**：Top 100（免费榜+畅销榜）× 5个国家

### 2️⃣ Android Top Charts
- **列**：排名、App ID、应用名称、国家、榜单类型、平台、抓取日期
- **API**：`/android/ranking` + `/android/category/category_history`
- **数据**：Top 100（免费榜+畅销榜）× 5个国家

### 3️⃣ 📈 榜单异动
- **列**：信号、应用名称、App ID、国家、平台、本周排名、上周排名、变化、异动类型
- **API**：`/ranking`（本周+上周）+ `/category/category_history`
- **数据**：新进榜单、排名飙升、排名上升、排名下跌

### 4️⃣ 📈 起量产品
- **列**：信号、应用名称、App ID、发行商、日均下载、周环比、国家、平台
- **API**：`/sales_report_estimates_comparison_attributes`
- **数据**：Top 50 起量产品（iOS，美国）

### 5️⃣ 👀 竞品动态
- **列**：备注、公司名称、Publisher ID、iOS产品数、Android产品数、总产品数
- **API**：`/unified/publishers/apps`
- **数据**：136家竞品公司的产品统计

### 6️⃣ 📦 竞品App库
- **列**：App ID、应用名称、公司名称、备注、平台、首次发现日期、商店链接
- **API**：`/unified/publishers/apps`
- **数据**：所有竞品 App（基准库）

### 7️⃣ 🆕 竞品新品
- **列**：发现日期、应用名称、App ID、公司名称、备注、平台、商店链接
- **API**：`/unified/publishers/apps`
- **数据**：新发现的竞品产品

### 8️⃣ 📅 历史新品
- **列**：发布日期、应用名称、App ID、公司名称、备注、平台、商店链接
- **API**：`/apps/{appId}`
- **数据**：最近60天发布的新品

### 9️⃣ 📊 起量分析
- **列**：应用名称、App ID、公司名称、备注、平台、发布日期、5个地区的起量日和峰值、首个起量地区
- **API**：`/sales_report_estimates`
- **数据**：起量产品详细分析（5个地区）

### 🔟 📊 周报汇总
- **列**：动态（多行多列）
- **API**：无
- **数据**：从「📈 榜单异动」表汇总

---

## 🔄 数据流向图

```
┌─────────────────────────────────────────┐
│  SensorTower API                        │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
┌─────────────┐  ┌──────────────┐
│ 榜单数据    │  │ 竞品数据     │
│ - iOS/      │  │ - 竞品动态   │
│   Android   │  │ - App库      │
│   Top Charts│  │ - 新品       │
└──────┬──────┘  └──────┬───────┘
       │                │
       │                ▼
       │         ┌──────────────┐
       │         │ 历史新品     │
       │         │ (扫描)       │
       │         └──────┬───────┘
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────┐
│ 榜单异动    │  │ 起量分析     │
│ (对比分析)  │  │ (下载量分析) │
└──────┬──────┘  └──────────────┘
       │
       ▼
┌─────────────┐
│ 周报汇总    │
│ (汇总展示)  │
└─────────────┘
```

---

## 📈 API 调用频率汇总

### 日常使用（updateAllData）
- **总调用**：~65-95次
- `/ranking`: ~20次
- `/category/category_history`: ~45-75次

### 竞品监控（fetchNewReleases）
- **总调用**：136次
- `/unified/publishers/apps`: 136次

### 历史新品扫描
- **总调用**：数千次（分批）
- `/apps/{appId}`: 基准库大小 × 1次

### 起量分析
- **总调用**：数百次（分批）
- `/sales_report_estimates`: 历史新品数量 × 5次

---

## 💡 快速查找

### 按功能查找工作表

| 功能 | 工作表 |
|------|--------|
| 查看榜单排名 | iOS Top Charts, Android Top Charts |
| 分析排名变化 | 📈 榜单异动 |
| 识别起量产品 | 📈 起量产品, 📊 起量分析 |
| 监控竞品 | 👀 竞品动态, 📦 竞品App库, 🆕 竞品新品 |
| 扫描新品 | 📅 历史新品 |
| 查看周报 | 📊 周报汇总 |

### 按 API 查找工作表

| API | 工作表 |
|-----|--------|
| `/ranking` | iOS Top Charts, Android Top Charts, 📈 榜单异动 |
| `/category/category_history` | iOS Top Charts, Android Top Charts, 📈 榜单异动 |
| `/sales_report_estimates_comparison_attributes` | 📈 起量产品 |
| `/sales_report_estimates` | 📊 起量分析 |
| `/apps/{appId}` | 📅 历史新品 |
| `/unified/publishers/apps` | 👀 竞品动态, 📦 竞品App库, 🆕 竞品新品 |

---

## 📚 相关文档

- [完整工作表文档](./SHEETS_DOCUMENTATION.md)
- [API 调用文档](./API_DOCUMENTATION.md)
- [快速开始指南](./QUICK_START.md)
