# 📡 SensorTower API 调用总结

## 🎯 快速概览

本系统共使用 **6 个** SensorTower API 接口：

| # | API 端点 | 用途 | 调用位置 |
|---|---------|------|---------|
| 1 | `/ranking` | 获取应用排行榜 | Top Charts、榜单异动分析 |
| 2 | `/category/category_history` | 批量获取应用名称 | 应用名称显示 |
| 3 | `/sales_report_estimates_comparison_attributes` | 下载量对比数据 | 起量产品识别 |
| 4 | `/sales_report_estimates` | 每日下载量数据 | 起量分析 |
| 5 | `/apps/{appId}` | 应用详情（发布日期） | 历史新品扫描 |
| 6 | `/unified/publishers/apps` | 发行商所有应用 | 竞品监控 |

---

## 📋 详细说明

### 1️⃣ `/ranking` - 排行榜数据

**作用**：获取指定日期、国家、品类的应用排行榜

**使用场景**：
- ✅ 获取 Top Charts 榜单（免费榜/畅销榜）
- ✅ 对比本周与上周排名变化
- ✅ 识别新进榜单和排名异动

**调用示例**：
```javascript
// iOS 免费榜
/ios/ranking?category=7012&chart_type=topfreeapplications&country=US&date=2026-02-02

// Android 畅销榜
/android/ranking?category=game_puzzle&chart_type=topgrossing&country=JP&date=2026-02-02
```

**返回**：App ID 数组（按排名顺序）

---

### 2️⃣ `/category/category_history` - 应用名称

**作用**：批量获取应用名称（通过 App ID）

**使用场景**：
- ✅ 将 App ID 转换为可读的应用名称
- ✅ 批量查询（每批最多30个）

**调用示例**：
```javascript
/ios/category/category_history?app_ids=123456789,987654321&category=7012&chart_type_ids=topfreeapplications&countries=US
```

**返回**：应用名称映射表

---

### 3️⃣ `/sales_report_estimates_comparison_attributes` - 下载量对比

**作用**：获取下载量对比数据（周环比）

**使用场景**：
- ✅ 识别起量产品
- ✅ 分析下载量变化趋势

**调用示例**：
```javascript
/ios/sales_report_estimates_comparison_attributes?category=7012&countries=US&date=2026-02-02&limit=50
```

**返回**：应用列表（包含下载量和变化率）

**⚠️ 注意**：需要高级 API 订阅

---

### 4️⃣ `/sales_report_estimates` - 每日下载量

**作用**：获取应用的历史每日下载量数据

**使用场景**：
- ✅ 分析起量信号（首次突破阈值）
- ✅ 计算峰值下载量
- ✅ 判断首个起量地区

**调用示例**：
```javascript
/ios/sales_report_estimates?app_ids=123456789&countries=US&date_granularity=daily&start_date=2025-12-05&end_date=2026-02-02
```

**返回**：每日下载量数组

**数据处理**：
- iOS: `iu` (iPhone) + `au` (iPad)
- Android: `u` (units)
- 阈值：美国/日本/英国/德国 ≥ 2000，印度 ≥ 5000

**⚠️ 注意**：需要高级 API 订阅

---

### 5️⃣ `/apps/{appId}` - 应用详情

**作用**：获取应用的详细信息（包括发布日期）

**使用场景**：
- ✅ 获取应用发布日期
- ✅ 判断是否为新品（最近60天）
- ✅ 扫描历史新品

**调用示例**：
```javascript
/ios/apps/123456789
```

**返回**：应用详情（包含 `release_date` 时间戳）

---

### 6️⃣ `/unified/publishers/apps` - 发行商应用列表

**作用**：获取发行商的所有应用（iOS + Android）

**使用场景**：
- ✅ 获取竞品公司的所有产品
- ✅ 建立竞品 App 基准库
- ✅ 检测新品上线
- ✅ 统计公司产品数量

**调用示例**：
```javascript
/unified/publishers/apps?unified_id=5b6de3cab80f52168dc0abc3
```

**返回**：应用列表（包含 iOS 和 Android 应用）

**数据处理**：
- 遍历所有应用
- 分别处理 iOS 和 Android
- 建立 App ID 映射表

---

## 📊 调用频率

### 日常使用（updateAllData）
- `/ranking`: ~20次
- `/category/category_history`: ~10-20次

### 竞品监控（fetchNewReleases）
- `/unified/publishers/apps`: 136次（136家竞品公司）

### 历史新品扫描（scanHistoricalNewApps）
- `/apps/{appId}`: ~数千次（取决于基准库大小）

### 起量分析（analyzeRisingApps）
- `/sales_report_estimates`: ~数百次（每个App × 5个地区）

---

## 🔒 权限要求

### 基础权限（必需）
✅ `/ranking`  
✅ `/category/category_history`  
✅ `/apps/{appId}`  
✅ `/unified/publishers/apps`

### 高级权限（可选）
⚠️ `/sales_report_estimates_comparison_attributes`  
⚠️ `/sales_report_estimates`

**注意**：没有高级权限时，起量相关功能可能无法使用。

---

## ⚡ 性能优化

- ✅ 批量处理（应用名称：30个/批，扫描：1000个/批）
- ✅ 请求延迟（150-400ms，避免限流）
- ✅ 错误处理（统一格式，失败不影响其他请求）
- ✅ 进度跟踪（支持断点续传）

---

## 📚 相关文档

- [完整 API 文档](./API_DOCUMENTATION.md)
- [配置说明](./CONFIG.md)
- [快速开始](./QUICK_START.md)
