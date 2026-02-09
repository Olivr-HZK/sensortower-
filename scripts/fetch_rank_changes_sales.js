#!/usr/bin/env node
/**
 * 从 rank_changes 表读取异动的 app_id，按平台分批调用
 * /v1/{ios|android}/sales_report_estimates，获取当周下载量与收益，写回 rank_changes 的 downloads、revenue。
 *
 * 运行：
 *   node fetch_rank_changes_sales.js
 *      → 使用表中已有的 rank_date_current（第一条）作为「本周一」
 *   node fetch_rank_changes_sales.js 2026-02-08
 *      → 传入日期为 end_date，start_date = end_date 前 7 天，拉取该区间下载/收益并写回 rank_changes
 *
 * 每批请求 100 个 app_id。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const BASE_URL = 'https://api.sensortower-china.com/v1';
const DB_FILE = process.env.SENSORTOWER_DB_FILE ? (require('path').isAbsolute(process.env.SENSORTOWER_DB_FILE) ? process.env.SENSORTOWER_DB_FILE : path.join(__dirname, '..', process.env.SENSORTOWER_DB_FILE)) : path.join(__dirname, '..', 'data', 'sensortower_top100.db');
const BATCH_SIZE = 100;
const DELAY_MS = 400;

const COUNTRY_TO_DISPLAY = {
  US: '🇺🇸 美国',
  JP: '🇯🇵 日本',
  GB: '🇬🇧 英国',
  DE: '🇩🇪 德国',
  IN: '🇮🇳 印度',
};

function loadEnvToken() {
  const envPath = path.join(__dirname, '..', '.env');
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

function runSql(sql) {
  const compact = sql.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
  const safe = compact.replace(/"/g, '""');
  execSync(`sqlite3 "${DB_FILE}" "${safe}"`, { encoding: 'utf8', stdio: 'pipe' });
}

function escapeSqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/** 本周一 + 6 天 = 本周日 */
function getWeekEnd(rankDateMonday) {
  const d = new Date(rankDateMonday + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  const y = d.getUTCFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 从周日反推该周周一（end_date - 6 天） */
function getWeekStartFromEnd(endDateStr) {
  const d = new Date(endDateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 6);
  const y = d.getUTCFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 日期加减 N 天，返回 YYYY-MM-DD */
function dateAdd(ymd, deltaDays) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const y = d.getUTCFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 解析 sales_report_estimates 响应，按 (app_id, country) 汇总 downloads 和 revenue */
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
      units = (Number(item.iphone_units ?? item.iu ?? 0) || 0) + (Number(item.ipad_units ?? item.au ?? 0) || 0);
      revenue = (Number(item.iphone_revenue ?? item.ir ?? 0) || 0) + (Number(item.ipad_revenue ?? item.ar ?? 0) || 0);
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
    date_granularity: 'weekly',
    start_date: startDate,
    end_date: endDate,
    data_model: 'DM_2025_Q2',
    auth_token: authToken,
  };
  const url = `${BASE_URL}/${platform}/sales_report_estimates?${buildQuery(params)}`;
  const data = await fetchJson(url);
  return parseResponse(data, platform);
}

async function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.error('数据库不存在:', DB_FILE);
    process.exit(1);
  }

  const authToken = loadEnvToken();

  const dateArg = process.argv[2];
  let rankDateCurrent = null;

  let startDate = null;
  let endDate = null;

  if (dateArg) {
    const d = dateArg.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      console.error('日期格式须为 YYYY-MM-DD，例如 2026-02-08（作为 end_date）');
      process.exit(1);
    }
    endDate = d;
    startDate = dateAdd(d, -7);
    rankDateCurrent = d;
  }

  const out = runSqlReturn(
    rankDateCurrent
      ? `SELECT rank_date_current, app_id, platform, country FROM rank_changes WHERE rank_date_current = '${rankDateCurrent.replace(/'/g, "''")}' LIMIT 1`
      : 'SELECT rank_date_current, app_id, platform, country FROM rank_changes LIMIT 1'
  );
  if (!out || !out.trim()) {
    if (rankDateCurrent) {
      console.error('rank_changes 中无 rank_date_current =', rankDateCurrent, '的数据');
    } else {
      console.error('rank_changes 表为空，请先运行 generate_rank_changes_from_db.js 生成异动榜单');
    }
    process.exit(1);
  }

  if (!rankDateCurrent) {
    rankDateCurrent = out.trim().split('\n')[0].split('|')[0];
  }
  if (!startDate) startDate = dateAdd(rankDateCurrent, -7);
  if (!endDate) endDate = dateAdd(rankDateCurrent, -1);
  console.log('rank_date_current:', rankDateCurrent, '，API 区间 start_date~end_date:', startDate, '~', endDate);

  const whereClause = `WHERE rank_date_current = '${rankDateCurrent.replace(/'/g, "''")}'`;
  const allRows = runSqlReturn(
    `SELECT app_id, platform, country FROM rank_changes ${whereClause}`
  );
  const rows = [];
  for (const line of (allRows || '').trim().split('\n')) {
    if (!line) continue;
    const parts = line.split('|');
    if (parts.length >= 3) {
      const platformRaw = parts[1].trim();
      rows.push({
        app_id: parts[0].trim(),
        platform: platformRaw,
        platformApi: platformRaw.toLowerCase(),
        country: parts[2].trim(),
      });
    }
  }

  const byPlatform = { ios: [], android: [] };
  for (const r of rows) {
    if (r.platformApi === 'ios') byPlatform.ios.push(r);
    else if (r.platformApi === 'android') byPlatform.android.push(r);
  }

  const iosAppIds = [...new Set(byPlatform.ios.map((r) => r.app_id))];
  const androidAppIds = [...new Set(byPlatform.android.map((r) => r.app_id))];

  try {
    runSql('ALTER TABLE rank_changes ADD COLUMN downloads INTEGER;');
  } catch (_) {}
  try {
    runSql('ALTER TABLE rank_changes ADD COLUMN revenue REAL;');
  } catch (_) {}

  const key = (appId, platform, country) => `${appId}|${platform}|${country}`;
  const salesMap = new Map();

  for (const platform of ['ios', 'android']) {
    const appIds = platform === 'ios' ? iosAppIds : androidAppIds;
    if (appIds.length === 0) continue;

    console.log(`[${platform}] 共 ${appIds.length} 个 app_id，分批请求 sales_report_estimates`);
    for (let i = 0; i < appIds.length; i += BATCH_SIZE) {
      const batch = appIds.slice(i, i + BATCH_SIZE);
      try {
        const list = await fetchSalesBatch(batch, platform, startDate, endDate, authToken);
        for (const r of list) {
          const countryDisplay = COUNTRY_TO_DISPLAY[r.country] || r.country;
          const k = key(r.app_id, platform, countryDisplay);
          salesMap.set(k, { downloads: r.downloads, revenue: r.revenue });
        }
        console.log(`  ${i + 1}-${i + batch.length}/${appIds.length} 返回 ${list.length} 条`);
      } catch (e) {
        console.error('  请求失败:', e.message);
      }
      if (i + BATCH_SIZE < appIds.length) await sleep(DELAY_MS);
    }
  }

  let updated = 0;
  for (const r of rows) {
    const k = key(r.app_id, r.platformApi, r.country);
    const s = salesMap.get(k);
    if (s == null) continue;
    const downloads = s.downloads ?? '';
    const revenue = s.revenue ?? '';
    runSql(
      `UPDATE rank_changes SET downloads = ${escapeSqlValue(downloads)}, revenue = ${escapeSqlValue(revenue)} WHERE app_id = ${escapeSqlValue(r.app_id)} AND platform = ${escapeSqlValue(r.platform)} AND country = ${escapeSqlValue(r.country)} AND rank_date_current = ${escapeSqlValue(rankDateCurrent)};`
    );
    updated++;
  }

  console.log('已更新 rank_changes 表 downloads/revenue 共', updated, '条');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
