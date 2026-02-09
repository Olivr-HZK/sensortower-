#!/bin/bash
# Playwright 浏览器修复脚本
# 用于解决架构不匹配等问题

echo "🔧 修复 Playwright 浏览器安装..."

# 检测系统架构
ARCH=$(uname -m)
echo "检测到系统架构: $ARCH"

# 删除可能存在的错误缓存
echo "清理 Playwright 缓存..."
rm -rf ~/Library/Caches/ms-playwright 2>/dev/null
rm -rf ~/.cache/ms-playwright 2>/dev/null
rm -rf /var/folders/*/T/playwright* 2>/dev/null

# 重新安装 Chromium
echo "重新安装 Chromium 浏览器..."
npx playwright install chromium

# 验证安装
echo ""
echo "验证安装..."
node -e "
const { chromium } = require('playwright');
chromium.launch({ headless: true })
  .then(b => {
    console.log('✅ Playwright 浏览器安装成功！');
    b.close();
  })
  .catch(e => {
    console.error('❌ 安装失败:', e.message);
    console.error('');
    console.error('请尝试：');
    console.error('  1. 检查网络连接');
    console.error('  2. 运行: npm install playwright');
    console.error('  3. 运行: npx playwright install chromium');
    process.exit(1);
  });
"
