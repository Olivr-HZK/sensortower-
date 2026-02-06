#!/usr/bin/env node
/**
 * 为 rank_changes 表补全 store_url 列。
 *
 * 优先使用 app_metadata.url（若存在），否则按规则拼接：
 *   iOS: https://apps.apple.com/app/id{app_id}
 *   Android: https://play.google.com/store/apps/details?id={app_id}
 *
 * 运行：node refill_rank_changes_store_url.js
 */

const path = require('path');
const { execSync } = require('child_process');

const DB_FILE = path.join(__dirname, 'sensortower_top100.db');

function runSql(sql, silent) {
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
    return (
      execSync(`sqlite3 -separator '|' "${DB_FILE}" "${safe}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
      }) || ''
    );
  } catch (e) {
    return '';
  }
}

function escapeSqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function getStoreUrl(appId, platform) {
  const p = String(platform || '').toLowerCase();
  if (p === 'ios') return 'https://apps.apple.com/app/id' + appId;
  return 'https://play.google.com/store/apps/details?id=' + appId;
}

function getMetadataUrlMap() {
  const map = new Map();
  const out = runSqlReturn(
    "SELECT app_id, os, url FROM app_metadata WHERE app_id IS NOT NULL AND (os = 'ios' OR os = 'android')"
  );
  for (const line of (out || '').trim().split('\n')) {
    if (!line) continue;
    const parts = line.split('|');
    if (parts.length >= 2) {
      const appId = (parts[0] || '').trim();
      const os = (parts[1] || '').trim().toLowerCase();
      const url = (parts[2] || '').trim();
      map.set(`${appId}|${os}`, url);
    }
  }
  return map;
}

function main() {
  if (!require('fs').existsSync(DB_FILE)) {
    console.error('数据库不存在:', DB_FILE);
    process.exit(1);
  }

  try {
    runSql('ALTER TABLE rank_changes ADD COLUMN store_url TEXT;', true);
  } catch (_) {}

  const urlMap = getMetadataUrlMap();
  const out = runSqlReturn(
    'SELECT rowid, app_id, platform, store_url FROM rank_changes'
  );
  const rows = [];
  for (const line of (out || '').trim().split('\n')) {
    if (!line) continue;
    const parts = line.split('|');
    if (parts.length >= 3) {
      rows.push({
        rowid: (parts[0] || '').trim(),
        app_id: (parts[1] || '').trim(),
        platform: (parts[2] || '').trim(),
        store_url: (parts[3] || '').trim(),
      });
    }
  }

  let filled = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.store_url) {
      skipped++;
      continue;
    }
    const os = String(r.platform || '').toLowerCase();
    const metaUrl = urlMap.get(`${r.app_id}|${os}`) || '';
    const storeUrl = metaUrl || getStoreUrl(r.app_id, r.platform);
    runSql(
      `UPDATE rank_changes SET store_url = ${escapeSqlValue(storeUrl)} WHERE rowid = ${r.rowid};`,
      true
    );
    filled++;
  }

  console.log('rank_changes store_url 已补全：', '填充', filled, '条；跳过已有', skipped, '条');
}

main();
