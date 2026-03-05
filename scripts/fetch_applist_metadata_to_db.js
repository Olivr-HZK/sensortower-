#!/usr/bin/env node
/**
 * 从 data/appid_list.json 读取 app 列表，批量拉取 metadata 写入 app_metadata 表。
 * 不依赖 Top100 表，可与 workflow_applist_weekly.js 配合使用。
 *
 * 用法：
 *   node fetch_applist_metadata_to_db.js
 *   node fetch_applist_metadata_to_db.js /path/to/appid_list.json
 *
 * appid_list.json 格式：[ { "app_id": "284882215", "platform": "ios" }, { "app_id": "com.xxx", "platform": "android" } ]
 * 已在 app_metadata 中存在的 (app_id, os) 不会再次请求。
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

/** 与 API 响应一致的 app_metadata 表字段（按 /v1/{os}/apps 返回） */
const APP_METADATA_COLUMNS = [
  'app_id',
  'os',
  'name',
  'publisher_name',
  'publisher_id',
  'url',
  'icon_url',
  'canonical_country',
  'humanized_name',
  'active',
  'categories',
  'valid_countries',
];

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
            return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
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

function getStoreUrl(appId, os) {
  const p = String(os || '').toLowerCase();
  if (p === 'ios') return 'https://apps.apple.com/app/id' + appId;
  return 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(appId);
}

function flattenApp(app, os) {
  const row = { app_id: String(app.app_id), os };
  for (const [k, v] of Object.entries(app)) {
    if (k === 'app_id') continue;
    if (v === null || v === undefined) {
      row[k] = null;
    } else if (typeof v === 'object') {
      row[k] = JSON.stringify(v);
    } else {
      row[k] = v;
    }
  }
  if (!row.url) row.url = getStoreUrl(row.app_id, os);
  return row;
}

function getAllKeys(rows) {
  const set = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) set.add(k);
  }
  return [...set];
}

function safeCol(name) {
  return String(name).replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeSqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
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

function ensureDbDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** 获取表中已有列名 */
function getExistingColumns() {
  try {
    const out = execSync(
      `sqlite3 -separator '|' "${DB_FILE}" "PRAGMA table_info(app_metadata);"`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
    return new Set(
      out
        .trim()
        .split('\n')
        .map((line) => line.split('|')[1])
        .filter(Boolean)
    );
  } catch (e) {
    return new Set();
  }
}

/** 按 API 字段建表并补全缺失列，保证能写入 */
function ensureAppMetadataTable() {
  const cols = APP_METADATA_COLUMNS.map((c) => `"${safeCol(c)}" TEXT`).join(', ');
  runSql(
    `CREATE TABLE IF NOT EXISTS app_metadata (${cols}, PRIMARY KEY (app_id, os));`,
    true
  );
  const existing = getExistingColumns();
  for (const col of APP_METADATA_COLUMNS) {
    const safe = safeCol(col);
    if (!existing.has(safe)) {
      try {
        runSql(`ALTER TABLE app_metadata ADD COLUMN "${safe}" TEXT;`, true);
        existing.add(safe);
      } catch (_) {}
    }
  }
}

function insertRow(columns, row) {
  const allowed = columns.filter((c) => APP_METADATA_COLUMNS.includes(c));
  const cols = allowed.map((c) => `"${safeCol(c)}"`).join(', ');
  const vals = allowed.map((c) => escapeSqlValue(row[c] ?? null)).join(', ');
  if (!cols) return;
  runSql(`INSERT OR REPLACE INTO app_metadata (${cols}) VALUES (${vals});`, true);
}

async function fetchBatch(appIds, os, authToken) {
  const params = {
    app_ids: appIds.join(','),
    country: 'US',
    include_sdk_data: 'false',
    auth_token: authToken,
  };
  const url = `${BASE_URL}/${os}/apps?${buildQuery(params)}`;
  const data = await fetchJson(url);
  const apps = data && data.apps ? data.apps : [];
  // 打印一份响应示例，方便调试（只截取首个 app，避免过长）
  try {
    console.log(`\n[${os}] /apps 响应示例：apps=${apps.length}`);
    if (apps.length > 0) {
      console.log(JSON.stringify(apps[0], null, 2).slice(0, 1000));
    } else {
      console.log(JSON.stringify(data, null, 2).slice(0, 1000));
    }
  } catch (_) {
    // 打印失败忽略，不影响主流程
  }
  return apps.map((app) => flattenApp(app, os));
}

/** 从 appid_list.json 读取 { app_id, platform } 列表，按 platform 分组 */
function loadAppList(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) {
    throw new Error('appid_list.json 应为数组');
  }
  const byPlatform = { ios: [], android: [] };
  for (const item of list) {
    const appId = String(item.app_id || item.appId || '').trim();
    const platform = String(item.platform || item.os || '').toLowerCase();
    if (!appId) continue;
    if (platform === 'ios') {
      byPlatform.ios.push(appId);
    } else if (platform === 'android') {
      byPlatform.android.push(appId);
    }
  }
  byPlatform.ios = [...new Set(byPlatform.ios)];
  byPlatform.android = [...new Set(byPlatform.android)];
  return byPlatform;
}

/** 已在 app_metadata 中存在的 (app_id) 按 os */
function getExistingInMetadata(os) {
  try {
    const out = execSync(
      `sqlite3 -separator '|' "${DB_FILE}" "SELECT app_id FROM app_metadata WHERE os = '${os}'"`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
    return new Set(out.trim().split('\n').map((l) => l.split('|')[0].trim()).filter(Boolean));
  } catch (e) {
    return new Set();
  }
}

async function runForPlatform(os, appIds, authToken, forceRefresh) {
  if (appIds.length === 0) {
    console.log(`[${os}] 列表无 app_id，跳过`);
    return;
  }
  const existing = getExistingInMetadata(os);
  const toFetch = forceRefresh ? appIds : appIds.filter((id) => !existing.has(id));
  if (toFetch.length === 0) {
    console.log(`[${os}] 共 ${appIds.length} 个，均已存在于 app_metadata，跳过`);
    return;
  }
  if (forceRefresh) {
    console.log(`[${os}] 列表 ${appIds.length} 个，强制全部拉取`);
  } else {
    console.log(`[${os}] 列表 ${appIds.length} 个，已存在 ${existing.size} 个，待拉取 ${toFetch.length} 个`);
  }

  ensureAppMetadataTable();

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    console.log(`  请求 ${i + 1}-${i + batch.length} / ${toFetch.length} ...`);
    try {
      const rows = await fetchBatch(batch, os, authToken);
      if (rows.length === 0) continue;
      for (const row of rows) {
        insertRow(APP_METADATA_COLUMNS, row);
      }
      console.log(`    写入 ${rows.length} 条`);
    } catch (e) {
      console.error('    失败:', e.message);
    }
    if (i + BATCH_SIZE < toFetch.length) await sleep(DELAY_MS);
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--force');
  const forceRefresh = process.argv.includes('--force');
  let listPath = args[0] || DEFAULT_APPLIST;
  if (!path.isAbsolute(listPath)) {
    listPath = path.join(ROOT, listPath);
  }
  if (!fs.existsSync(listPath)) {
    console.error('未找到 app 列表文件:', listPath);
    console.error('格式示例: [ {"app_id": "284882215", "platform": "ios"}, {"app_id": "com.xxx", "platform": "android"} ]');
    process.exit(1);
  }

  ensureDbDir();
  const authToken = loadEnvToken();
  const byPlatform = loadAppList(listPath);
  console.log('app 列表:', listPath);
  if (forceRefresh) console.log('模式: --force 强制拉取列表中全部 app 的 metadata');
  console.log('  ios:', byPlatform.ios.length, '个, android:', byPlatform.android.length, '个\n');

  for (const os of ['ios', 'android']) {
    await runForPlatform(os, byPlatform[os], authToken, forceRefresh);
  }
  console.log('\n完成。表: app_metadata');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
