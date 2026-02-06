#!/usr/bin/env node
/**
 * 单条测试：调用 GET /v1/{os}/apps 拉取一个 app_id 的 metadata，打印响应并可选写入 DB 一条。
 *
 * 运行：node test_fetch_app_metadata.js [ios|android] [app_id]
 * 默认：ios 284882215
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const BASE_URL = 'https://api.sensortower-china.com/v1';
const DB_FILE = path.join(__dirname, 'sensortower_top100.db');

function loadEnvToken() {
  const envPath = path.join(__dirname, '.env');
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

function flattenApp(app, os) {
  const row = { app_id: String(app.app_id), os };
  for (const [k, v] of Object.entries(app)) {
    if (k === 'app_id') continue;
    if (v === null || v === undefined) row[k] = null;
    else if (typeof v === 'object') row[k] = JSON.stringify(v);
    else row[k] = v;
  }
  return row;
}

function safeCol(name) {
  return String(name).replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeSqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function main() {
  const os = process.argv[2] || 'ios';
  const appId = process.argv[3] || '284882215';

  const authToken = loadEnvToken();
  const params = new URLSearchParams({
    app_ids: appId,
    country: 'US',
    include_sdk_data: 'false',
    auth_token: authToken,
  });
  const url = `${BASE_URL}/${os}/apps?${params}`;
  console.log('请求:', url.replace(authToken, '***'));
  console.log('');

  const data = await fetchJson(url);
  const apps = (data && data.apps) || [];
  if (apps.length === 0) {
    console.log('响应中无 apps，原始 keys:', Object.keys(data || {}));
    return;
  }

  const app = apps[0];
  console.log('--- 单条 app 原始字段（前 20 个）---');
  const keys = Object.keys(app);
  for (let i = 0; i < Math.min(20, keys.length); i++) {
    const k = keys[i];
    const v = app[k];
    const preview = typeof v === 'object' ? JSON.stringify(v).slice(0, 80) + (JSON.stringify(v).length > 80 ? '...' : '') : v;
    console.log(' ', k, ':', preview);
  }
  console.log(' ... 共', keys.length, '个字段');
  console.log('');

  const row = flattenApp(app, os);
  console.log('--- 压平后写入 DB 的列（前 15 个）---');
  const rowKeys = Object.keys(row);
  for (let i = 0; i < Math.min(15, rowKeys.length); i++) {
    const k = rowKeys[i];
    const v = row[k];
    const preview = v == null ? 'NULL' : String(v).slice(0, 60) + (String(v).length > 60 ? '...' : '');
    console.log(' ', k, ':', preview);
  }
  console.log(' ... 共', rowKeys.length, '列');
  console.log('');

  if (!fs.existsSync(DB_FILE)) {
    console.log('数据库不存在，跳过写入。');
    return;
  }

  const cols = rowKeys.map((c) => `"${safeCol(c)}"`).join(', ');
  const vals = rowKeys.map((c) => escapeSqlValue(row[c])).join(', ');
  const createSql = `CREATE TABLE IF NOT EXISTS app_metadata (${rowKeys.map((c) => `"${safeCol(c)}" TEXT`).join(', ')}, PRIMARY KEY (app_id, os));`;
  const insertSql = `INSERT OR REPLACE INTO app_metadata (${cols}) VALUES (${vals});`;
  try {
    execSync(`sqlite3 "${DB_FILE}" "${createSql.replace(/"/g, '""')}"`, { stdio: 'pipe' });
    execSync(`sqlite3 "${DB_FILE}" "${insertSql.replace(/"/g, '""')}"`, { stdio: 'pipe' });
    console.log('已写入 1 条到 app_metadata 表。');
  } catch (e) {
    console.log('写入 DB 失败（可能表已存在且列不同）:', e.message);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
