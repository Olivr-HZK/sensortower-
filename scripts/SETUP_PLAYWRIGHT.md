# Playwright 浏览器安装指南

## 问题

如果运行 `fetch_google_play_store_info.js` 时遇到以下错误：

```
❌ Playwright 浏览器未安装！
请运行以下命令安装浏览器：
  npx playwright install chromium
```

## 解决方案

### 方法 1：安装所有浏览器（推荐）

```bash
npx playwright install
```

这会安装所有浏览器（Chromium、Firefox、WebKit），大约需要 500MB 空间。

### 方法 2：只安装 Chromium（节省空间）

```bash
npx playwright install chromium
```

只安装 Chromium 浏览器，大约需要 170MB 空间。

### 方法 3：使用系统包管理器（macOS）

```bash
# 使用 Homebrew
brew install --cask playwright
playwright install chromium
```

## 验证安装

运行以下命令验证浏览器是否已正确安装：

```bash
node -e "const { chromium } = require('playwright'); chromium.launch({ headless: true }).then(b => { console.log('✓ Playwright 浏览器可用'); b.close(); }).catch(e => { console.error('✗ 错误:', e.message); });"
```

如果看到 `✓ Playwright 浏览器可用`，说明安装成功。

## 常见问题

### Q: 安装很慢怎么办？

A: Playwright 需要下载浏览器二进制文件（约 170-500MB），取决于网络速度。可以：
- 使用国内镜像（如果可用）
- 在非高峰时段安装
- 使用代理

### Q: 安装后仍然报错？

A: 检查以下几点：
1. 确保在项目根目录运行安装命令
2. 检查 `node_modules` 目录是否存在
3. **架构不匹配问题（ARM Mac）**：
   - 如果看到 `spawn Unknown system error -86` 或 `mac-x64` 相关错误
   - 说明下载了错误的架构版本
   - 解决方法：删除缓存并重新安装
   ```bash
   # 删除 Playwright 缓存
   rm -rf ~/Library/Caches/ms-playwright
   rm -rf ~/.cache/ms-playwright
   # 重新安装
   npx playwright install chromium
   ```
4. 尝试删除 `node_modules` 和 `package-lock.json`，然后重新安装：
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npx playwright install chromium
   ```

### Q: 权限错误？

A: 在某些系统上可能需要管理员权限：
```bash
sudo npx playwright install chromium
```

## 安装位置

Playwright 浏览器默认安装在：
- macOS/Linux: `~/Library/Caches/ms-playwright/` 或 `~/.cache/ms-playwright/`
- Windows: `%USERPROFILE%\AppData\Local\ms-playwright\`

## 相关文档

- [Playwright 官方文档](https://playwright.dev/docs/browsers)
- [安装指南](https://playwright.dev/docs/browsers#install-browsers)
