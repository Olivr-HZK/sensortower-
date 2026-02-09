#!/usr/bin/env node
/**
 * 工作流：获取 US 免费榜 Top100（Android + iOS），
 * 重新爬取商店信息，与旧记录对比，
 * 如有变动写入变更表，并覆盖原表。
 *
 * 用法：
 *   node weekly_us_free_top100_storeinfo.js
 *   node weekly_us_free_top100_storeinfo.js --date 2026-02-03
 *   node weekly_us_free_top100_storeinfo.js --limit 100
 */

const path = require('path');
const { execSync } = require('child_process');
const { parseGooglePlayPage } = require('./crawl_google_play.js');
const { parseAppStorePage } = require('./crawl_appstore.js');

const DB_FILE = process.env.SENSORTOWER_DB_FILE
  ? require('path').isAbsolute(process.env.SENSORTOWER_DB_FILE)
    ? process.env.SENSORTOWER_DB_FILE
    : path.join(__dirname, '..', process.env.SENSORTOWER_DB_FILE)
  : path.join(__dirname, '..', 'data', 'sensortower_top100.db');

const COUNTRY = 'US';
const TOP_N = 100;
const DEFAULT_LIMIT = 100;
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
  return runSqlReturnWithSeparator(sql, '|');
}

function runSqlReturnWithSeparator(sql, sep) {
  const compact = sql.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
  const safe = compact.replace(/"/g, '""');
  try {
    return execSync(`sqlite3 -separator '${sep}' "${DB_FILE}" "${safe}"`, {
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

function initGamestoreinfoChangesTable() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS gamestoreinfo_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL,
      rank_date TEXT,
      changed_at TEXT DEFAULT (datetime('now')),
      changes_json TEXT,
      old_data_json TEXT,
      new_data_json TEXT
    );
  `;
  runSql(ddl, true);
}

function initAppstoreinfoTable() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS appstoreinfo (
      app_id TEXT PRIMARY KEY,
      app_name TEXT,
      subtitle TEXT,
      price TEXT,
      price_type TEXT,
      rating REAL,
      rating_count TEXT,
      age_rating TEXT,
      category TEXT,
      category_id TEXT,
      developer TEXT,
      developer_id TEXT,
      developer_url TEXT,
      languages TEXT,
      size TEXT,
      size_bytes TEXT,
      icon_url TEXT,
      screenshot_urls TEXT,
      description TEXT,
      description_short TEXT,
      release_notes TEXT,
      version TEXT,
      last_updated TEXT,
      compatibility TEXT,
      in_app_purchases TEXT,
      store_url TEXT,
      crawled_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `;
  runSql(ddl, true);
}

function initAppstoreinfoChangesTable() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS appstoreinfo_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL,
      rank_date TEXT,
      changed_at TEXT DEFAULT (datetime('now')),
      changes_json TEXT,
      old_data_json TEXT,
      new_data_json TEXT
    );
  `;
  runSql(ddl, true);
}

function getAvailableRankDates(platform) {
  const table = platform === 'ios' ? 'apple_top100' : 'android_top100';
  const chartWhere =
    platform === 'ios'
      ? "(chart_type = 'topfreeapplications' OR chart_type_display = '免费榜')"
      : "(chart_type = 'topselling_free' OR chart_type_display = '免费榜')";
  const out = runSqlReturn(
    `SELECT DISTINCT rank_date
     FROM ${table}
     WHERE country = '${COUNTRY}'
       AND ${chartWhere}
     ORDER BY rank_date ASC`
  );
  return (out || '').trim().split('\n').filter(Boolean).map((l) => l.trim());
}

function getTopRanking(platform, rankDate, topN) {
  const table = platform === 'ios' ? 'apple_top100' : 'android_top100';
  const chartWhere =
    platform === 'ios'
      ? "(chart_type = 'topfreeapplications' OR chart_type_display = '免费榜')"
      : "(chart_type = 'topselling_free' OR chart_type_display = '免费榜')";
  const sql = `
    SELECT app_id, rank
    FROM ${table}
    WHERE rank_date = '${rankDate}'
      AND country = '${COUNTRY}'
      AND ${chartWhere}
      AND app_id IS NOT NULL AND app_id != ''
    ORDER BY rank ASC
    LIMIT ${topN}
  `;
  const out = runSqlReturn(sql);
  const rows = [];
  for (const line of (out || '').trim().split('\n')) {
    if (!line) continue;
    const [appId, rankStr] = line.split('|').map((s) => s && s.trim());
    if (appId) rows.push({ appId, rank: parseInt(rankStr, 10) || 0 });
  }
  return rows;
}

function getUrlMap(appIds, os) {
  if (!appIds || appIds.length === 0) return new Map();
  const ids = appIds.map((id) => escapeSqlValue(id)).join(',');
  const sql = `
    SELECT app_id, url
    FROM app_metadata
    WHERE os = '${os}' AND app_id IN (${ids})
  `;
  const out = runSqlReturn(sql);
  const map = new Map();
  for (const line of (out || '').trim().split('\n')) {
    if (!line) continue;
    const [appId, url] = line.split('|').map((s) => s && s.trim());
    if (appId && url) map.set(appId, url);
  }
  return map;
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

async function crawlAppStorePage(url, appId) {
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
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    const html = await page.content();
    await browser.close();
    browser = null;
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

function buildStoreInfoValues(appId, data) {
  return {
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
}

function buildAppStoreInfoValues(appId, data) {
  return {
    app_id: appId,
    app_name: data.appName || null,
    subtitle: data.subtitle || null,
    price: data.price || null,
    price_type: data.priceType || null,
    rating: data.rating !== null && data.rating !== undefined ? data.rating : null,
    rating_count: data.ratingCount !== null && data.ratingCount !== undefined ? String(data.ratingCount) : null,
    age_rating: data.ageRating || null,
    category: data.category || null,
    category_id: data.categoryId || null,
    developer: data.developer || null,
    developer_id: data.developerId || null,
    developer_url: data.developerUrl || null,
    languages: data.languages && data.languages.length ? JSON.stringify(data.languages) : null,
    size: data.size || null,
    size_bytes: data.sizeBytes !== null && data.sizeBytes !== undefined ? String(data.sizeBytes) : null,
    icon_url: data.iconUrl || null,
    screenshot_urls: data.screenshotUrls && data.screenshotUrls.length ? JSON.stringify(data.screenshotUrls) : null,
    description: data.description || null,
    description_short: data.descriptionShort || null,
    release_notes: data.releaseNotes || null,
    version: data.version || null,
    last_updated: data.lastUpdated || null,
    compatibility: data.compatibility || null,
    in_app_purchases: data.inAppPurchases ? '1' : '0',
    store_url: data.storeUrl || null,
    crawled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function saveToDatabase(table, values) {
  const columns = Object.keys(values);
  const cols = columns.join(', ');
  const vals = columns.map((c) => escapeSqlValue(values[c])).join(', ');
  runSql(`INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${vals});`, true);
  return true;
}

function getExistingStoreInfo(table, appId, columns) {
  const sep = '\u001f';
  const cols = columns.map((c) => `"${c}"`).join(', ');
  const out = runSqlReturnWithSeparator(
    `SELECT ${cols} FROM ${table} WHERE app_id = ${escapeSqlValue(appId)} LIMIT 1;`,
    sep
  ).trim();
  if (!out) return null;
  const values = out.split(sep);
  const row = {};
  columns.forEach((c, idx) => {
    const v = values[idx];
    row[c] = v === undefined || v === '' ? null : v;
  });
  return row;
}

function diffStoreInfo(oldRow, newRow, columns) {
  const changes = {};
  for (const c of columns) {
    if (c === 'crawled_at' || c === 'updated_at') continue;
    const oldVal = oldRow ? oldRow[c] : null;
    const newVal = newRow[c];
    const oldStr = oldVal === null || oldVal === undefined ? null : String(oldVal);
    const newStr = newVal === null || newVal === undefined ? null : String(newVal);
    if (oldStr !== newStr) {
      changes[c] = { old: oldStr, new: newStr };
    }
  }
  return changes;
}

function saveChanges(table, appId, rankDate, changes, oldRow, newRow) {
  const values = {
    app_id: appId,
    rank_date: rankDate || null,
    changed_at: new Date().toISOString(),
    changes_json: JSON.stringify(changes),
    old_data_json: oldRow ? JSON.stringify(oldRow) : null,
    new_data_json: JSON.stringify(newRow),
  };
  const columns = Object.keys(values);
  const cols = columns.join(', ');
  const vals = columns.map((c) => escapeSqlValue(values[c])).join(', ');
  runSql(`INSERT INTO ${table} (${cols}) VALUES (${vals});`, true);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let date = null;
  let limit = DEFAULT_LIMIT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date') date = args[i + 1];
    if (args[i] === '--limit') limit = parseInt(args[i + 1], 10);
  }
  return { date, limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT };
}

async function crawlPlatform(platform, rankDate, limit) {
  const isIos = platform === 'ios';
  const label = isIos ? 'iOS' : 'Android';
  const currentTop = getTopRanking(platform, rankDate, TOP_N);
  if (!currentTop.length) {
    console.log(`[${label}] 当前日期无榜单数据`);
    return;
  }
  const target = currentTop.slice(0, limit);
  console.log(`[${label}] 本次将爬取 ${target.length} 个应用`);

  const urlMap = getUrlMap(target.map((r) => r.appId), isIos ? 'ios' : 'android');

  let success = 0;
  let fail = 0;
  const startTime = Date.now();
  for (let i = 0; i < target.length; i++) {
    const { appId, rank } = target[i];
    const fallbackUrl = isIos
      ? `https://apps.apple.com/us/app/id${appId}`
      : `https://play.google.com/store/apps/details?id=${appId}`;
    const url = urlMap.get(appId) || fallbackUrl;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`[${label}] [${i + 1}/${target.length}] rank #${rank} ${appId} (已用时 ${elapsed}s)`);
    try {
      const html = isIos ? await crawlAppStorePage(url, appId) : await crawlGooglePlayPage(url, appId);
      if (!html) {
        fail++;
        await sleep(DELAY_MS);
        continue;
      }
      const parsed = isIos ? parseAppStorePage(html) : parseGooglePlayPage(html, appId);
      if (!parsed || (isIos && !parsed.appName && !parsed.appId) || (!isIos && !parsed.ok)) {
        console.error(`  [${appId}] 解析失败`);
        fail++;
      } else {
        const data = isIos ? parsed : parsed.data;
        const values = isIos ? buildAppStoreInfoValues(appId, data) : buildStoreInfoValues(appId, data);
        if (!values.store_url) values.store_url = url;
        const columns = Object.keys(values);
        const table = isIos ? 'appstoreinfo' : 'gamestoreinfo';
        const changesTable = isIos ? 'appstoreinfo_changes' : 'gamestoreinfo_changes';
        const oldRow = getExistingStoreInfo(table, appId, columns);
        const changes = diffStoreInfo(oldRow, values, columns);
        if (oldRow && Object.keys(changes).length > 0) {
          saveChanges(changesTable, appId, rankDate, changes, oldRow, values);
        }
        saveToDatabase(table, values);
        const title = (isIos ? data.appName : data.title) || appId;
        const rating = data.rating ? ` (${data.rating}⭐)` : '';
        console.log(`  ✓ ${title}${rating}`);
        success++;
      }
    } catch (e) {
      console.error(`  [${appId}] 错误: ${e.message}`);
      fail++;
    }
    if (i < target.length - 1) await sleep(DELAY_MS);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`[${label}] 完成！成功 ${success}，失败 ${fail}，用时 ${totalTime}s`);
}

async function main() {
  const { date, limit } = parseArgs();
  initGamestoreinfoTable();
  initGamestoreinfoChangesTable();
  initAppstoreinfoTable();
  initAppstoreinfoChangesTable();
  const ok = await checkPlaywrightInstalled();
  if (!ok) process.exit(1);

  const platforms = ['android', 'ios'];
  for (const platform of platforms) {
    let rankDate;
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
        console.error('日期格式须为 YYYY-MM-DD');
        process.exit(1);
      }
      const available = getAvailableRankDates(platform);
      if (!available.includes(date.trim())) {
        console.error(`[${platform}] 库中无该日期数据: ${date}`);
        continue;
      }
      rankDate = date.trim();
    } else {
      const available = getAvailableRankDates(platform);
      if (!available.length) {
        console.error(`[${platform}] 库中无可用日期数据`);
        continue;
      }
      rankDate = available[available.length - 1];
    }

    console.log(`\n[${platform}] 榜单日期: ${rankDate}  国家: ${COUNTRY}  免费榜 Top${TOP_N}`);
    await crawlPlatform(platform, rankDate, limit);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('脚本执行失败:', e);
    process.exit(1);
  });
}
