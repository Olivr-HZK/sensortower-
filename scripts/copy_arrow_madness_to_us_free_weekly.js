#!/usr/bin/env node
/**
 * 将 data/arrow_madness.db 中「Arrow Madness」写入 data/us_free_appid_weekly.db，
 * internal_name **Arrow2**（与 appid_us.json 中 G-058 对应）。
 *
 * 日期选取：优先「最近两个 rank 不全为空的 rank_date」；若最近两周在源库全是 NULL，
 * 则仍复制最近两个日期，并在控制台提示需重新跑 API 拉数。
 *
 * 用法：node scripts/copy_arrow_madness_to_us_free_weekly.js
 */
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const ROOT = path.join(__dirname, "..");
const ARROW_DB = path.join(ROOT, "data", "arrow_madness.db");
const US_FREE_DB = path.join(ROOT, "data", "us_free_appid_weekly.db");

const INTERNAL_NAME = "Arrow2";
const PRODUCT_CODE = "G-058";
const DISPLAY_NAME = "Arrow Madness: Tap Arrows Away";
const APP_NAME_ARROW = "Arrow Madness";

/**
 * @returns {{ dates: string[], warn: string | null }}
 */
function pickRankDates(arrowDb) {
  const all = [];
  let s = arrowDb.prepare(
    `SELECT DISTINCT rank_date FROM app_ranks WHERE app_name = ? ORDER BY rank_date DESC`,
  );
  s.bind([APP_NAME_ARROW]);
  while (s.step()) all.push(s.get()[0]);
  s.free();

  if (all.length === 0) return { dates: [], warn: null };

  const withRank = [];
  for (const d of all) {
    s = arrowDb.prepare(
      `SELECT 1 FROM app_ranks WHERE app_name = ? AND rank_date = ? AND rank IS NOT NULL LIMIT 1`,
    );
    s.bind([APP_NAME_ARROW, d]);
    const ok = s.step();
    s.free();
    if (ok) withRank.push(d);
    if (withRank.length >= 2) break;
  }

  if (withRank.length >= 2) {
    return { dates: withRank.slice(0, 2), warn: null };
  }

  const fallback = all.slice(0, 2);
  const warn =
    withRank.length === 0
      ? "源库 arrow_madness.db 中最近日期 rank 全为 NULL，周报会显示「未上榜」；请在本机执行 compare_and_summarize 或 fetch_app_ranks（需 SENSORTOWER_API_TOKEN）重新拉取后再运行本脚本。"
      : "仅有一个日期含有效 rank，已用「最近两个周日」作为环比区间；若与当前周报日期不一致，请对齐 DATE_NEW/DATE_OLD 或重新拉取源库。";

  return { dates: fallback, warn };
}

async function main() {
  const SQL = await initSqlJs();
  const arrowBuf = fs.readFileSync(ARROW_DB);
  const arrowDb = new SQL.Database(arrowBuf);

  const { dates, warn } = pickRankDates(arrowDb);
  if (dates.length === 0) {
    console.error("arrow_madness.db 中无 Arrow Madness 数据");
    process.exit(1);
  }

  const ph = dates.map(() => "?").join(",");
  const sel = arrowDb.prepare(
    `SELECT country, platform, device, chart_type, category, category_name, app_id, rank_date, rank
     FROM app_ranks WHERE app_name = ? AND rank_date IN (${ph}) ORDER BY rank_date, platform, device, category`,
  );
  sel.bind([APP_NAME_ARROW, ...dates]);
  const rows = [];
  while (sel.step()) {
    const r = sel.get();
    rows.push({
      country: r[0],
      platform: r[1],
      device: r[2],
      chart_type: r[3],
      category: r[4],
      category_name: r[5],
      app_id: r[6],
      rank_date: r[7],
      rank: r[8],
    });
  }
  sel.free();
  arrowDb.close();

  const filled = rows.filter((x) => x.rank != null).length;
  const usBuf = fs.readFileSync(US_FREE_DB);
  const usDb = new SQL.Database(usBuf);

  usDb.run(`DELETE FROM app_ranks WHERE internal_name = ?`, [INTERNAL_NAME]);

  for (const row of rows) {
    usDb.run(
      `INSERT OR REPLACE INTO app_ranks (internal_name, product_code, display_name, country, platform, device, chart_type, category, category_name, app_id, rank_date, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        INTERNAL_NAME,
        PRODUCT_CODE,
        DISPLAY_NAME,
        row.country,
        row.platform,
        row.device,
        row.chart_type,
        String(row.category),
        row.category_name,
        row.app_id,
        row.rank_date,
        row.rank,
      ],
    );
  }

  fs.writeFileSync(US_FREE_DB, Buffer.from(usDb.export()));
  usDb.close();

  console.log(
    `已写入 ${rows.length} 行 → ${US_FREE_DB}（internal_name=${INTERNAL_NAME}，日期: ${dates.join(", ")}，其中 rank 非空 ${filled}/${rows.length}）`,
  );
  if (warn) console.warn(`[提示] ${warn}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
