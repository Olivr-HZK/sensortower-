# 配置指南

## 🚀 快速开始

### 第一步：配置 API Key

1. 打开 Google Sheets（已安装脚本的表格）
2. 点击顶部菜单：`📊 市场监测` → `🔑 配置 API Key`
3. 输入你的 SensorTower API Token
4. 点击确定保存

### 第二步：配置 Google Doc（可选）

1. 点击菜单：`📊 市场监测` → `📄 配置 Google Doc`
2. **选项 A**：留空，系统会自动创建新文档
3. **选项 B**：输入现有 Google Doc ID
   - 打开你的 Google Doc
   - 从 URL 中复制 Doc ID
   - 例如：`https://docs.google.com/document/d/1a2b3c4d5e6f/edit`
   - Doc ID 是：`1a2b3c4d5e6f`

### 第三步：测试配置

点击菜单：`📊 市场监测` → `🧪 测试 API` 验证配置是否正确。

## 📝 关于 Google Doc 导出

### 表格不会自动填写到 Google Doc

**重要说明**：
- 生成的表格数据保存在 Google Sheets 中
- **不会自动**填写到 Google Doc
- 需要手动运行 `📄 导出周报到 Doc` 才会导出

### 导出方式

1. 运行 `📊 市场监测` → `📈 分析报告` → `生成周报汇总`
2. 运行 `📊 市场监测` → `📈 分析报告` → `📄 导出周报到 Doc`
3. 系统会将周报内容追加到配置的 Google Doc 中

### 导出内容

- 📌 本周要点
- 🆕 本周新进 Top 50 产品列表
- 🚀 排名飙升产品 Top 10

## 🔧 配置存储位置

配置信息存储在 Google Apps Script 的 PropertiesService 中：
- `sensortower_api_token`：API Token
- `weeklyReportDocId`：Google Doc ID

这些配置与你的 Google Sheets 绑定，只有拥有编辑权限的用户才能访问。

## ❓ 常见问题

### Q: 如何查看当前配置？
A: 运行配置函数时会显示当前配置状态。

### Q: 可以配置多个 Google Doc 吗？
A: 目前只支持一个 Doc，每次导出会追加到同一个文档。

### Q: API Token 在哪里获取？
A: 登录 SensorTower 网站，进入 API 设置页面生成 Token。

### Q: 配置会丢失吗？
A: 配置存储在 Google Apps Script 中，只要不删除脚本就不会丢失。
