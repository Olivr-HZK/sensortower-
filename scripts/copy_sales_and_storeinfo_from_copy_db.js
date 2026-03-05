#!/usr/bin/env node
/**
 * 一次性脚本：从 sensortower_top100 copy.db 抄入主库 sensortower_top100.db
 *   1. 下载/收益：为 apple_top100 / android_top100 / rank_changes 补全 downloads、revenue（按主键匹配 copy）
 *   2. 商店页：将 gamestoreinfo、appstoreinfo、gamestoreinfo_changes、appstoreinfo_changes 整表拷入主库
 *
 * 用法：node scripts/copy_sales_and_storeinfo_from_copy_db.js
 * 主库、copy 库路径见下方常量（可改或通过环境变量覆盖）。
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MAIN_DB = process.env.SENSORTOWER_DB_FILE
  ? (path.isAbsolute(process.env.SENSORTOWER_DB_FILE) ? process.env.SENSORTOWER_DB_FILE : path.join(ROOT, process.env.SENSORTOWER_DB_FILE))
  : path.join(ROOT, 'data', 'sensortower_top100.db');
const COPY_DB = path.join(ROOT, 'data', 'sensortower_top100 copy.db');

function runSql(dbPath, sql, optional = false) {
  const compact = sql.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
  const safe = compact.replace(/"/g, '""');
  try {
    execSync(`sqlite3 "${dbPath.replace(/"/g, '\\"')}" "${safe}"`, { encoding: 'utf8', stdio: 'pipe', shell: true });
  } catch (e) {
    if (!optional) throw e;
  }
}

function runSqlReturn(dbPath, sql) {
  const compact = sql.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
  const safe = compact.replace(/"/g, '""');
  try {
    const out = execSync(`sqlite3 -separator '|' "${dbPath.replace(/"/g, '\\"')}" "${safe}"`, { encoding: 'utf8', stdio: 'pipe', shell: true });
    return typeof out === 'string' ? out : String(out || '');
  } catch (e) {
    return '';
  }
}

function main() {
  if (!fs.existsSync(COPY_DB)) {
    console.error('copy 库不存在:', COPY_DB);
    process.exit(1);
  }
  if (!fs.existsSync(MAIN_DB)) {
    console.error('主库不存在:', MAIN_DB);
    process.exit(1);
  }

  console.log('主库:', MAIN_DB);
  console.log('copy 库:', COPY_DB);

  // 1) 主库 top100 表如无 downloads/revenue 则添加
  console.log('\n1. 主库 apple_top100 / android_top100 添加 downloads、revenue 列（若不存在）');
  try {
    runSql(MAIN_DB, 'ALTER TABLE apple_top100 ADD COLUMN downloads REAL;', true);
    runSql(MAIN_DB, 'ALTER TABLE apple_top100 ADD COLUMN revenue REAL;', true);
    runSql(MAIN_DB, 'ALTER TABLE android_top100 ADD COLUMN downloads REAL;', true);
    runSql(MAIN_DB, 'ALTER TABLE android_top100 ADD COLUMN revenue REAL;', true);
  } catch (_) {}

  // 2) 用 ATTACH 从 copy 更新主库的 downloads/revenue（按主键匹配）
  console.log('\n2. 从 copy 同步 apple_top100 / android_top100 / rank_changes 的 downloads、revenue');
  const attachPath = COPY_DB.replace(/'/g, "''");
  const attach = `ATTACH DATABASE '${attachPath}' AS copy_db;`;
  const detach = 'DETACH DATABASE copy_db;';

  const updateApple = `
    UPDATE apple_top100 SET
      downloads = (SELECT c.downloads FROM copy_db.apple_top100 c WHERE c.rank_date = apple_top100.rank_date AND c.country = apple_top100.country AND c.chart_type = apple_top100.chart_type AND c.rank = apple_top100.rank AND c.app_id = apple_top100.app_id),
      revenue   = (SELECT c.revenue   FROM copy_db.apple_top100 c WHERE c.rank_date = apple_top100.rank_date AND c.country = apple_top100.country AND c.chart_type = apple_top100.chart_type AND c.rank = apple_top100.rank AND c.app_id = apple_top100.app_id)
    WHERE EXISTS (SELECT 1 FROM copy_db.apple_top100 c WHERE c.rank_date = apple_top100.rank_date AND c.country = apple_top100.country AND c.chart_type = apple_top100.chart_type AND c.rank = apple_top100.rank AND c.app_id = apple_top100.app_id);
  `;
  const updateAndroid = `
    UPDATE android_top100 SET
      downloads = (SELECT c.downloads FROM copy_db.android_top100 c WHERE c.rank_date = android_top100.rank_date AND c.country = android_top100.country AND c.chart_type = android_top100.chart_type AND c.rank = android_top100.rank AND c.app_id = android_top100.app_id),
      revenue   = (SELECT c.revenue   FROM copy_db.android_top100 c WHERE c.rank_date = android_top100.rank_date AND c.country = android_top100.country AND c.chart_type = android_top100.chart_type AND c.rank = android_top100.rank AND c.app_id = android_top100.app_id)
    WHERE EXISTS (SELECT 1 FROM copy_db.android_top100 c WHERE c.rank_date = android_top100.rank_date AND c.country = android_top100.country AND c.chart_type = android_top100.chart_type AND c.rank = android_top100.rank AND c.app_id = android_top100.app_id);
  `;
  const updateRc = `
    UPDATE rank_changes SET
      downloads = (SELECT c.downloads FROM copy_db.rank_changes c WHERE c.rank_date_current = rank_changes.rank_date_current AND c.app_id = rank_changes.app_id AND c.platform = rank_changes.platform AND c.country = rank_changes.country),
      revenue   = (SELECT c.revenue   FROM copy_db.rank_changes c WHERE c.rank_date_current = rank_changes.rank_date_current AND c.app_id = rank_changes.app_id AND c.platform = rank_changes.platform AND c.country = rank_changes.country)
    WHERE EXISTS (SELECT 1 FROM copy_db.rank_changes c WHERE c.rank_date_current = rank_changes.rank_date_current AND c.app_id = rank_changes.app_id AND c.platform = rank_changes.platform AND c.country = rank_changes.country);
  `;

  runSql(MAIN_DB, attach + updateApple + updateAndroid + updateRc + detach);

  // 3) 商店表：从 copy 导出 schema + 数据，导入主库
  console.log('\n3. 商店表：gamestoreinfo / appstoreinfo / gamestoreinfo_changes / appstoreinfo_changes 拷入主库');
  const storeTables = ['gamestoreinfo', 'appstoreinfo', 'gamestoreinfo_changes', 'appstoreinfo_changes'];
  for (const table of storeTables) {
    const schema = runSqlReturn(COPY_DB, `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table.replace(/'/g, "''")}';`);
    const createSql = String(schema || '').trim();
    if (!createSql || !createSql.startsWith('CREATE')) {
      console.log('  skip', table, '(copy 中无此表或无 schema)');
      continue;
    }
    runSql(MAIN_DB, 'DROP TABLE IF EXISTS ' + table + ';', true);
    runSql(MAIN_DB, createSql.endsWith(';') ? createSql : createSql + ';');
    const cols = runSqlReturn(COPY_DB, `PRAGMA table_info(${table});`);
    const colNames = (cols || '')
      .trim()
      .split('\n')
      .map((line) => line.split('|')[1])
      .filter(Boolean);
    if (colNames.length === 0) continue;
    const colList = colNames.join(', ');
    const count = runSqlReturn(COPY_DB, `SELECT COUNT(*) FROM ${table};`).trim().split('|')[0] || '0';
    if (Number(count) === 0) {
      console.log('  ', table, ': 0 行');
      continue;
    }
    const insertSql = `INSERT OR REPLACE INTO main.${table} (${colList}) SELECT ${colList} FROM copy_db.${table};`;
    runSql(MAIN_DB, attach + insertSql + detach);
    console.log('  ', table, ':', count, '行');
  }

  console.log('\n完成。主库已包含 copy 的下载/收益（匹配行）与商店页表。');
}

main();
