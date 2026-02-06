# 📡 SensorTower API 调用文档

## 📋 概述

本系统共调用了 **6 个** SensorTower API 接口，用于不同的数据获取和分析功能。

**API 基础地址**：`https://api.sensortower.com/v1`

---

## 🔍 API 列表

### 1. `/ranking` - 获取应用排行榜

**调用位置**：
- `fetchTopCharts()` - 获取 Top Charts 榜单
- `analyzeRankChanges()` - 分析榜单异动
- `testAPIConnection()` - 测试 API 连接

**完整路径**：
```
GET /{platform}/ranking
```

**平台支持**：
- iOS: `/ios/ranking`
- Android: `/android/ranking`

**请求参数**：
```javascript
{
  category: "7012",                    // iOS: "7012" (Puzzle), Android: "game_puzzle"
  chart_type: "topfreeapplications",   // iOS: "topfreeapplications" | "topgrossingapplications"
                                       // Android: "topselling_free" | "topgrossing"
  country: "US",                       // 国家代码: US, JP, GB, DE, IN
  date: "2026-02-02",                  // 日期格式: YYYY-MM-DD
  auth_token: "your_token"
}
```

**返回数据**：
```json
{
  "ranking": ["app_id_1", "app_id_2", ...]  // App ID 数组，按排名顺序
}
```

**用途**：
- ✅ 获取指定日期、国家、品类的应用排行榜
- ✅ 对比不同日期的排名变化
- ✅ 识别新进榜单和排名异动的应用

**调用示例**：
```javascript
// iOS 免费榜
callAPI("/ranking", {
  category: "7012",
  chart_type: "topfreeapplications",
  country: "US",
  date: "2026-02-02"
}, "ios");

// Android 畅销榜
callAPI("/ranking", {
  category: "game_puzzle",
  chart_type: "topgrossing",
  country: "JP",
  date: "2026-02-02"
}, "android");
```

---

### 2. `/category/category_history` - 获取应用名称

**调用位置**：
- `fetchAppNames()` - 批量获取应用名称

**完整路径**：
```
GET /{platform}/category/category_history
```

**平台支持**：
- iOS: `/ios/category/category_history`
- Android: `/android/category/category_history`

**请求参数**：
```javascript
{
  app_ids: "id1,id2,id3",              // 多个 App ID，逗号分隔（最多30个）
  category: "7012",                    // 品类 ID
  chart_type_ids: "topfreeapplications", // 榜单类型
  countries: "US",                     // 国家代码
  auth_token: "your_token"
}
```

**返回数据**：
```json
{
  "app_id_1": {
    "US": {
      "7012": {
        "topfreeapplications": {
          "name": "应用名称",
          "humanized_app_name": "应用名称（格式化）"
        }
      }
    }
  },
  ...
}
```

**用途**：
- ✅ 批量获取应用名称（用于显示）
- ✅ 通过 App ID 获取应用的可读名称
- ✅ 支持批量查询（每批最多30个）

**调用示例**：
```javascript
callAPI("/category/category_history", {
  app_ids: "123456789,987654321",
  category: "7012",
  chart_type_ids: "topfreeapplications",
  countries: "US"
}, "ios");
```

**注意事项**：
- ⚠️ 每批最多30个 App ID
- ⚠️ 批量调用之间有 400ms 延迟，避免限流

---

### 3. `/sales_report_estimates_comparison_attributes` - 下载量对比数据

**调用位置**：
- `identifyRisingApps()` - 起量产品识别

**完整路径**：
```
GET /{platform}/sales_report_estimates_comparison_attributes
```

**平台支持**：
- iOS: `/ios/sales_report_estimates_comparison_attributes`
- Android: `/android/sales_report_estimates_comparison_attributes`

**请求参数**：
```javascript
{
  category: "7012",                    // 品类 ID
  countries: "US",                     // 国家代码
  date: "2026-02-02",                 // 日期
  limit: 50,                          // 返回数量限制
  auth_token: "your_token"
}
```

**返回数据**：
```json
[
  {
    "app_id": "123456789",
    "name": "应用名称",
    "publisher": "发行商名称",
    "units": 10000,                    // 下载量
    "downloads": 10000,                // 下载量（备用字段）
    "change": "+20%"                   // 周环比变化
  },
  ...
]
```

**用途**：
- ✅ 识别起量产品（下载量高的应用）
- ✅ 获取下载量对比数据
- ✅ 分析周环比变化

**调用示例**：
```javascript
callAPI("/sales_report_estimates_comparison_attributes", {
  category: "7012",
  countries: "US",
  date: "2026-02-02",
  limit: 50
}, "ios");
```

**注意事项**：
- ⚠️ 需要高级 API 订阅才能使用
- ⚠️ 目前仅支持 iOS 平台

---

### 4. `/sales_report_estimates` - 每日下载量数据

**调用位置**：
- `getDailyDownloads()` - 获取每日下载数据（用于起量分析）

**完整路径**：
```
GET /{platform}/sales_report_estimates
```

**平台支持**：
- iOS: `/ios/sales_report_estimates`
- Android: `/android/sales_report_estimates`

**请求参数**：
```javascript
{
  app_ids: "123456789",                // 单个 App ID
  countries: "US",                     // 国家代码
  date_granularity: "daily",           // 时间粒度：daily
  start_date: "2025-12-05",            // 开始日期（60天前）
  end_date: "2026-02-02",              // 结束日期（昨天）
  auth_token: "your_token"
}
```

**返回数据**：
```json
[
  {
    "aid": "123456789",                 // App ID
    "cc": "US",                         // 国家代码
    "d": "2026-02-01T00:00:00Z",        // 日期
    "iu": 5000,                         // iOS: iPhone 下载量
    "au": 1000,                         // iOS: iPad 下载量
    "u": 6000                           // Android: 总下载量
  },
  ...
]
```

**用途**：
- ✅ 获取应用的历史每日下载量
- ✅ 分析起量信号（首次突破阈值）
- ✅ 计算峰值下载量
- ✅ 判断首个起量地区

**调用示例**：
```javascript
// 直接调用（不使用 callAPI 封装）
var url = "https://api.sensortower.com/v1/ios/sales_report_estimates"
        + "?app_ids=123456789"
        + "&countries=US"
        + "&date_granularity=daily"
        + "&start_date=2025-12-05"
        + "&end_date=2026-02-02"
        + "&auth_token=your_token";
```

**数据处理**：
- iOS: 总下载量 = `iu` (iPhone) + `au` (iPad)
- Android: 总下载量 = `u` (units)
- 阈值：美国/日本/英国/德国 ≥ 2000，印度 ≥ 5000

**注意事项**：
- ⚠️ 需要高级 API 订阅
- ⚠️ 每个 App 调用 5 次（5个地区）
- ⚠️ 调用之间有 200ms 延迟

---

### 5. `/apps/{appId}` - 获取应用详情

**调用位置**：
- `getAppReleaseDate()` - 获取应用发布日期

**完整路径**：
```
GET /{platform}/apps/{appId}
```

**平台支持**：
- iOS: `/ios/apps/{appId}`
- Android: `/android/apps/{appId}`

**请求参数**：
```javascript
{
  auth_token: "your_token"
}
```

**返回数据**：
```json
{
  "release_date": 1234567890000,       // 发布日期（毫秒时间戳）
  "name": "应用名称",
  "publisher": "发行商",
  ...
}
```

**用途**：
- ✅ 获取应用的发布日期
- ✅ 判断是否为新品（最近60天发布）
- ✅ 扫描历史新品

**调用示例**：
```javascript
// 直接调用
var url = "https://api.sensortower.com/v1/ios/apps/123456789"
        + "?auth_token=your_token";
```

**数据处理**：
- 将时间戳转换为日期
- 判断是否在最近60天内发布
- 筛选出新品

**注意事项**：
- ⚠️ 每个 App 调用一次
- ⚠️ 调用之间有 150ms 延迟
- ⚠️ 分批处理（每批1000个），避免超时

---

### 6. `/unified/publishers/apps` - 获取发行商的所有应用

**调用位置**：
- `callUnifiedPublisherApps()` - 获取竞品公司的所有 App
- `fetchCompetitorApps()` - 竞品公司动态
- `fetchNewReleases()` - 竞品新品上线
- `continueRemainingCompetitors()` - 继续跑剩余竞品

**完整路径**：
```
GET /unified/publishers/apps
```

**平台支持**：
- ✅ 统一接口，同时返回 iOS 和 Android 应用

**请求参数**：
```javascript
{
  unified_id: "5b6de3cab80f52168dc0abc3",  // 发行商的 Unified ID
  auth_token: "your_token"
}
```

**返回数据**：
```json
{
  "apps": [
    {
      "unified_app_name": "应用名称",
      "ios_apps": [
        {
          "app_id": "123456789",
          "app_name": "iOS 应用名称"
        }
      ],
      "android_apps": [
        {
          "app_id": "com.example.app",
          "app_name": "Android 应用名称"
        }
      ]
    },
    ...
  ]
}
```

**用途**：
- ✅ 获取发行商的所有应用（iOS + Android）
- ✅ 建立竞品 App 基准库
- ✅ 检测新品上线
- ✅ 统计公司产品数量

**调用示例**：
```javascript
callUnifiedPublisherApps("5b6de3cab80f52168dc0abc3");
```

**数据处理**：
- 遍历所有应用
- 分别处理 iOS 和 Android 应用
- 建立 App ID 映射表
- 对比发现新品

**注意事项**：
- ⚠️ 每个发行商调用一次
- ⚠️ 调用之间有 300ms 延迟
- ⚠️ 支持 136 家竞品公司

---

## 📊 API 调用统计

### 按功能分类

| 功能模块 | 使用的 API | 调用频率 |
|---------|-----------|---------|
| 📱 Top Charts | `/ranking` | 每地区/榜单类型各1次 |
| 📈 榜单异动分析 | `/ranking` | 本周+上周，每地区各2次 |
| 🔍 应用名称获取 | `/category/category_history` | 批量，每批30个 |
| 📊 起量产品识别 | `/sales_report_estimates_comparison_attributes` | 1次 |
| 📈 起量分析 | `/sales_report_estimates` | 每个App × 5个地区 |
| 📅 历史新品扫描 | `/apps/{appId}` | 每个App 1次 |
| 👀 竞品监控 | `/unified/publishers/apps` | 每个发行商 1次 |

### 调用频率估算

**日常使用（updateAllData）**：
- `/ranking`: ~20次（5个国家 × 2个平台 × 2个榜单类型）
- `/category/category_history`: ~10-20次（取决于榜单应用数量）

**竞品监控（fetchNewReleases）**：
- `/unified/publishers/apps`: 136次（136家竞品公司）

**历史新品扫描（scanHistoricalNewApps）**：
- `/apps/{appId}`: ~数千次（取决于基准库大小）

**起量分析（analyzeRisingApps）**：
- `/sales_report_estimates`: ~数百次（每个App × 5个地区）

---

## 🔒 API 权限要求

### 基础权限（必需）
- ✅ `/ranking` - 排行榜数据
- ✅ `/category/category_history` - 应用名称
- ✅ `/apps/{appId}` - 应用详情
- ✅ `/unified/publishers/apps` - 发行商应用列表

### 高级权限（可选）
- ⚠️ `/sales_report_estimates_comparison_attributes` - 下载量对比
- ⚠️ `/sales_report_estimates` - 每日下载量

**注意**：如果没有高级权限，以下功能可能无法使用：
- `identifyRisingApps()` - 起量产品识别
- `analyzeRisingApps()` - 起量分析

---

## ⚡ 性能优化

### 1. 批量处理
- 应用名称获取：每批30个
- 历史新品扫描：每批1000个
- 起量分析：每批60个

### 2. 请求延迟
- `/ranking`: 300ms
- `/category/category_history`: 400ms
- `/unified/publishers/apps`: 300ms
- `/apps/{appId}`: 150ms
- `/sales_report_estimates`: 200ms

### 3. 错误处理
- 所有 API 调用都有 try-catch 错误处理
- 失败时记录日志，不影响其他请求
- 返回统一的 `{success: boolean, data: ...}` 格式

---

## 📝 使用建议

1. **API Token 配置**：确保已正确配置 API Token
2. **权限检查**：确认订阅包含所需 API 权限
3. **调用频率**：注意 API 限流，已内置延迟机制
4. **错误处理**：检查返回的 `success` 字段
5. **数据验证**：使用前验证返回数据的完整性

---

## 🔗 相关文档

- [SensorTower API 官方文档](https://sensortower.com/api)
- [配置说明](./CONFIG.md)
- [快速开始](./QUICK_START.md)
