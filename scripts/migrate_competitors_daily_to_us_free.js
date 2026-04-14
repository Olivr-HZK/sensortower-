#!/usr/bin/env node
/**
 * 将旧库 data/appid_us_competitors_daily.db（app_ranks.app_name）迁入 data/us_free_appid_weekly.db
 * （app_ranks.internal_name 等与 us_free 周报脚本一致）。可重复执行：INSERT OR REPLACE。
 *
 * 用法：node scripts/migrate_competitors_daily_to_us_free.js
 */

const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const ROOT = path.join(__dirname, "..");
const OLD_DB = path.join(ROOT, "data", "appid_us_competitors_daily.db");
const TARGET_DB = path.join(ROOT, "data", "us_free_appid_weekly.db");

function ensureUsFreeWeeklyDbSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_ranks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      internal_name TEXT NOT NULL,
      product_code TEXT,
      display_name TEXT,
      country VARCHAR(8) NOT NULL,
      platform VARCHAR(16) NOT NULL,
      device VARCHAR(16) NOT NULL,
      chart_type VARCHAR(64) NOT NULL,
      category VARCHAR(64) NOT NULL,
      category_name VARCHAR(128) NOT NULL,
      app_id VARCHAR(256) NOT NULL,
      rank_date DATE NOT NULL,
      rank INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(internal_name, platform, device, chart_type, category, app_id, rank_date)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS weekly_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_from DATE NOT NULL,
      date_to DATE NOT NULL,
      summary_text TEXT NOT NULL,
      product_count INTEGER,
      line_count INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function ensureRankSubjectsSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS rank_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL UNIQUE,
      root_internal_name TEXT NOT NULL,
      subject_role TEXT NOT NULL,
      competitor_name TEXT,
      display_name TEXT,
      product_code TEXT,
      apple_app_id TEXT,
      google_app_id TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_rank_subjects_root ON rank_subjects(root_internal_name);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_rank_subjects_role ON rank_subjects(subject_role);`);
}

function tableColumns(db, table) {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const names = [];
  while (stmt.step()) {
    const r = stmt.getAsObject();
    names.push(r.name);
  }
  stmt.free();
  return names;
}

async function main() {
  if (!fs.existsSync(OLD_DB)) {
    console.log("未找到旧库，跳过迁移:", OLD_DB);
    return;
  }

  const SQL = await initSqlJs();
  const oldDb = new SQL.Database(fs.readFileSync(OLD_DB));
  const arCols = tableColumns(oldDb, "app_ranks");
  if (!arCols.includes("app_name")) {
    console.log("旧库 app_ranks 无 app_name 列（可能已非竞品旧格式），跳过。");
    oldDb.close();
    return;
  }

  let targetDb;
  if (fs.existsSync(TARGET_DB)) {
    targetDb = new SQL.Database(fs.readFileSync(TARGET_DB));
  } else {
    targetDb = new SQL.Database();
  }
  ensureUsFreeWeeklyDbSchema(targetDb);
  ensureRankSubjectsSchema(targetDb);

  const joinSql = `
    SELECT ar.app_name, ar.country, ar.platform, ar.device, ar.chart_type, ar.category, ar.category_name, ar.app_id, ar.rank_date, ar.rank,
           COALESCE(rs.product_code, '') AS pc,
           COALESCE(NULLIF(TRIM(rs.display_name), ''), ar.app_name) AS dn
    FROM app_ranks ar
    LEFT JOIN rank_subjects rs ON rs.app_name = ar.app_name
  `;
  const stmt = oldDb.prepare(joinSql);
  let n = 0;
  while (stmt.step()) {
    const row = stmt.getAsObject();
    targetDb.run(
      `INSERT OR REPLACE INTO app_ranks (internal_name, product_code, display_name, country, platform, device, chart_type, category, category_name, app_id, rank_date, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.app_name,
        row.pc,
        row.dn,
        row.country,
        row.platform,
        row.device,
        row.chart_type,
        row.category,
        row.category_name,
        row.app_id,
        row.rank_date,
        row.rank,
      ]
    );
    n++;
  }
  stmt.free();
  console.log(`app_ranks 已迁移 ${n} 行 → ${TARGET_DB}`);

  const rsCols = tableColumns(oldDb, "rank_subjects");
  if (rsCols.length) {
    const rsStmt = oldDb.prepare(`SELECT * FROM rank_subjects`);
    let m = 0;
    while (rsStmt.step()) {
      const o = rsStmt.getAsObject();
      const upd = o.updated_at != null && String(o.updated_at).trim() !== "" ? String(o.updated_at).trim() : null;
      targetDb.run(
        `INSERT OR REPLACE INTO rank_subjects (app_name, root_internal_name, subject_role, competitor_name, display_name, product_code, apple_app_id, google_app_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
        [
          o.app_name,
          o.root_internal_name,
          o.subject_role,
          o.competitor_name ?? null,
          o.display_name ?? null,
          o.product_code ?? null,
          o.apple_app_id ?? null,
          o.google_app_id ?? null,
          upd,
        ]
      );
      m++;
    }
    rsStmt.free();
    console.log(`rank_subjects 已迁移 ${m} 行 → ${TARGET_DB}`);
  } else {
    console.log("旧库无 rank_subjects 表，跳过。");
  }

  fs.writeFileSync(TARGET_DB, Buffer.from(targetDb.export()));
  targetDb.close();
  oldDb.close();
  console.log("完成。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
