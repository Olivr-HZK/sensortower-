# 🚀 快速开始指南

## 关于 Google Doc 导出

**重要**：表格数据**不会自动**填写到 Google Doc！

- ✅ 表格数据保存在 Google Sheets 的各个工作表中
- ❌ 不会自动同步到 Google Doc
- ✅ 需要手动运行 `📄 导出周报到 Doc` 才会导出

### 导出流程

1. 运行 `📊 市场监测` → `📈 分析报告` → `生成周报汇总`
2. 运行 `📊 市场监测` → `📈 分析报告` → `📄 导出周报到 Doc`
3. 系统会将周报追加到配置的 Google Doc

## 📝 配置步骤

### 1. 配置 SensorTower API Key

```
菜单：📊 市场监测 → 🔑 配置 API Key
输入：你的 SensorTower API Token
```

### 2. 配置 Google Doc（可选）

**方式一：自动创建（推荐）**
```
菜单：📊 市场监测 → 📄 配置 Google Doc
留空 → 确定
系统会在首次导出时自动创建新文档
```

**方式二：使用现有文档**
```
菜单：📊 市场监测 → 📄 配置 Google Doc
输入：你的 Google Doc ID
从文档 URL 获取：https://docs.google.com/document/d/DOC_ID/edit
```

### 3. 测试配置

```
菜单：📊 市场监测 → 🧪 测试 API
```

## 📋 配置示例

### SensorTower API Token
```
格式：字符串（例如：abc123xyz789）
获取：登录 SensorTower → API 设置
```

### Google Doc ID
```
从 URL 获取：
https://docs.google.com/document/d/1a2b3c4d5e6f/edit
                                    ↑ 这部分
Doc ID：1a2b3c4d5e6f
```

## ⚙️ 配置存储

- 配置存储在 Google Apps Script 的 PropertiesService
- 与你的 Google Sheets 绑定
- 只有拥有编辑权限的用户才能访问

## 📄 文档自动创建说明

### 何时创建新文档？

系统会在以下情况**自动创建**新文档：

1. ✅ **首次导出**：没有配置 Doc ID 时
2. ✅ **配置的文档无法访问**：Doc ID 无效或没有权限
3. ✅ **手动清除配置**：通过配置菜单清空 Doc ID 后

### 文档创建流程

```
1. 运行「📄 导出周报到 Doc」
   ↓
2. 检查是否配置了 Doc ID
   ↓
3. 如果未配置或文档无法访问
   ↓
4. 自动创建新文档
   - 名称：📊 周报汇总归档 - [表格名] - [日期]
   - 位置：Google Drive 根目录
   - 权限：仅你可见
   ↓
5. 自动保存 Doc ID 到配置
   ↓
6. 下次导出自动使用同一文档
```

### 文档位置

- 📁 **存储位置**：你的 Google Drive 根目录
- 🔗 **访问方式**：导出成功后会显示链接
- 📝 **文档格式**：Google Docs

## 🔄 更新配置

随时可以通过菜单重新配置：
- `🔑 配置 API Key` - 更新 API Token
- `📄 配置 Google Doc` - 更新或清除 Doc ID
