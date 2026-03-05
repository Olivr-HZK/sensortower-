#!/usr/bin/env node
/**
 * 从 data/appid_list.json 读取 app 列表，拉取「上周」和「上上周」的 downloads/revenue，
 * 写入 app_list_weekly_sales 表。不依赖 Top100 / rank_changes。
 *
 * 日期逻辑（以「本周一」为基准）：
 *   上周：start = 本周一 - 7，end = 本周一 - 1（上周一至上周日）
 *   上上周：start = 本周一 - 14，end = 本周一 - 8（上上周一至上上周日）
 *
 * 用法：
 *   node fetch_applist_sales_to_db.js
 *     → 自动取「本周一」为今天所在周的周一
 *   node fetch_applist_sales_to_db.js 2026-02-24
 *     → 指定「本周一」为 2026-02-24
 *
 * 表结构：app_list_weekly_sales (app_id, platform, country, week_start, downloads, revenue)
 * week_start 为当周的周一日期（YYYY-MM-DD）。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEFAULT_APPLIST = path.join(ROOT, 'data', 'appid_list.json');
const BASE_URL = 'https://api.sensortower-china.com/v1';
const DB_FILE = process.env.SENSORTOWER_DB_FILE
  ? (path.isAbsolute(process.env.SENSORTOWER_DB_FILE)
      ? process.env.SENSORTOWER_DB_FILE
      : path.join(ROOT, process.env.SENSORTOWER_DB_FILE))
  : path.join(ROOT, 'data', 'sensortower_top100.db');
const BATCH_SIZE = 100;
const DELAY_MS = 400;

const COUNTRIES = ['US', 'JP', 'GB', 'DE', 'IN'];

function loadEnvToken() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('请配置 .env 中的 SENSORTOWER_API_TOKEN');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*SENSORTOWER_API_TOKEN\s*=\s*(.+)\s*$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  console.error('.env 中未找到 SENSORTOWER_API_TOKEN');
  process.exit(1);
}

function buildQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('JSON 解析失败: ' + e.message));
          }
        });
      })
      .on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dateAdd(ymd, deltaDays) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 获取「今天」所在周的周一 YYYY-MM-DD */
function getThisMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function runSql(sql, silent = true) {
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
    return execSync(`sqlite3 "${DB_FILE}" "${safe}"`, {
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

function ensureDbDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** 解析 sales_report_estimates 响应，按 (app_id, country) 汇总 */
function parseResponse(data, platform) {
  let list = null;
  if (Array.isArray(data)) list = data;
  else if (data && data.sales_report_estimates_key) {
    const inner = data.sales_report_estimates_key;
    list = Array.isArray(inner) ? inner : (inner && inner.unified ? inner.unified : null);
  } else if (data && data.unified) list = data.unified;
  else if (data && data.lines) list = data.lines;
  if (!list || !Array.isArray(list)) return [];

  const key = (appId, country) => `${appId}\t${country}`;
  const sum = new Map();

  for (const item of list) {
    const appId = String(item.app_id || item.aid || '');
    const country = item.country || item.c || item.cc || '';
    let units = 0;
    let revenue = 0;
    if (platform === 'android') {
      units = Number(item.android_units ?? item.u ?? 0) || 0;
      revenue = Number(item.android_revenue ?? item.r ?? 0) || 0;
    } else {
      units =
        (Number(item.iphone_units ?? item.iu ?? 0) || 0) +
        (Number(item.ipad_units ?? item.au ?? 0) || 0);
      revenue =
        (Number(item.iphone_revenue ?? item.ir ?? 0) || 0) +
        (Number(item.ipad_revenue ?? item.ar ?? 0) || 0);
    }
    const k = key(appId, country);
    const prev = sum.get(k) || { downloads: 0, revenue: 0 };
    sum.set(k, { downloads: prev.downloads + units, revenue: prev.revenue + revenue });
  }

  return Array.from(sum.entries()).map(([k, v]) => {
    const [app_id, country] = k.split('\t');
    return { app_id, country, downloads: v.downloads, revenue: v.revenue };
  });
}

async function fetchSalesBatch(appIds, platform, startDate, endDate, authToken) {
  const params = {
    app_ids: appIds.join(','),
    date_granularity: 'daily',
    start_date: startDate,
    end_date: endDate,
    data_model: 'DM_2025_Q2',
    auth_token: authToken,
  };
  const url = `${BASE_URL}/${platform}/sales_report_estimates?${buildQuery(params)}`;
  const data = await fetchJson(url);
  return parseResponse(data, platform);
}

/** 从 appid_list.json 读取并按 platform 分组 */
function loadAppList(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error('appid_list.json 应为数组');
  const byPlatform = { ios: [], android: [] };
  for (const item of list) {
    const appId = String(item.app_id || item.appId || '').trim();
    const platform = String(item.platform || item.os || '').toLowerCase();
    if (!appId) continue;
    if (platform === 'ios') byPlatform.ios.push(appId);
    else if (platform === 'android') byPlatform.android.push(appId);
  }
  byPlatform.ios = [...new Set(byPlatform.ios)];
  byPlatform.android = [...new Set(byPlatform.android)];
  return byPlatform;
}

function ensureTable() {
  runSql(`
    CREATE TABLE IF NOT EXISTS app_list_weekly_sales (
      app_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      country TEXT NOT NULL,
      week_start TEXT NOT NULL,
      downloads REAL,
      revenue REAL,
      PRIMARY KEY (app_id, platform, country, week_start)
    );
  `);
}

/** 按 (app_id, platform, week_start) 合并各国 downloads/revenue，写入 app_list_weekly_sales_merged */
function ensureMergedTable() {
  runSql(`
    CREATE TABLE IF NOT EXISTS app_list_weekly_sales_merged (
      app_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      week_start TEXT NOT NULL,
      downloads REAL,
      revenue REAL,
      PRIMARY KEY (app_id, platform, week_start)
    );
  `);
}

function refreshMergedTable() {
  ensureMergedTable();
  runSql(`
    DELETE FROM app_list_weekly_sales_merged;
    INSERT INTO app_list_weekly_sales_merged (app_id, platform, week_start, downloads, revenue)
    SELECT app_id, platform, week_start,
           SUM(COALESCE(downloads, 0)) AS downloads,
           SUM(COALESCE(revenue, 0)) AS revenue
    FROM app_list_weekly_sales
    GROUP BY app_id, platform, week_start;
  `);
  const out = runSqlReturn(`SELECT COUNT(*) FROM app_list_weekly_sales_merged`);
  const n = (out || '').trim();
  console.log('已合并写入 app_list_weekly_sales_merged 共', n, '条（每产品每周一国别汇总）');
}

function upsertSales(row) {
  runSql(
    `INSERT OR REPLACE INTO app_list_weekly_sales (app_id, platform, country, week_start, downloads, revenue)
     VALUES (${escapeSqlValue(row.app_id)}, ${escapeSqlValue(row.platform)}, ${escapeSqlValue(row.country)}, ${escapeSqlValue(row.week_start)}, ${row.downloads == null ? 'NULL' : row.downloads}, ${row.revenue == null ? 'NULL' : row.revenue});`,
    true
  );
}

async function main() {
  let listPathFinal = DEFAULT_APPLIST;
  let mondayArg = null;
  if (process.argv[2] && process.argv[3]) {
    const p = process.argv[2].trim();
    listPathFinal = path.isAbsolute(p) ? p : path.join(ROOT, p);
    mondayArg = process.argv[3].trim();
  } else if (process.argv[2]) {
    const a = process.argv[2].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(a)) {
      mondayArg = a;
    } else {
      listPathFinal = path.isAbsolute(a) ? a : path.join(ROOT, a);
    }
  }
  if (!path.isAbsolute(listPathFinal)) {
    listPathFinal = path.join(ROOT, listPathFinal);
  }

  if (!fs.existsSync(listPathFinal)) {
    console.error('未找到 app 列表文件:', listPathFinal);
    process.exit(1);
  }

  const thisMonday = mondayArg && /^\d{4}-\d{2}-\d{2}$/.test(mondayArg)
    ? mondayArg
    : getThisMonday();

  // 上周：本周一 -7 ~ -1
  const lastWeekStart = dateAdd(thisMonday, -7);
  const lastWeekEnd = dateAdd(thisMonday, -1);
  // 上上周：本周一 -14 ~ -8
  const twoWeeksAgoStart = dateAdd(thisMonday, -14);
  const twoWeeksAgoEnd = dateAdd(thisMonday, -8);

  console.log('本周一:', thisMonday);
  console.log('上周:', lastWeekStart, '~', lastWeekEnd);
  console.log('上上周:', twoWeeksAgoStart, '~', twoWeeksAgoEnd);

  ensureDbDir();
  ensureTable();
  const authToken = loadEnvToken();
  const byPlatform = loadAppList(listPathFinal);
  console.log('app 列表:', listPathFinal, '  ios:', byPlatform.ios.length, 'android:', byPlatform.android.length, '\n');

  const weeks = [
    { weekStart: lastWeekStart, startDate: lastWeekStart, endDate: lastWeekEnd, label: '上周' },
    { weekStart: twoWeeksAgoStart, startDate: twoWeeksAgoStart, endDate: twoWeeksAgoEnd, label: '上上周' },
  ];

  let totalRows = 0;

  for (const os of ['ios', 'android']) {
    const appIds = byPlatform[os];
    if (appIds.length === 0) continue;
    const platform = os === 'ios' ? 'ios' : 'android';

    for (const w of weeks) {
      console.log(`[${os}] ${w.label} (${w.weekStart}) 共 ${appIds.length} 个 app...`);
      for (let i = 0; i < appIds.length; i += BATCH_SIZE) {
        const batch = appIds.slice(i, i + BATCH_SIZE);
        try {
          const list = await fetchSalesBatch(batch, platform, w.startDate, w.endDate, authToken);
          for (const r of list) {
            if (!COUNTRIES.includes(r.country)) continue;
            upsertSales({
              app_id: r.app_id,
              platform,
              country: r.country,
              week_start: w.weekStart,
              downloads: r.downloads,
              revenue: r.revenue,
            });
            totalRows++;
          }
          console.log(`  ${i + 1}-${i + batch.length}/${appIds.length} 返回 ${list.length} 条`);
        } catch (e) {
          console.error('  请求失败:', e.message);
        }
        if (i + BATCH_SIZE < appIds.length) await sleep(DELAY_MS);
      }
    }
  }

  console.log('\n已写入 app_list_weekly_sales 共', totalRows, '条（上周 + 上上周）');

  refreshMergedTable();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
