# 📄 系统如何创建 Google Doc

## 🔄 自动创建流程

当运行 `📄 导出周报到 Doc` 时，系统会按以下流程处理：

### 第一步：检查配置

```javascript
1. 读取配置的 Google Doc ID
2. 如果配置了 Doc ID：
   - 尝试打开该文档
   - 如果成功 → 使用现有文档
   - 如果失败（文档不存在/无权限）→ 创建新文档
3. 如果没有配置 Doc ID：
   - 直接创建新文档
```

### 第二步：创建新文档

系统使用 Google Apps Script 的 `DocumentApp.create()` API 创建文档：

```javascript
文档名称格式：📊 周报汇总归档 - [你的表格名称] - [日期]
例如：📊 周报汇总归档 - 市场监测表 - 2026-02-03
```

### 第三步：设置初始内容

新文档会自动包含：
- 📊 标题："市场趋势监测周报归档"
- 📝 说明文字
- ─── 分隔线

### 第四步：保存配置

创建成功后，系统会：
- ✅ 自动保存文档 ID 到配置
- ✅ 下次导出时自动使用同一文档
- ✅ 显示文档链接供你访问

## 📋 创建时机

系统会在以下情况创建新文档：

1. **首次导出**：没有配置 Doc ID 时
2. **配置的文档无法访问**：Doc ID 无效或没有权限时
3. **手动清除配置**：通过 `📄 配置 Google Doc` 清空配置后

## 🎯 文档位置

- **存储位置**：你的 Google Drive 根目录
- **访问权限**：只有你（脚本运行者）可以访问
- **文档类型**：Google Docs 格式

## 🔍 文档命名规则

```
格式：📊 周报汇总归档 - [表格名称] - [创建日期]

示例：
- 📊 周报汇总归档 - 市场监测表 - 2026-02-03
- 📊 周报汇总归档 - Puzzle品类监测 - 2026-02-10
```

## 💡 使用建议

### 方式一：让系统自动创建（推荐）

1. **首次使用**：
   - 不配置 Doc ID
   - 直接运行 `📄 导出周报到 Doc`
   - 系统自动创建并保存配置

2. **后续使用**：
   - 系统自动使用同一文档
   - 每次导出追加新内容

### 方式二：使用现有文档

1. **准备文档**：
   - 在 Google Drive 创建或选择现有文档
   - 复制文档 ID（从 URL 中获取）

2. **配置文档**：
   - 运行 `📄 配置 Google Doc`
   - 输入文档 ID
   - 保存配置

3. **导出使用**：
   - 运行 `📄 导出周报到 Doc`
   - 内容追加到配置的文档

## 🔧 技术实现

### 创建文档的代码逻辑

```javascript
// 1. 检查配置
var docId = getConfig(CONFIG_KEYS.GOOGLE_DOC_ID, null);

// 2. 尝试打开现有文档
if (docId) {
  try {
    doc = DocumentApp.openById(docId);
  } catch (e) {
    doc = null; // 打开失败，需要创建新文档
  }
}

// 3. 创建新文档
if (!doc) {
  var docName = "📊 周报汇总归档 - " + ss.getName() + " - " + formatDate(new Date());
  doc = DocumentApp.create(docName);
  docId = doc.getId();
  
  // 4. 保存配置
  setConfig(CONFIG_KEYS.GOOGLE_DOC_ID, docId);
  
  // 5. 设置初始内容
  var body = doc.getBody();
  body.clear();
  body.appendParagraph("📊 市场趋势监测周报归档")
      .setHeading(DocumentApp.ParagraphHeading.TITLE);
  // ... 添加其他初始内容
}
```

## ❓ 常见问题

### Q: 文档创建在哪里？
A: 创建在你的 Google Drive 根目录，你可以在 Google Drive 中查看。

### Q: 可以指定文档创建位置吗？
A: Google Apps Script 的 `DocumentApp.create()` 只能在根目录创建，但创建后你可以手动移动到其他文件夹。

### Q: 如何查看创建的文档？
A: 导出成功后会显示文档链接，点击即可打开。也可以在 Google Drive 中搜索文档名称。

### Q: 可以创建多个文档吗？
A: 系统默认使用一个文档，每次导出追加内容。如果需要多个文档，可以：
1. 清除配置后重新导出（会创建新文档）
2. 手动配置不同的 Doc ID

### Q: 文档会被删除吗？
A: 不会，文档会一直保存在你的 Google Drive 中，除非你手动删除。

## 📝 注意事项

1. **权限要求**：脚本需要 Google Drive 和 Google Docs 的访问权限
2. **文档数量**：建议使用一个文档归档所有周报，便于管理
3. **文档大小**：如果文档过大，可以考虑定期创建新文档
4. **备份**：重要数据建议定期备份到本地
