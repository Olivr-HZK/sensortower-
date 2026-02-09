# Google Play 爬取调试指南

## 问题：爬取结果为空

如果运行 `fetch_google_play_store_info.js` 后发现爬取的数据为空，可以使用以下方法调试：

## 调试步骤

### 1. 使用测试脚本测试单个 URL

```bash
# 测试单个 URL
node scripts/test_crawl_url.js "https://play.google.com/store/apps/details?hl=en&id=com.block.juggle&gl=IN" com.block.juggle
```

测试脚本会：
- 显示页面加载过程
- 检查是否找到 ds:4 数据
- 保存 HTML 到 `debug_page.html` 供检查
- 显示解析结果

### 2. 检查保存的 HTML

测试脚本会保存 HTML 到 `debug_page.html`，可以检查：
- 页面是否完整加载
- 是否包含 `key: 'ds:4'`
- 页面结构是否正常

### 3. 常见问题

#### 问题 1: 页面加载超时

**症状**: 看到 "页面加载超时" 错误

**解决**:
- 检查网络连接
- 增加超时时间（已在脚本中设置为 60 秒）
- 检查 URL 是否可访问

#### 问题 2: 找不到 ds:4 数据

**症状**: 看到 "未找到 ds:4" 警告

**可能原因**:
- 页面结构已改变
- 需要登录才能看到数据
- 地区限制（某些地区可能显示不同页面）

**解决**:
- 尝试不同的 URL 格式（移除地区参数）
- 检查是否需要登录
- 尝试使用不同的 User-Agent

#### 问题 3: 解析成功但数据为空

**症状**: 解析成功但所有字段都是 null

**可能原因**:
- 页面结构不同
- ds:4 数据格式改变
- 需要等待更长时间

**解决**:
- 检查 `debug_page.html` 中的实际数据结构
- 可能需要更新解析逻辑

## 改进的爬取函数

已更新 `fetch_google_play_store_info.js` 中的爬取函数，包含：

1. **更长的超时时间**: 60 秒
2. **更好的 User-Agent**: 模拟真实浏览器
3. **额外等待**: 确保 JavaScript 执行完成
4. **数据验证**: 检查页面是否包含 ds:4
5. **详细日志**: 显示警告和错误信息

## 手动测试 URL

可以手动在浏览器中打开 URL，检查：
1. 页面是否正常显示
2. 查看页面源代码，搜索 `ds:4`
3. 检查是否需要登录或 VPN

## 如果问题持续

1. 保存一个失败的 HTML 页面：
   ```bash
   # 运行测试脚本，它会保存到 debug_page.html
   node scripts/test_crawl_url.js <url> <app_id>
   ```

2. 检查 HTML 文件，查找：
   - `key: 'ds:4'` 是否存在
   - 如果不存在，查找其他可能的键（如 `ds:5`, `ds:6` 等）
   - 检查页面是否有错误信息

3. 如果页面结构已改变，可能需要更新解析逻辑

## 示例：测试数据库中的 URL

```bash
# 从数据库获取一个 URL 进行测试
sqlite3 data/sensortower_top100.db "SELECT url FROM app_metadata WHERE os='android' AND url IS NOT NULL LIMIT 1;" | \
  xargs -I {} node scripts/test_crawl_url.js {} test_app
```
