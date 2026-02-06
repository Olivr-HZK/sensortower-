#!/usr/bin/env node
/**
 * 为 app_metadata 表补全 url（商店链接）。
 *
 * 逻辑与 GOOGLE_SHEETS_CLICKABLE.md 一致：
 *   iOS: https://apps.apple.com/app/id{app_id}
 *   Android: https://play.google.com/store/apps/details?id={app_id}
 *
 * 运行：node refill_app_metadata_url.js
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

function getStoreUrl(appId, os) {
  const p = String(os || '').toLowerCase();
  if (p === 'ios') return 'https://apps.apple.com/app/id' + appId;
  return 'https://play.google.com/store/apps/details?id=' + appId;
}

function main() {
  if (!require('fs').existsSync(DB_FILE)) {
    console.error('数据库不存在:', DB_FILE);
    process.exit(1);
  }

  try {
    runSql('ALTER TABLE app_metadata ADD COLUMN url TEXT;', true);
  } catch (_) {}

  const out = runSqlReturn(
    "SELECT rowid, app_id, os, url FROM app_metadata WHERE app_id IS NOT NULL AND app_id != ''"
  );
  const rows = [];
  for (const line of (out || '').trim().split('\n')) {
    if (!line) continue;
    const parts = line.split('|');
    if (parts.length >= 3) {
      rows.push({
        rowid: parts[0].trim(),
        app_id: parts[1].trim(),
        os: (parts[2] || '').trim(),
        url: (parts[3] || '').trim(),
      });
    }
  }

  let filled = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.url) {
      skipped++;
      continue;
    }
    const storeUrl = getStoreUrl(r.app_id, r.os);
    runSql(
      `UPDATE app_metadata SET url = ${escapeSqlValue(storeUrl)} WHERE rowid = ${r.rowid};`,
      true
    );
    filled++;
  }

  console.log('app_metadata url 已补全：', '填充', filled, '条；跳过已有', skipped, '条');
}

main();
