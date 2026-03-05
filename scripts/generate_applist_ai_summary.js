#!/usr/bin/env node
/**
 * 为 App 列表周报生成一份「AI 总结」，按产品比较上周 vs 上上周的
 * downloads / revenue，并写入 SQLite 表 applist_ai_summary。
 *
 * 依赖：
 *   - app_list_weekly_sales_merged：由 fetch_applist_sales_to_db.js 生成
 *   - app_metadata：由 fetch_applist_metadata_to_db.js 写入
 *
 * 用法：
 *   node generate_applist_ai_summary.js
 *     → 自动以「今天所在周的周一」为本周一
 *   node generate_applist_ai_summary.js 2026-02-23
 *     → 显式指定本周一
 *
 * 表结构：
 *   applist_ai_summary (
 *     week_start  TEXT NOT NULL,  -- 本周一（与 week_start 一致）
 *     app_id      TEXT NOT NULL,
 *     platform    TEXT NOT NULL,  -- ios / android
 *     summary_md  TEXT NOT NULL,  -- 一条 markdown 格式的 bullet 文本
 *     created_at  TEXT DEFAULT (datetime('now')),
 *     PRIMARY KEY (week_start, app_id, platform)
 *   );
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DB_FILE = process.env.SENSORTOWER_DB_FILE
  ? (path.isAbsolute(process.env.SENSORTOWER_DB_FILE)
      ? process.env.SENSORTOWER_DB_FILE
      : path.join(ROOT, process.env.SENSORTOWER_DB_FILE))
  : path.join(ROOT, 'data', 'sensortower_applist.db');

function runSql(sql, silent = true) {
  const compact = sql
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
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
  const compact = sql
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
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

function ensureDbDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureSummaryTable() {
  runSql(
    `
    CREATE TABLE IF NOT EXISTS applist_ai_summary (
      week_start TEXT NOT NULL,
      app_id     TEXT NOT NULL,
      platform   TEXT NOT NULL,
      summary_md TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (week_start, app_id, platform)
    );
  `,
    true
  );
}

function dateAdd(ymd, deltaDays) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getThisMonday() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 读 merged 表，返回 map: key = app_id|platform -> { lastWeek, prevWeek } */
function loadMergedRows(weekLast, weekPrev) {
  const out = runSqlReturn(
    `
      SELECT app_id, platform, week_start, downloads, revenue
      FROM app_list_weekly_sales_merged
      WHERE week_start IN (${escapeSqlValue(weekLast)}, ${escapeSqlValue(weekPrev)});
    `
  );
  const map = new Map();
  for (const line of (out || '').trim().split('\n')) {
    if (!line) continue;
    const [appId, platform, weekStart, dlStr, revStr] = line.split('|');
    const key = `${appId}|${platform}`;
    const obj = map.get(key) || { lastWeek: null, prevWeek: null };
    const row = {
      week_start: weekStart,
      downloads: dlStr === '' ? 0 : Number(dlStr),
      revenue: revStr === '' ? 0 : Number(revStr),
    };
    if (weekStart === weekLast) obj.lastWeek = row;
    else if (weekStart === weekPrev) obj.prevWeek = row;
    map.set(key, obj);
  }
  return map;
}

/** 从 app_metadata 读 name、url */
function loadMetadataMap() {
  const out = runSqlReturn(
    `
      SELECT app_id, os, name, url
      FROM app_metadata
    `
  );
  const map = new Map();
  for (const line of (out || '').trim().split('\n')) {
    if (!line) continue;
    const [appId, os, name, url] = line.split('|');
    map.set(`${appId}|${os}`, {
      name: name || appId,
      url: url || '',
    });
  }
  return map;
}

function formatPlatformLabel(platform) {
  const p = String(platform || '').toLowerCase();
  if (p === 'ios') return 'iOS';
  if (p === 'android') return 'Android';
  return platform || '';
}

function buildStoreUrl(appId, platform) {
  const p = String(platform || '').toLowerCase();
  if (p === 'ios') return `https://apps.apple.com/app/id${appId}`;
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}`;
}

/** 把数字转成「约 2,500 万级」「约 80 万级」这种中文描述 */
function humanizeAmountCn(v) {
  const abs = Math.abs(v);
  if (abs >= 1e8) {
    return `约 ${Math.round(abs / 1e6)} 万级`;
  }
  if (abs >= 1e6) {
    return `约 ${Math.round(abs / 1e4)} 万`;
  }
  if (abs >= 1e4) {
    return `约 ${Math.round(abs / 1e3) * 1e3} 级`;
  }
  return `约 ${Math.round(abs)}`;
}

function describeChange(current, previous, label) {
  const diff = current - previous;
  if (previous === 0 && current === 0) {
    return `${label}与上周基本持平`;
  }
  const sign = diff >= 0 ? '+' : '-';
  const abs = Math.abs(diff);
  const amountText = humanizeAmountCn(abs);
  const pct = previous > 0 ? (diff / previous) * 100 : null;

  if (pct !== null) {
    if (pct >= 20) {
      return `${label}较上周明显增加（${sign}${amountText}，约 ${sign}${Math.round(
        Math.abs(pct)
      )}%）`;
    }
    if (pct >= 5) {
      return `${label}较上周有所增长（${sign}${amountText}，约 ${sign}${Math.round(
        Math.abs(pct)
      )}%）`;
    }
    if (pct <= -20) {
      return `${label}较上周明显下滑（${sign}${amountText}，约 ${sign}${Math.round(
        Math.abs(pct)
      )}%）`;
    }
    if (pct <= -5) {
      return `${label}较上周略有下降（${sign}${amountText}，约 ${sign}${Math.round(
        Math.abs(pct)
      )}%）`;
    }
    return `${label}与上周基本持平（${sign}${amountText}，约 ${sign}${Math.round(
      Math.abs(pct)
    )}%）`;
  }

  // previous 为 0，只描述绝对变化
  if (diff > 0) return `${label}较上周从 0 开始放量（${sign}${amountText}）`;
  if (diff < 0) return `${label}较上周回落（${sign}${amountText}）`;
  return `${label}与上周基本持平`;
}

function buildSummaryLine(appId, platform, meta, lastWeek, prevWeek) {
  const name = (meta && meta.name) || appId;
  const url = (meta && meta.url) || buildStoreUrl(appId, platform);
  const platLabel = formatPlatformLabel(platform);

  const revDesc = describeChange(lastWeek.revenue, prevWeek.revenue, '收入');
  const dlDesc = describeChange(lastWeek.downloads, prevWeek.downloads, '下载');

  return `- **[${name}（${platLabel}）](${url})**：${revDesc}，${dlDesc}。`;
}

function upsertSummaryRow(weekStart, appId, platform, summary) {
  runSql(
    `
      INSERT OR REPLACE INTO applist_ai_summary (week_start, app_id, platform, summary_md)
      VALUES (${escapeSqlValue(weekStart)}, ${escapeSqlValue(appId)}, ${escapeSqlValue(
        platform
      )}, ${escapeSqlValue(summary)});
    `,
    true
  );
}

async function main() {
  ensureDbDir();
  ensureSummaryTable();

  const arg = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2].trim())
    ? process.argv[2].trim()
    : null;
  const thisMonday = arg || getThisMonday();
  const lastWeekStart = dateAdd(thisMonday, -7);
  const twoWeeksAgoStart = dateAdd(thisMonday, -14);

  console.log('生成 App 列表 AI 总结，本周一 =', thisMonday);
  console.log('  上周 week_start    =', lastWeekStart);
  console.log('  上上周 week_start  =', twoWeeksAgoStart);

  const mergedMap = loadMergedRows(lastWeekStart, twoWeeksAgoStart);
  const metaMap = loadMetadataMap();

  const lines = [];
  let count = 0;

  for (const [key, v] of mergedMap.entries()) {
    const { lastWeek, prevWeek } = v;
    if (!lastWeek || !prevWeek) continue;
    const [appId, platform] = key.split('|');
    const meta = metaMap.get(`${appId}|${platform}`) || null;
    const line = buildSummaryLine(appId, platform, meta, lastWeek, prevWeek);
    lines.push(line);
    upsertSummaryRow(thisMonday, appId, platform, line);
    count++;
  }

  console.log('\n写入 applist_ai_summary 条数:', count);
  console.log('\n本周 AI 总结示例：\n');
  for (const line of lines) {
    console.log(line);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

