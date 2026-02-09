#!/usr/bin/env node
/**
 * 每周自动爬取「免费榜」游戏商店页信息（Android）。
 *
 * 逻辑：
 * 1) 从 android_top100 中找最新一期免费榜日期（chart_type / chart_type_display）
 * 2) 取该日期下的去重 app_id
 * 3) 通过 app_metadata 获取 url
 * 4) 使用 Playwright + 解析逻辑写入 gamestoreinfo
 *
 * 用法：
 *   node weekly_free_chart_storeinfo.js
 *   node weekly_free_chart_storeinfo.js --limit 10
 *   node weekly_free_chart_storeinfo.js --date 2026-02-03
 */

const path = require('path');
const { execSync } = require('child_process');
const { parseGooglePlayPage } = require('./crawl_google_play.js');

const DB_FILE = process.env.SENSORTOWER_DB_FILE
  ? require('path').isAbsolute(process.env.SENSORTOWER_DB_FILE)
    ? process.env.SENSORTOWER_DB_FILE
    : path.join(__dirname, '..', process.env.SENSORTOWER_DB_FILE)
  : path.join(__dirname, '..', 'data', 'sensortower_top100.db');

const DELAY_MS = 2000;

function runSql(sql, silent = false) {
  const compact = sql.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
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
  const compact = sql.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
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
}

function getLatestFreeChartDate() {
  const sql = `
    SELECT MAX(rank_date)
    FROM android_top100
    WHERE chart_type = 'topselling_free' OR chart_type_display = '免费榜'
  `;
  const out = runSqlReturn(sql).trim();
  return out || null;
}

function getFreeChartAppIdsWithUrls(rankDate, limit) {
  let sql = `
    SELECT DISTINCT
      t.app_id,
      m.url
    FROM android_top100 t
    LEFT JOIN app_metadata m ON t.app_id = m.app_id AND m.os = 'android'
    WHERE t.app_id IS NOT NULL AND t.app_id != ''
      AND (t.chart_type = 'topselling_free' OR t.chart_type_display = '免费榜')
      AND t.rank_date = '${rankDate}'
      AND m.url IS NOT NULL
  `;
  if (limit) sql += ` LIMIT ${parseInt(limit)}`;
  const out = runSqlReturn(sql);
  const result = [];
  for (const line of out.trim().split('\n')) {
    if (!line) continue;
    const [appId, url] = line.split('|').map((s) => s && s.trim());
    if (appId && url) result.push({ appId, url });
  }
  return result;
}

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

async function checkPlaywrightInstalled() {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    await browser.close();
    return true;
  } catch (e) {
    console.error('\n❌ Playwright 浏览器未正确安装，请先运行：');
    console.error('  npx playwright install chromium\n');
    return false;
  }
}

async function crawlGooglePlayPage(url, appId) {
  let browser = null;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    let html = await page.content();
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    await browser.close();
    browser = null;

    if (!html.includes("key: 'ds:4'") && bodyHtml && bodyHtml.includes("key: 'ds:4'")) {
      html = `<body>${bodyHtml}</body>`;
    }
    return html;
  } catch (e) {
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
    console.error(`  [${appId}] Playwright 错误: ${e.message}`);
    return null;
  }
}

function saveToDatabase(appId, parsedData) {
  if (!parsedData || !parsedData.ok || !parsedData.data) return false;
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
    content_rating_labels: data.contentRatingLabels && data.contentRatingLabels.length ? JSON.stringify(data.contentRatingLabels) : null,
    price_type: data.priceType || null,
    store_url: data.storeUrl || null,
    icon_url: data.iconUrl || null,
    screenshot_urls: data.screenshotUrls && data.screenshotUrls.length ? JSON.stringify(data.screenshotUrls) : null,
    video_thumbnail_url: data.videoThumbnailUrl || null,
    video_id: data.videoId || null,
    similar_app_ids: data.similarAppIds && data.similarAppIds.length ? JSON.stringify(data.similarAppIds) : null,
    event_end_time: data.eventEndTime || null,
    crawled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const columns = Object.keys(values);
  const cols = columns.join(', ');
  const vals = columns.map((c) => escapeSqlValue(values[c])).join(', ');
  runSql(`INSERT OR REPLACE INTO gamestoreinfo (${cols}) VALUES (${vals});`, true);
  return true;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = null;
  let date = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') limit = parseInt(args[i + 1]);
    if (args[i] === '--date') date = args[i + 1];
  }
  return { limit, date };
}

async function main() {
  const { limit, date } = parseArgs();
  initGamestoreinfoTable();
  const ok = await checkPlaywrightInstalled();
  if (!ok) process.exit(1);

  const rankDate = date || getLatestFreeChartDate();
  if (!rankDate) {
    console.error('未找到免费榜日期（android_top100）');
    process.exit(1);
  }
  console.log(`免费榜日期: ${rankDate}`);

  const allApps = getFreeChartAppIdsWithUrls(rankDate, limit);
  console.log(`免费榜应用数量(含URL): ${allApps.length}`);
  const crawled = getCrawledAppIds();
  const toCrawl = allApps.filter((app) => !crawled.has(app.appId));
  console.log(`已爬取 ${crawled.size} 个，待爬取 ${toCrawl.length} 个`);

  let success = 0;
  let fail = 0;
  const startTime = Date.now();
  for (let i = 0; i < toCrawl.length; i++) {
    const { appId, url } = toCrawl[i];
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`[${i + 1}/${toCrawl.length}] ${appId} (已用时 ${elapsed}s)`);
    try {
      const html = await crawlGooglePlayPage(url, appId);
      if (!html) {
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
        console.log(`  ✓ ${title}${rating}`);
        success++;
      } else {
        fail++;
      }
    } catch (e) {
      console.error(`  [${appId}] 错误: ${e.message}`);
      fail++;
    }
    if (i < toCrawl.length - 1) await sleep(DELAY_MS);
  }
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`完成！成功 ${success}，失败 ${fail}，用时 ${totalTime}s`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('脚本执行失败:', e);
    process.exit(1);
  });
}
