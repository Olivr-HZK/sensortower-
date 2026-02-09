#!/usr/bin/env node
/**
 * 从数据库读取 apple_top100 / android_top100 中的 app_id，
 * 调用 /category/category_history（与 market_monitor_v1.6.js 一致）拉取应用名，
 * 更新两表的 app_name 以及 app_name_cache。
 * 用于修复“库里 app_name 和 app_id 一样、从未拉到真名”的情况。
 *
 * 运行：node refill_app_names.js
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const DB_FILE = process.env.SENSORTOWER_DB_FILE ? (require('path').isAbsolute(process.env.SENSORTOWER_DB_FILE) ? process.env.SENSORTOWER_DB_FILE : path.join(__dirname, process.env.SENSORTOWER_DB_FILE)) : path.join(__dirname, 'sensortower_top100.db');
const BASE_URL_NAMES = 'https://api.sensortower.com/v1';
const CATEGORY_IOS = '7012';
const CATEGORY_ANDROID = 'game_puzzle';
const APP_NAMES_BATCH_SIZE = 30;
const DELAY_MS = 400;

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
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
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

function runSql(sql, silent) {
  const compact = sql.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
  const safe = compact.replace(/"/g, '""');
  const cmd = `sqlite3 "${DB_FILE}" "${safe}"`;
  return execSync(cmd, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' });
}

function runSqlReturn(sql) {
  const compact = sql.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
  const safe = compact.replace(/"/g, '""');
  try {
    return execSync(`sqlite3 -separator '|' "${DB_FILE}" "${safe}"`, { encoding: 'utf8', stdio: 'pipe' }) || '';
  } catch (e) {
    return '';
  }
}

function escapeSqlValue(v) {
  return String(v).replace(/'/g, "''");
}

async function fetchAppNames(appIds, platform, authToken) {
  const nameMap = {};
  if (!appIds || appIds.length === 0) return nameMap;
  const category = platform === 'ios' ? CATEGORY_IOS : CATEGORY_ANDROID;
  const chartType = platform === 'ios' ? 'topfreeapplications' : 'topselling_free';

  for (let i = 0; i < appIds.length; i += APP_NAMES_BATCH_SIZE) {
    const batch = appIds.slice(i, i + APP_NAMES_BATCH_SIZE);
    const params = {
      app_ids: batch.join(','),
      category,
      chart_type_ids: chartType,
      countries: 'US',
      auth_token: authToken,
    };
    const url = `${BASE_URL_NAMES}/${platform}/category/category_history?${buildQuery(params)}`;
    try {
      let data = await fetchJson(url);
      if (data && data.data && typeof data.data === 'object') data = data.data;
      for (const appId of Object.keys(data || {})) {
        if (appId === 'lines') continue;
        const appData = data[appId];
        if (appData && appData.US && appData.US[category] && appData.US[category][chartType]) {
          const t = appData.US[category][chartType];
          nameMap[appId] = t.name || t.humanized_app_name || appId;
        }
      }
    } catch (e) {
      console.error('  拉取应用名失败:', e.message);
    }
    if (i + APP_NAMES_BATCH_SIZE < appIds.length) await sleep(DELAY_MS);
  }
  return nameMap;
}

async function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.error('数据库不存在:', DB_FILE);
    process.exit(1);
  }
  const authToken = loadEnvToken();

  const iosIdsRaw = runSqlReturn("SELECT DISTINCT app_id FROM apple_top100 WHERE app_id IS NOT NULL AND app_id != ''");
  const androidIdsRaw = runSqlReturn("SELECT DISTINCT app_id FROM android_top100 WHERE app_id IS NOT NULL AND app_id != ''");
  const iosIds = [...new Set(iosIdsRaw.trim().split('\n').map((line) => line.split('|')[0].trim()).filter(Boolean))];
  const androidIds = [...new Set(androidIdsRaw.trim().split('\n').map((line) => line.split('|')[0].trim()).filter(Boolean))];

  console.log('iOS 去重 app_id 数:', iosIds.length);
  console.log('Android 去重 app_id 数:', androidIds.length);

  let iosMap = {};
  let androidMap = {};
  if (iosIds.length > 0) {
    console.log('正在拉取 iOS 应用名…');
    iosMap = await fetchAppNames(iosIds, 'ios', authToken);
    console.log('  得到', Object.keys(iosMap).length, '个名称');
  }
  if (androidIds.length > 0) {
    console.log('正在拉取 Android 应用名…');
    androidMap = await fetchAppNames(androidIds, 'android', authToken);
    console.log('  得到', Object.keys(androidMap).length, '个名称');
  }

  for (const [appId, appName] of Object.entries(iosMap)) {
    runSql(`UPDATE apple_top100 SET app_name = '${escapeSqlValue(appName)}' WHERE app_id = '${escapeSqlValue(appId)}'`, true);
  }
  for (const [appId, appName] of Object.entries(androidMap)) {
    runSql(`UPDATE android_top100 SET app_name = '${escapeSqlValue(appName)}' WHERE app_id = '${escapeSqlValue(appId)}'`, true);
  }

  runSql(`DELETE FROM app_name_cache WHERE platform = 'ios'`, true);
  runSql(`DELETE FROM app_name_cache WHERE platform = 'android'`, true);
  for (const [appId, appName] of Object.entries(iosMap)) {
    runSql(`INSERT OR REPLACE INTO app_name_cache (app_id, app_name, platform) VALUES ('${escapeSqlValue(appId)}','${escapeSqlValue(appName)}','ios')`, true);
  }
  for (const [appId, appName] of Object.entries(androidMap)) {
    runSql(`INSERT OR REPLACE INTO app_name_cache (app_id, app_name, platform) VALUES ('${escapeSqlValue(appId)}','${escapeSqlValue(appName)}','android')`, true);
  }

  console.log('已更新 apple_top100 / android_top100 的 app_name，并刷新 app_name_cache。');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
