#!/usr/bin/env node
/**
 * 1. 从 sensortower_top100.db 的 apple_top100 / android_top100 中抽取 app_id 与 app_name，
 *    写入新表 app_name_cache（同一条 app_id 只保留一条，按平台区分），
 *    供 fetch_top100_to_db.js 拉名时优先读缓存、少调 API。
 * 2. 参考 market_monitor_v1.6.js 对原始数据的处理（国家加符号+中文、榜单类型中文），
 *    为当前库增加 country_display、chart_type_display 并更新内容。
 *
 * 运行：node build_app_cache_and_update_display.js
 */

const path = require('path');
const { execSync } = require('child_process');

const DB_FILE = process.env.SENSORTOWER_DB_FILE ? (require('path').isAbsolute(process.env.SENSORTOWER_DB_FILE) ? process.env.SENSORTOWER_DB_FILE : path.join(__dirname, process.env.SENSORTOWER_DB_FILE)) : path.join(__dirname, 'sensortower_top100.db');

// 与原脚本 market_monitor_v1.6.js 一致
const COUNTRY_NAMES = {
  US: '🇺🇸 美国',
  JP: '🇯🇵 日本',
  GB: '🇬🇧 英国',
  DE: '🇩🇪 德国',
  IN: '🇮🇳 印度',
};

const CHART_TYPE_NAMES = {
  topfreeapplications: '免费榜',
  topgrossingapplications: '畅销榜',
  topselling_free: '免费榜',
  topgrossing: '畅销榜',
};

function runSql(sql, silent) {
  const compact = sql
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  const safe = compact.replace(/"/g, '""');
  const cmd = `sqlite3 "${DB_FILE}" "${safe}"`;
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
    });
  } catch (e) {
    if (silent) return null;
    throw e;
  }
}

function runSqlSilent(sql) {
  return runSql(sql, true);
}

function main() {
  const fs = require('fs');
  if (!fs.existsSync(DB_FILE)) {
    console.error('数据库不存在:', DB_FILE);
    process.exit(1);
  }

  console.log('1. 确保有 app_name 列并创建 app_name_cache，从现有榜单表抽取 …');
  try {
    runSql("ALTER TABLE apple_top100 ADD COLUMN app_name TEXT DEFAULT '';");
  } catch (e) {}
  try {
    runSql("ALTER TABLE android_top100 ADD COLUMN app_name TEXT DEFAULT '';");
  } catch (e) {}
  runSql(`
    CREATE TABLE IF NOT EXISTS app_name_cache (
      app_id TEXT NOT NULL,
      app_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      PRIMARY KEY (app_id, platform)
    );
  `);
  runSql(`
    INSERT OR IGNORE INTO app_name_cache (app_id, app_name, platform)
    SELECT DISTINCT app_id, COALESCE(NULLIF(trim(app_name), ''), app_id), 'ios'
    FROM apple_top100 WHERE app_id IS NOT NULL AND app_id != '';
  `);
  runSql(`
    INSERT OR IGNORE INTO app_name_cache (app_id, app_name, platform)
    SELECT DISTINCT app_id, COALESCE(NULLIF(trim(app_name), ''), app_id), 'android'
    FROM android_top100 WHERE app_id IS NOT NULL AND app_id != '';
  `);
  const countCache = runSqlSilent(
    "SELECT COUNT(*) FROM app_name_cache;"
  );
  console.log('   app_name_cache 行数:', (countCache || '').trim());

  console.log('2. 为 apple_top100 / android_top100 增加展示列并更新 …');
  try {
    runSql("ALTER TABLE apple_top100 ADD COLUMN country_display TEXT;");
  } catch (e) {}
  try {
    runSql("ALTER TABLE apple_top100 ADD COLUMN chart_type_display TEXT;");
  } catch (e) {}

  runSql(`
    UPDATE apple_top100 SET
      country_display = CASE country
        WHEN 'US' THEN '${COUNTRY_NAMES.US}'
        WHEN 'JP' THEN '${COUNTRY_NAMES.JP}'
        WHEN 'GB' THEN '${COUNTRY_NAMES.GB}'
        WHEN 'DE' THEN '${COUNTRY_NAMES.DE}'
        WHEN 'IN' THEN '${COUNTRY_NAMES.IN}'
        ELSE COALESCE(country, '')
      END,
      chart_type_display = CASE chart_type
        WHEN 'topfreeapplications' THEN '${CHART_TYPE_NAMES.topfreeapplications}'
        WHEN 'topgrossingapplications' THEN '${CHART_TYPE_NAMES.topgrossingapplications}'
        ELSE COALESCE(chart_type, '')
      END;
  `);

  try {
    runSql("ALTER TABLE android_top100 ADD COLUMN country_display TEXT;");
  } catch (e) {}
  try {
    runSql("ALTER TABLE android_top100 ADD COLUMN chart_type_display TEXT;");
  } catch (e) {}

  runSql(`
    UPDATE android_top100 SET
      country_display = CASE country
        WHEN 'US' THEN '${COUNTRY_NAMES.US}'
        WHEN 'JP' THEN '${COUNTRY_NAMES.JP}'
        WHEN 'GB' THEN '${COUNTRY_NAMES.GB}'
        WHEN 'DE' THEN '${COUNTRY_NAMES.DE}'
        WHEN 'IN' THEN '${COUNTRY_NAMES.IN}'
        ELSE COALESCE(country, '')
      END,
      chart_type_display = CASE chart_type
        WHEN 'topselling_free' THEN '${CHART_TYPE_NAMES.topselling_free}'
        WHEN 'topgrossing' THEN '${CHART_TYPE_NAMES.topgrossing}'
        ELSE COALESCE(chart_type, '')
      END;
  `);

  console.log('完成。');
}

main();
