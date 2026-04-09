const fs = require("fs");
const initSqlJs = require("sql.js");

const DB_PATH = "/Users/oliver/guru/sensortower/data/arrow_madness.db";
const JSON_PATH = "/Users/oliver/guru/sensortower/data/arrow_madness_ranks.json";

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE app_ranks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      country VARCHAR(2) NOT NULL,
      platform VARCHAR(16) NOT NULL,
      device VARCHAR(16) NOT NULL,
      chart_type VARCHAR(32) NOT NULL,
      category VARCHAR(32) NOT NULL,
      category_name VARCHAR(64) NOT NULL,
      app_id VARCHAR(128) NOT NULL,
      rank_date DATE NOT NULL,
      rank INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (app_name, country, platform, device, chart_type, category, app_id, rank_date)
    );
  `);

  const jsonData = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO app_ranks
      (app_name, country, platform, device, chart_type, category, category_name, app_id, rank_date, rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of jsonData) {
    stmt.run([
      item.app_name,
      "US",
      item.platform,
      item.device,
      item.chart_type,
      item.category,
      item.category_name,
      item.app_ids[0],
      item.date,
      item.rank,
    ]);
  }

  stmt.free();
  db.run("VACUUM");

  const buf = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, buf);
  db.close();

  console.log(`已写入 ${jsonData.length} 条记录到 ${DB_PATH}`);
}

main();
