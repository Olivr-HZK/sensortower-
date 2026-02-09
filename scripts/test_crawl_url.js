#!/usr/bin/env node
/**
 * 测试用 URL 爬取 Google Play 页面
 */

const { parseGooglePlayPage } = require('./crawl_google_play.js');
const fs = require('fs');

async function testCrawl(url, appId) {
  console.log(`测试 URL: ${url}`);
  console.log(`App ID: ${appId}\n`);
  
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // 设置更长的超时时间
    page.setDefaultTimeout(60000);
    
    // 设置用户代理和语言
    await page.setExtraHTTPHeaders({ 
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    console.log('正在加载页面...');
    await page.goto(url, { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    
    // 等待页面完全加载
    await page.waitForTimeout(3000);
    
    // 检查页面是否包含 ds:4
    const hasDs4 = await page.evaluate(() => {
      return document.body.innerHTML.includes("key: 'ds:4'");
    });
    
    console.log(`页面是否包含 ds:4: ${hasDs4}`);
    
    // 获取 HTML
    const html = await page.content();
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    console.log(`HTML 长度: ${html.length}`);
    console.log(`Body HTML 长度: ${bodyHtml.length}`);
    
    // 保存 HTML 用于调试
    fs.writeFileSync('debug_page.html', html, 'utf8');
    fs.writeFileSync('debug_body.html', bodyHtml, 'utf8');
    console.log('已保存 HTML 到 debug_page.html 和 debug_body.html\n');
    
    await browser.close();
    
    // 解析数据
    console.log('开始解析数据...');
    const htmlForParse = html.includes("key: 'ds:4'") ? html : bodyHtml;
    const parsed = parseGooglePlayPage(htmlForParse, appId);
    
    if (parsed.ok) {
      console.log('✓ 解析成功！');
      console.log('包名:', parsed.data.packageId);
      console.log('名称:', parsed.data.title);
      console.log('评分:', parsed.data.rating);
      console.log('下载量:', parsed.data.installs);
      console.log('开发者:', parsed.data.developer);
      console.log('分类:', parsed.data.category);
      console.log('图标:', parsed.data.iconUrl ? '有' : '无');
      console.log('截图数量:', parsed.data.screenshotUrls?.length || 0);

      // 保存解析结果到根目录
      const output = {
        url,
        appId,
        crawledAt: new Date().toISOString(),
        app: parsed.data,
      };
      fs.writeFileSync('debug_result.json', JSON.stringify(output, null, 2), 'utf8');
      console.log('已保存解析结果到 debug_result.json');
    } else {
      console.error('✗ 解析失败:', parsed.error);
      // 检查 HTML 中是否有 ds:4
      const ds4Index = html.indexOf("key: 'ds:4'");
      console.log(`ds:4 在 HTML 中的位置: ${ds4Index >= 0 ? ds4Index : '未找到'}`);
      
      // 查找所有 ds: 键
      const dsMatches = html.match(/key:\s*['"]ds:\d+['"]/g);
      console.log('找到的 ds 键:', dsMatches?.slice(0, 10) || []);
    }
    
    return parsed;
  } catch (e) {
    console.error('错误:', e.message);
    console.error(e.stack);
    return null;
  }
}

// 从命令行参数获取 URL
const url = process.argv[2];
const appId = process.argv[3] || 'test';

if (!url) {
  console.error('用法: node test_crawl_url.js <url> [app_id]');
  process.exit(1);
}

testCrawl(url, appId).then(() => {
  process.exit(0);
}).catch(e => {
  console.error('测试失败:', e);
  process.exit(1);
});
