# 配置说明

## 📋 配置方式

本系统支持两种配置方式：

### 方式一：通过菜单配置（推荐）

1. **配置 SensorTower API Key**
   - 在 Google Sheets 中打开脚本
   - 点击菜单：`📊 市场监测` → `🔑 配置 API Key`
   - 输入你的 SensorTower API Token
   - 点击确定保存

2. **配置 Google Doc**
   - 点击菜单：`📊 市场监测` → `📄 配置 Google Doc`
   - 方式一：留空，系统会自动创建新文档
   - 方式二：输入现有 Google Doc 的 ID
     - 从文档 URL 中获取：`https://docs.google.com/document/d/DOC_ID/edit`
     - 复制 `DOC_ID` 部分即可

### 方式二：手动修改代码（不推荐）

如果需要手动修改，可以在代码中找到以下位置：

```javascript
// 在文件开头找到 CONFIG 对象
var CONFIG = {
  API_TOKEN: "你的API Token",  // 修改这里
  // ... 其他配置
};
```

## 🔑 获取 SensorTower API Key

1. 登录 [SensorTower](https://sensortower.com/)
2. 进入 API 设置页面
3. 生成或复制你的 API Token

## 📄 Google Doc 配置说明

- **自动创建**：如果不配置 Doc ID，每次导出时会自动创建新文档
- **使用现有文档**：配置 Doc ID 后，每次导出会追加到同一个文档
- **文档 ID 获取**：从文档 URL 中提取 `DOC_ID` 部分

示例 URL：
```
https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit
                                    ↑ 这部分就是 Doc ID
```

## ✅ 验证配置

配置完成后，可以点击菜单：`📊 市场监测` → `🧪 测试 API` 来验证配置是否正确。

## 🔒 安全说明

- API Token 和 Doc ID 存储在 Google Apps Script 的 PropertiesService 中
- 只有拥有该 Google Sheets 编辑权限的用户才能访问配置
- 建议定期更换 API Token
