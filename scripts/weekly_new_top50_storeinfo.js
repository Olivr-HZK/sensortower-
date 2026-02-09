#!/usr/bin/env node
/**
 * 工作流：从 rank_changes 中筛选「新进 Top50」的前 3，
 * 抓取 Android(iOS) 商店信息并写入 gamestoreinfo / appstoreinfo。
 *
 * 规则：
 * - change_type = '🆕 新进榜单'
 * - current_rank <= 50
 * - 按周顺序去重（同 app/country/platform 只保留首次出现）
 * - 仅取美国、最新一周的免费榜
 *
 * 用法：
 *   node weekly_new_top50_storeinfo.js
 *   node weekly_new_top50_storeinfo.js --date 2026-02-03
 *   node weekly_new_top50_storeinfo.js --top 5
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

const COUNTRY_US_CODES = ['US', '🇺🇸 美国'];
const DEFAULT_TOP_NEW = 3;
const DELAY_MS = 2000;

const PLATFORMS = [
  {
    name: 'android',
    os: 'android',
    buildUrl: (appId) => `https://play.google.com/store/apps/details?id=${appId}`,
  },
  {
    name: 'ios',
    os: 'ios',
    buildUrl: (appId) => `https://apps.apple.com/app/id${appId}`,
  },
];

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

function initAppstoreinfoTable() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS appstoreinfo (
      app_id TEXT PRIMARY KEY,
      app_name TEXT,
      subtitle TEXT,
      price TEXT,
      price_type TEXT,
      rating REAL,
      rating_count INTEGER,
      age_rating TEXT,
      category TEXT,
      category_id TEXT,
      developer TEXT,
      developer_id TEXT,
      developer_url TEXT,
      languages TEXT,
      size TEXT,
      size_bytes INTEGER,
      icon_url TEXT,
      screenshot_urls TEXT,
      description TEXT,
      description_short TEXT,
      release_notes TEXT,
      version TEXT,
      last_updated TEXT,
      compatibility TEXT,
      in_app_purchases INTEGER,
      store_url TEXT,
      crawled_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `;
  runSql(ddl, true);
}

function normalizeCountry(country) {
  if (!country) return '';
  if (country.startsWith('🇺🇸')) return 'US';
  return country;
}

function getWeeksAsc(platform) {
  const out = runSqlReturn(
    `SELECT DISTINCT rank_date_current
     FROM rank_changes
     WHERE LOWER(platform) = '${platform}'
       AND (country = 'US' OR country LIKE '🇺🇸%')
     ORDER BY rank_date_current ASC`
  );
  return (out || '').trim().split('\n').filter(Boolean).map((l) => l.trim());
}

function getNewEntriesForWeek(platform, weekDate) {
  const out = runSqlReturn(
    `SELECT app_id, current_rank, country, platform
     FROM rank_changes
     WHERE rank_date_current = '${weekDate}'
       AND LOWER(platform) = '${platform}'
       AND (country = 'US' OR country LIKE '🇺🇸%')
       AND change_type = '🆕 新进榜单'
       AND current_rank <= 50
     ORDER BY current_rank ASC`
  );
  const rows = [];
  for (const line of (out || '').trim().split('\n')) {
    if (!line) continue;
    const [appId, rankStr, country, plat] = line.split('|').map((s) => s && s.trim());
    if (!appId) continue;
    rows.push({
      appId,
      currentRank: parseInt(rankStr, 10) || 0,
      country: country || '',
      platform: plat || platform,
    });
  }
  return rows;
}

function buildWeeklyFirstNewTop50(platform, weeksAsc) {
  const historyTop50 = new Set();
  const resultByWeek = new Map();
  for (const week of weeksAsc) {
    const entries = getNewEntriesForWeek(platform, week);
    const filtered = [];
    for (const e of entries) {
      const key = `${e.appId}||${normalizeCountry(e.country)}||${platform}`;
      if (!historyTop50.has(key)) {
        filtered.push(e);
      }
    }
    resultByWeek.set(week, filtered);
    for (const e of entries) {
      const key = `${e.appId}||${normalizeCountry(e.country)}||${platform}`;
      historyTop50.add(key);
    }
  }
  return resultByWeek;
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
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

function buildGooglePlayValues(appId, data) {
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
    content_rating_labels:
      data.contentRatingLabels && data.contentRatingLabels.length
        ? JSON.stringify(data.contentRatingLabels)
        : null,
    price_type: data.priceType || null,
    store_url: data.storeUrl || null,
    icon_url: data.iconUrl || null,
    screenshot_urls:
      data.screenshotUrls && data.screenshotUrls.length
        ? JSON.stringify(data.screenshotUrls)
        : null,
    video_thumbnail_url: data.videoThumbnailUrl || null,
    video_id: data.videoId || null,
    similar_app_ids:
      data.similarAppIds && data.similarAppIds.length
        ? JSON.stringify(data.similarAppIds)
        : null,
    event_end_time: data.eventEndTime || null,
    crawled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function buildAppStoreValues(appId, data) {
  return {
    app_id: appId,
    app_name: data.appName || null,
    subtitle: data.subtitle || null,
    price: data.price || null,
    price_type: data.priceType || null,
    rating: data.rating !== null && data.rating !== undefined ? data.rating : null,
    rating_count:
      data.ratingCount !== null && data.ratingCount !== undefined
        ? data.ratingCount
        : null,
    age_rating: data.ageRating || null,
    category: data.category || null,
    category_id: data.categoryId || null,
    developer: data.developer || null,
    developer_id: data.developerId || null,
    developer_url: data.developerUrl || null,
    languages: data.languages && data.languages.length ? JSON.stringify(data.languages) : null,
    size: data.size || null,
    size_bytes: data.sizeBytes !== null && data.sizeBytes !== undefined ? data.sizeBytes : null,
    icon_url: data.iconUrl || null,
    screenshot_urls:
      data.screenshotUrls && data.screenshotUrls.length
        ? JSON.stringify(data.screenshotUrls)
        : null,
    description: data.description || null,
    description_short: data.descriptionShort || null,
    release_notes: data.releaseNotes || null,
    version: data.version || null,
    last_updated: data.lastUpdated || null,
    compatibility: data.compatibility || null,
    in_app_purchases: data.inAppPurchases ? 1 : 0,
    store_url: data.storeUrl || null,
    crawled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function saveToGameStore(values) {
  const columns = Object.keys(values);
  const cols = columns.join(', ');
  const vals = columns.map((c) => escapeSqlValue(values[c])).join(', ');
  runSql(`INSERT OR REPLACE INTO gamestoreinfo (${cols}) VALUES (${vals});`, true);
  return true;
}

function saveToAppStore(values) {
  const columns = Object.keys(values);
  const cols = columns.join(', ');
  const vals = columns.map((c) => escapeSqlValue(values[c])).join(', ');
  runSql(`INSERT OR REPLACE INTO appstoreinfo (${cols}) VALUES (${vals});`, true);
  return true;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let date = null;
  let top = DEFAULT_TOP_NEW;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date') date = args[i + 1];
    if (args[i] === '--top') top = parseInt(args[i + 1], 10);
  }
  return { date, top: Number.isFinite(top) && top > 0 ? top : DEFAULT_TOP_NEW };
}

function resolveWeeksUpTo(platform, dateArg) {
  const weeksAsc = getWeeksAsc(platform);
  if (!weeksAsc.length) return null;
  if (!dateArg) return weeksAsc;
  const target = dateArg.trim();
  const idx = weeksAsc.indexOf(target);
  if (idx === -1) return null;
  return weeksAsc.slice(0, idx + 1);
}

async function processPlatform(platform, dateArg, top) {
  const weeksAsc = resolveWeeksUpTo(platform, dateArg);
  if (!weeksAsc) {
    console.log(`[${platform}] 日期不完整或无数据，跳过`);
    return;
  }
  const latestWeek = weeksAsc[weeksAsc.length - 1];
  const resultByWeek = buildWeeklyFirstNewTop50(platform, weeksAsc);
  const candidates = resultByWeek.get(latestWeek) || [];
  if (candidates.length === 0) {
    console.log(`[${platform}] 最新周无可用「新进 Top50」`);
    return;
  }
  const target = candidates.slice(0, top);
  console.log(`[${platform}] 最新周: ${latestWeek}，抓取前 ${target.length} 个`);

  const urlMap = getUrlMap(target.map((r) => r.appId), platform);

  let success = 0;
  let fail = 0;
  const startTime = Date.now();
  for (let i = 0; i < target.length; i++) {
    const { appId, currentRank } = target[i];
    const url = urlMap.get(appId) || PLATFORMS.find((p) => p.name === platform).buildUrl(appId);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(
      `[${platform}] [${i + 1}/${target.length}] rank #${currentRank} ${appId} (已用时 ${elapsed}s)`
    );
    try {
      if (platform === 'android') {
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
        } else {
          const values = buildGooglePlayValues(appId, parsed.data);
          saveToGameStore(values);
          const title = parsed.data.title || appId;
          const rating = parsed.data.rating ? ` (${parsed.data.rating}⭐)` : '';
          console.log(`  ✓ ${title}${rating}`);
          success++;
        }
      } else {
        const html = await crawlAppStorePage(url, appId);
        if (!html) {
          fail++;
          await sleep(DELAY_MS);
          continue;
        }
        const parsed = parseAppStorePage(html);
        const values = buildAppStoreValues(appId, parsed);
        saveToAppStore(values);
        const title = parsed.appName || appId;
        const rating = parsed.rating ? ` (${parsed.rating}⭐)` : '';
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
  console.log(`[${platform}] 完成！成功 ${success}，失败 ${fail}，用时 ${totalTime}s`);
}

async function main() {
  const { date, top } = parseArgs();
  initGamestoreinfoTable();
  initAppstoreinfoTable();
  const ok = await checkPlaywrightInstalled();
  if (!ok) process.exit(1);

  for (const platform of PLATFORMS) {
    await processPlatform(platform.name, date, top);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('脚本执行失败:', e);
    process.exit(1);
  });
}
