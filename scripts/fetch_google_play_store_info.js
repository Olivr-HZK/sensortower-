#!/usr/bin/env node
/**
 * 从数据库 android_top100 表读取游戏 app_id，批量爬取 Google Play 商店信息，
 * 将爬取的数据存入 gamestoreinfo 表。
 *
 * 用法：
 *   node fetch_google_play_store_info.js [limit]
 * 示例：
 *   node fetch_google_play_store_info.js        # 爬取所有未爬取的游戏
 *   node fetch_google_play_store_info.js 10    # 只爬取前10个
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 引入爬虫解析逻辑
const { parseGooglePlayPage } = require('./crawl_google_play.js');

const DB_FILE = process.env.SENSORTOWER_DB_FILE
  ? require('path').isAbsolute(process.env.SENSORTOWER_DB_FILE)
    ? process.env.SENSORTOWER_DB_FILE
    : path.join(__dirname, '..', process.env.SENSORTOWER_DB_FILE)
  : path.join(__dirname, '..', 'data', 'sensortower_top100.db');

const DELAY_MS = 2000; // 每个请求间隔2秒，避免被封

function runSql(sql, silent = false) {
  const compact = sql
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  const safe = compact.replace(/"/g, '""');
  try {
    return execSync(`sqlite3 "${DB_FILE}" "${safe}"`, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
    });
  } catch (e) {
    if (!silent) throw e;
    return null;
  }
}

function runSqlReturn(sql) {
  const compact = sql
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  const safe = compact.replace(/"/g, '""');
  try {
    return execSync(`sqlite3 -separator '|' "${DB_FILE}" "${safe}"`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (e) {
    return '';
  }
}

function escapeSqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function initGamestoreinfoTable() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS gamestoreinfo (
      app_id TEXT PRIMARY KEY,
      package_id TEXT,
      title TEXT,
      rating REAL,
      installs TEXT,
      developer TEXT,
      category TEXT,
      category_id TEXT,
      short_description TEXT,
      full_description TEXT,
      content_rating TEXT,
      content_rating_labels TEXT,
      price_type TEXT,
      store_url TEXT,
      icon_url TEXT,
      screenshot_urls TEXT,
      video_thumbnail_url TEXT,
      video_id TEXT,
      similar_app_ids TEXT,
      event_end_time TEXT,
      crawled_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `;
  runSql(ddl, true);
  // 添加可能缺失的列
  const columns = [
    'package_id', 'title', 'rating', 'installs', 'developer', 'category',
    'category_id', 'short_description', 'full_description', 'content_rating',
    'content_rating_labels', 'price_type', 'store_url', 'icon_url',
    'screenshot_urls', 'video_thumbnail_url', 'video_id', 'similar_app_ids',
    'event_end_time', 'crawled_at', 'updated_at'
  ];
  for (const col of columns) {
    try {
      runSql(`ALTER TABLE gamestoreinfo ADD COLUMN ${col} TEXT;`, true);
    } catch (e) {
      // 列已存在，忽略
    }
  }
}

/** 从 android_top100 和 app_metadata 获取 app_id 和对应的 url */
function getAppIdsWithUrlsFromTop100(limit = null) {
  let sql = `
    SELECT DISTINCT 
      t.app_id,
      m.url
    FROM android_top100 t
    LEFT JOIN app_metadata m ON t.app_id = m.app_id AND m.os = 'android'
    WHERE t.app_id IS NOT NULL AND t.app_id != ''
      AND m.url IS NOT NULL
  `;
  if (limit) {
    sql += ` LIMIT ${parseInt(limit)}`;
  }
  const out = runSqlReturn(sql);
  const result = [];
  for (const line of out.trim().split('\n')) {
    if (!line) continue;
    const parts = line.split('|');
    const appId = parts[0]?.trim();
    const url = parts[1]?.trim();
    if (appId && url) {
      result.push({ appId, url });
    }
  }
  return result;
}

/** 获取已爬取的 app_id 列表 */
function getCrawledAppIds() {
  const out = runSqlReturn("SELECT app_id FROM gamestoreinfo WHERE app_id IS NOT NULL");
  return new Set(
    out
      .trim()
      .split('\n')
      .map((line) => line.split('|')[0]?.trim())
      .filter(Boolean)
  );
}

/** 检查 Playwright 浏览器是否已安装 */
async function checkPlaywrightInstalled() {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    await browser.close();
    return true;
  } catch (e) {
    if (e.message.includes('Executable doesn\'t exist') || 
        e.message.includes('browserType.launch') ||
        e.message.includes('spawn Unknown system error')) {
      console.error('\n❌ Playwright 浏览器未正确安装！');
      console.error('可能的原因：');
      console.error('  1. 浏览器未安装');
      console.error('  2. 架构不匹配（如 ARM Mac 使用了 x64 版本）');
      console.error('\n请运行以下命令重新安装：');
      console.error('  npx playwright install chromium');
      console.error('\n如果仍有问题，请查看：scripts/SETUP_PLAYWRIGHT.md\n');
      return false;
    }
    throw e;
  }
}

/** 使用 Playwright 爬取 Google Play 页面 */
async function crawlGooglePlayPage(url, appId) {
  let browser = null;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // 设置更长的超时时间
    page.setDefaultTimeout(60000);
    
    // 设置请求头，模拟真实浏览器
    await page.setExtraHTTPHeaders({ 
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    // 访问页面，等待网络空闲
    await page.goto(url, { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    
    // 额外等待，确保 JavaScript 执行完成
    await page.waitForTimeout(3000);
    
    // 检查页面是否包含 ds:4 数据
    const hasDs4 = await page.evaluate(() => {
      return document.body.innerHTML.includes("key: 'ds:4'");
    });
    
    if (!hasDs4) {
      console.warn(`  [${appId}] 警告: 页面可能未完全加载，未找到 ds:4 数据`);
      // 再等待一下
      await page.waitForTimeout(2000);
    }
    
    let html = await page.content();
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    await browser.close();
    browser = null;

    // 若 page.content 不包含 ds:4，但 body.innerHTML 包含，则使用 body.innerHTML
    const hasDs4InHtml = html.includes("key: 'ds:4'");
    const hasDs4InBody = bodyHtml && bodyHtml.includes("key: 'ds:4'");
    if (!hasDs4InHtml && hasDs4InBody) {
      html = `<body>${bodyHtml}</body>`;
    }

    // 验证 HTML 是否包含关键数据
    if (!html.includes("key: 'ds:4'")) {
      console.warn(`  [${appId}] 警告: HTML 中未找到 ds:4，可能页面结构不同`);
      // 检查是否有其他 ds 键
      const dsMatches = html.match(/key:\s*['"]ds:\d+['"]/g);
      if (dsMatches) {
        console.warn(`  [${appId}] 找到其他 ds 键: ${dsMatches.slice(0, 5).join(', ')}`);
      }
    }

    return html;
  } catch (e) {
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
    if (e.message.includes('Executable doesn\'t exist') || e.message.includes('browserType.launch')) {
      console.error(`  [${appId}] Playwright 浏览器未安装，请运行: npx playwright install chromium`);
    } else if (e.message.includes('timeout')) {
      console.error(`  [${appId}] 页面加载超时: ${url}`);
    } else {
      console.error(`  [${appId}] Playwright 错误:`, e.message);
    }
    return null;
  }
}

/** 将解析结果存入数据库 */
function saveToDatabase(appId, parsedData) {
  if (!parsedData || !parsedData.ok || !parsedData.data) {
    console.error(`  [${appId}] 解析失败，跳过保存`);
    return false;
  }
  const data = parsedData.data;
  const values = {
    app_id: appId,
    package_id: data.packageId || null,
    title: data.title || null,
    rating: data.rating !== null && data.rating !== undefined ? data.rating : null,
    installs: data.installs || null,
    developer: data.developer || null,
    category: data.category || null,
    category_id: data.categoryId || null,
    short_description: data.shortDescription || null,
    full_description: data.fullDescription || null,
    content_rating: data.contentRating || null,
    content_rating_labels: data.contentRatingLabels && data.contentRatingLabels.length
      ? JSON.stringify(data.contentRatingLabels)
      : null,
    price_type: data.priceType || null,
    store_url: data.storeUrl || `https://play.google.com/store/apps/details?id=${appId}`,
    icon_url: data.iconUrl || null,
    screenshot_urls: data.screenshotUrls && data.screenshotUrls.length
      ? JSON.stringify(data.screenshotUrls)
      : null,
    video_thumbnail_url: data.videoThumbnailUrl || null,
    video_id: data.videoId || null,
    similar_app_ids: data.similarAppIds && data.similarAppIds.length
      ? JSON.stringify(data.similarAppIds)
      : null,
    event_end_time: data.eventEndTime || null,
    crawled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const columns = Object.keys(values);
  const cols = columns.join(', ');
  const vals = columns.map((c) => escapeSqlValue(values[c])).join(', ');
  const sql = `INSERT OR REPLACE INTO gamestoreinfo (${cols}) VALUES (${vals});`;
  runSql(sql, true);
  return true;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2]) : null;
  console.log('初始化 gamestoreinfo 表...');
  initGamestoreinfoTable();
  
  // 检查 Playwright 是否已安装
  console.log('检查 Playwright 浏览器...');
  const playwrightOk = await checkPlaywrightInstalled();
  if (!playwrightOk) {
    process.exit(1);
  }
  console.log('✓ Playwright 浏览器已就绪\n');
  
  console.log('从 android_top100 和 app_metadata 读取 app_id 和 url...');
  const allApps = getAppIdsWithUrlsFromTop100(limit);
  console.log(`共找到 ${allApps.length} 个应用（包含 url）`);
  const crawled = getCrawledAppIds();
  const toCrawl = allApps.filter((app) => !crawled.has(app.appId));
  console.log(`已爬取 ${crawled.size} 个，待爬取 ${toCrawl.length} 个`);
  if (toCrawl.length === 0) {
    console.log('所有游戏已爬取完成！');
    return;
  }
  let success = 0;
  let fail = 0;
  const startTime = Date.now();
  for (let i = 0; i < toCrawl.length; i++) {
    const { appId, url } = toCrawl[i];
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const remaining = toCrawl.length - i - 1;
    const avgTime = i > 0 ? elapsed / (i + 1) : 0;
    const estRemaining = remaining * avgTime;
    console.log(`[${i + 1}/${toCrawl.length}] 爬取: ${appId}`);
    console.log(`  URL: ${url}`);
    console.log(`  进度: 已用时 ${elapsed}s, 预计剩余 ${estRemaining.toFixed(0)}s`);
    try {
      const html = await crawlGooglePlayPage(url, appId);
      if (!html) {
        console.error(`  [${appId}] 获取 HTML 失败`);
        fail++;
        await sleep(DELAY_MS);
        continue;
      }
      const parsed = parseGooglePlayPage(html, appId);
      if (!parsed.ok) {
        console.error(`  [${appId}] 解析失败: ${parsed.error}`);
        fail++;
      } else if (saveToDatabase(appId, parsed)) {
        const title = parsed.data.title || appId;
        const rating = parsed.data.rating ? ` (${parsed.data.rating}⭐)` : '';
        const hasData = parsed.data.packageId || parsed.data.title || parsed.data.rating;
        if (!hasData) {
          console.warn(`  [${appId}] 警告: 解析成功但数据为空，可能页面结构不同`);
        }
        console.log(`  ✓ 成功: ${title}${rating}`);
        success++;
      } else {
        console.error(`  [${appId}] 保存到数据库失败`);
        fail++;
      }
    } catch (e) {
      console.error(`  [${appId}] 错误:`, e.message);
      fail++;
    }
    if (i < toCrawl.length - 1) {
      await sleep(DELAY_MS);
    }
  }
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n完成！成功: ${success}, 失败: ${fail}, 总用时: ${totalTime}s`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('脚本执行失败:', e);
    process.exit(1);
  });
}

module.exports = { initGamestoreinfoTable, getAppIdsWithUrlsFromTop100, getCrawledAppIds };
