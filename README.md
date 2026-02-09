# SensorTower 数据爬取与分析工具

这是一个用于爬取和分析 SensorTower 数据的 Node.js 项目，包含 Google Play 应用信息爬取、排行榜数据获取、竞品动态监控等功能。

## 📁 项目结构

```
sensortower/
├── scripts/          # 所有脚本文件
│   ├── crawl_google_play.js          # Google Play 爬虫
│   ├── fetch_top100_to_db.js         # Top 100 数据获取
│   ├── fetch_app_metadata_to_db.js  # 应用元数据获取
│   └── ...
├── docs/            # 文档文件
│   ├── API_DOCUMENTATION.md         # API 文档
│   ├── QUICK_START.md               # 快速开始指南
│   └── ...
├── data/            # 数据文件（数据库、JSON 等）
├── config/          # 配置文件
│   ├── .env.example                 # 环境变量示例
│   └── category.json                # 分类配置
├── tests/           # 测试文件
├── output/          # 输出文件（CSV 等）
└── package.json     # 项目配置
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `config/.env.example` 为 `.env` 并填写你的配置：

```bash
cp config/.env.example .env
```

编辑 `.env` 文件，填入你的 SensorTower API Token：

```
SENSORTOWER_API_TOKEN=your_api_token_here
```

### 3. 运行脚本

```bash
# 爬取 Google Play 应用信息
npm run crawl-google-play

# 或直接运行脚本
node scripts/crawl_google_play.js
```

## 📚 主要功能

- **Google Play 爬虫**：爬取应用详情、截图、评分等信息
- **排行榜数据获取**：获取 Top 100 应用排行榜数据
- **应用元数据管理**：获取和管理应用元数据
- **竞品动态监控**：监控竞品应用的变化
- **数据导出**：导出 CSV 格式的分析报告

## 📖 文档

详细文档请查看 `docs/` 目录：

- **[使用指南：获取每周 Top100 榜单和异动榜单](docs/USAGE_GUIDE.md)** ⭐ 推荐阅读
- **[数据库定期同步（S3 预签名链接）](docs/DB_SYNC_S3.md)**
- [快速开始指南](docs/QUICK_START.md)
- [API 文档](docs/API_DOCUMENTATION.md)
- [API 总结](docs/API_SUMMARY.md)
- [工作流说明](docs/WORKFLOW_README.md)

## 🎯 快速命令

### 获取每周 Top100 榜单和异动榜单

```bash
# 推荐：使用完整工作流（一条命令完成所有步骤）
npm run workflow-week 2026-02-02

# 或者直接运行
node scripts/workflow_week_rank_changes.js 2026-02-02
```

**其他常用命令**：
```bash
# 仅获取 Top100 榜单
npm run fetch-top100 2026-02-02

# 仅生成异动榜单
npm run generate-changes 2026-02-02

# 拉取异动应用的下载/收益数据
npm run fetch-sales 2026-02-02
```

> 💡 **提示**：日期格式为 `YYYY-MM-DD`，必须是周一。详细说明请查看 [使用指南](docs/USAGE_GUIDE.md)。

## 🔧 开发

### 项目依赖

- Node.js
- Playwright（用于网页爬取）

### 脚本说明

主要脚本位于 `scripts/` 目录：

- `crawl_google_play.js` - Google Play 应用信息爬取
- `fetch_top100_to_db.js` - 获取 Top 100 排行榜并存入数据库
- `fetch_app_metadata_to_db.js` - 获取应用元数据
- `fetch_competitor_dynamics_to_db.js` - 获取竞品动态数据
- `workflow_week_rank_changes.js` - 周度排名变化工作流

## 📝 注意事项

- 数据库文件（`.db`）默认被 `.gitignore` 忽略，不会提交到版本控制
- 环境变量文件（`.env`）包含敏感信息，请勿提交到版本控制
- 输出文件（CSV）默认被忽略，如需版本控制请修改 `.gitignore`

## 📄 许可证

本项目仅供学习和研究使用。
