#!/usr/bin/env node
/**
 * 指定产品 + 竞品 · 每日榜单变化（独立工作流）
 *
 * - 榜单维度与根目录 fetch_app_ranks.js 一致：iPhone / iPad / Android × Games、Casual、Puzzle（免费榜）
 * - 本品与竞品来自 data/appid_us.json（默认），通过 internal_name 或 product_code 指定一条产品记录
 * - 日期默认与 US 免费日报一致：昨天 vs 前天（US_FREE_DAILY_CALENDAR_TZ，默认 Asia/Shanghai）
 * - 数据写入 data/us_free_appid_weekly.db（与 US 免费榜日报/周报同库）：`app_ranks` 与周报脚本列一致（internal_name 等）；`rank_subjects` 存本品/竞品标签（rank_subjects.app_name 与 app_ranks.internal_name 对应）
 *
 * 用法：
 *   node scripts/arrow_madness_daily_competitors.js
 *   node scripts/arrow_madness_daily_competitors.js --internal-name Arrow2
 *   node scripts/arrow_madness_daily_competitors.js -n Arrow2
 *   node scripts/arrow_madness_daily_competitors.js --product G-058
 *   node scripts/arrow_madness_daily_competitors.js 2026-04-08 2026-04-09 --internal-name Solitaire
 *   APPID_US_COMPETITORS_INTERNAL_NAME=WaterSort node scripts/arrow_madness_daily_competitors.js
 *   node scripts/arrow_madness_daily_competitors.js --no-feishu
 *   node scripts/arrow_madness_daily_competitors.js --dry-run
 *
 * 未指定产品时默认 internal_name=Arrow2（可用环境变量 APPID_US_COMPETITORS_INTERNAL_NAME 覆盖）
 */

const fs = require("fs");
const https = require("https");
const path = require("path");
const initSqlJs = require("sql.js");
const { getRankFromData } = require("../arrow_madness_rank_parse.js");
const {
  queryDimensionKey,
  rankCompactLabel,
  buildFeishuCompareTableInteractiveCard,
} = require("./feishu_compare_table_kit.js");
const { walkFeishuInteractivePayload } = require("./feishu_shrink_inline_images.js");

const ROOT = path.join(__dirname, "..");

function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv(path.join(ROOT, ".env"));

const API_TOKEN = process.env.SENSORTOWER_API_TOKEN;
const COUNTRY = "US";
const SENSORTOWER_API_HOST = "api.sensortower-china.com";
const DEFAULT_APPID_US = path.join(ROOT, "data", "appid_us.json");

function getCompetitorsDbPath() {
  const p = process.env.APPID_US_COMPETITORS_DB;
  if (!p || !String(p).trim()) return path.join(ROOT, "data", "us_free_appid_weekly.db");
  const s = String(p).trim();
  return path.isAbsolute(s) ? s : path.join(ROOT, s);
}

/** 与 scripts/us_free_appid_weekly_rank_changes.js 中库结构一致，便于同库共存 */
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

const httpsAgent = new https.Agent({ keepAlive: false, maxSockets: 1 });
const REQUEST_TIMEOUT_MS = 90000;
const MAX_RETRIES = 6;
const BETWEEN_QUERIES_MS = 600;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function addDays(ymd, delta) {
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function calendarDateYMDInTz(timeZone, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDefaultDailyDateRange() {
  const tz = String(process.env.US_FREE_DAILY_CALENDAR_TZ || "Asia/Shanghai").trim() || "Asia/Shanghai";
  const today = calendarDateYMDInTz(tz);
  const dateNew = addDays(today, -1);
  const dateOld = addDays(dateNew, -1);
  return { dateOld, dateNew, tz };
}

/** @param {string|null} appleId @param {string|null} googleId */
function buildQueriesForApp(appleId, googleId) {
  const out = [];
  const apple = appleId && String(appleId).trim() ? String(appleId).trim() : null;
  const google = googleId && String(googleId).trim() ? String(googleId).trim() : null;

  if (apple) {
    out.push(
      { os: "ios", app_ids: [apple], category: "6014", chart_type_ids: ["topfreeapplications"], device: "iphone", category_name: "Games" },
      { os: "ios", app_ids: [apple], category: "7003", chart_type_ids: ["topfreeapplications"], device: "iphone", category_name: "Games/Casual" },
      { os: "ios", app_ids: [apple], category: "7012", chart_type_ids: ["topfreeapplications"], device: "iphone", category_name: "Games/Puzzle" },
      { os: "ios", app_ids: [apple], category: "6014", chart_type_ids: ["topfreeipadapplications"], device: "ipad", category_name: "Games" },
      { os: "ios", app_ids: [apple], category: "7003", chart_type_ids: ["topfreeipadapplications"], device: "ipad", category_name: "Games/Casual" },
      { os: "ios", app_ids: [apple], category: "7012", chart_type_ids: ["topfreeipadapplications"], device: "ipad", category_name: "Games/Puzzle" }
    );
  }
  if (google) {
    out.push(
      { os: "android", app_ids: [google], category: "game", chart_type_ids: ["topselling_free"], device: "android", category_name: "Game" },
      { os: "android", app_ids: [google], category: "game_casual", chart_type_ids: ["topselling_free"], device: "android", category_name: "Game/Casual" },
      { os: "android", app_ids: [google], category: "game_puzzle", chart_type_ids: ["topselling_free"], device: "android", category_name: "Game/Puzzle" }
    );
  }
  return out;
}

function formatRankCompactLine(q, oldRank, newRank) {
  const label = rankCompactLabel(q);
  const o = oldRank;
  const n = newRank;
  if (o == null && n == null) return `${label}：均未上榜`;
  if (o == null && n != null) return `${label}：未上榜-${n}（新上榜）`;
  if (o != null && n == null) return `${label}：${o}-未上榜（跌出）`;
  if (o === n) return `${label}：${o}-${n}（0）`;
  const diff = o - n;
  const paren = diff > 0 ? `+${diff}` : `${diff}`;
  return `${label}：${o}-${n}（${paren}）`;
}

function callCategoryHistoryApiOnce(q, date) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const params = new URLSearchParams({
      app_ids: q.app_ids.join(","),
      category: q.category,
      chart_type_ids: q.chart_type_ids.join(","),
      countries: COUNTRY,
      start_date: date,
      end_date: date,
    });

    const options = {
      hostname: SENSORTOWER_API_HOST,
      path: `/v1/${q.os}/category/category_history?${params.toString()}`,
      method: "GET",
      agent: httpsAgent,
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Connection: "close",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        req.setTimeout(0);
        if (res.statusCode && res.statusCode >= 400) {
          console.error(`[WARN] HTTP ${res.statusCode}: ${data.slice(0, 200)}`);
          done(null);
          return;
        }
        try {
          done(JSON.parse(data));
        } catch (e) {
          console.error(`[WARN] Parse error: ${data.slice(0, 200)}`);
          done(null);
        }
      });
    });

    req.on("error", (e) => {
      req.setTimeout(0);
      console.error(`[WARN] Request error: ${e.message}`);
      done(null);
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.setTimeout(0);
      req.destroy();
      console.error(`[WARN] Timeout (${REQUEST_TIMEOUT_MS}ms)`);
      done(null);
    });

    req.end();
  });
}

async function callCategoryHistoryApi(q, date) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const data = await callCategoryHistoryApiOnce(q, date);
    if (data !== null) return data;
    if (attempt < MAX_RETRIES) {
      const backoff = Math.min(2500 * 2 ** (attempt - 1), 45000);
      console.error(`       → 第 ${attempt}/${MAX_RETRIES} 次失败，${Math.round(backoff / 1000)}s 后重试...`);
      await sleep(backoff);
    }
  }
  return null;
}

function loadAppidUsList(jsonPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  return Array.isArray(raw) ? raw : raw.apps || raw.items || [];
}

/**
 * @param {object[]} list
 * @param {{ internalName?: string|null, productCode?: string|null }} sel
 */
function resolveAppRow(list, sel) {
  const code = sel.productCode && String(sel.productCode).trim();
  const name = sel.internalName && String(sel.internalName).trim();
  if (code) {
    const row = list.find((r) => r && String(r.product_code || "").trim() === code);
    if (!row) throw new Error(`未在 appid_us 中找到 product_code 为「${code}」的记录`);
    return row;
  }
  if (name) {
    const row = list.find((r) => r && String(r.internal_name || "").trim() === name);
    if (!row) throw new Error(`未在 appid_us 中找到 internal_name 为「${name}」的记录`);
    return row;
  }
  throw new Error("需指定产品：--internal-name <internal_name> 或 --product <product_code>，或环境变量 APPID_US_COMPETITORS_INTERNAL_NAME");
}

/** @returns {{ appName: string, shortLabel: string, queries: object[], ids: object, subjectRole: 'self'|'competitor', competitorName: string|null }[]} */
function buildSubjects(row) {
  const internal = String(row.internal_name || "").trim() || "product";
  const subjects = [];
  const apple = row.apple_app_id ? String(row.apple_app_id).trim() : null;
  const google = row.google_app_id ? String(row.google_app_id).trim() : null;
  const mainQueries = buildQueriesForApp(apple, google);
  if (mainQueries.length === 0) {
    throw new Error(`「${internal}」未配置 apple_app_id / google_app_id，无法拉榜`);
  }
  const baseIds = {
    country: COUNTRY,
    st_overview_parent_id: row.st_overview_parent_id != null ? String(row.st_overview_parent_id).trim() || null : null,
  };
  subjects.push({
    appName: internal,
    shortLabel: String(row.display_name || row.internal_name || "").trim() || internal,
    queries: mainQueries,
    ids: { apple_app_id: apple, google_app_id: google, ...baseIds },
    subjectRole: "self",
    competitorName: null,
  });

  const comps = Array.isArray(row.competitors) ? row.competitors : [];
  for (const c of comps) {
    const cname = String(c.name || "").trim();
    if (!cname) continue;
    const ca = c.apple_app_id != null && String(c.apple_app_id).trim() !== "" ? String(c.apple_app_id).trim() : null;
    const cg = c.google_app_id != null && String(c.google_app_id).trim() !== "" ? String(c.google_app_id).trim() : null;
    const qs = buildQueriesForApp(ca, cg);
    if (qs.length === 0) continue;
    subjects.push({
      appName: `${internal}·竞品·${cname}`,
      shortLabel: cname,
      queries: qs,
      ids: { apple_app_id: ca, google_app_id: cg, ...baseIds },
      subjectRole: "competitor",
      competitorName: cname,
    });
  }
  return subjects;
}

/** 创建 rank_subjects（本品/竞品元数据；app_name 列与 app_ranks.internal_name 取值一致） */
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

/** 每次运行按当前 subjects 写入/更新 rank_subjects（同库可并存多 root 产品行） */
function syncRankSubjects(db, subjects, appRow) {
  const root = String(appRow.internal_name || "").trim();
  const pcode = appRow.product_code != null && String(appRow.product_code).trim() !== "" ? String(appRow.product_code).trim() : null;
  for (const s of subjects) {
    const role = s.subjectRole === "competitor" ? "competitor" : "self";
    const compName = role === "competitor" && s.competitorName ? String(s.competitorName).trim() : null;
    const display = String(s.shortLabel || "").trim();
    const ai = s.ids && s.ids.apple_app_id != null ? String(s.ids.apple_app_id).trim() : null;
    const gi = s.ids && s.ids.google_app_id != null ? String(s.ids.google_app_id).trim() : null;
    db.run(
      `INSERT OR REPLACE INTO rank_subjects (app_name, root_internal_name, subject_role, competitor_name, display_name, product_code, apple_app_id, google_app_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [s.appName, root, role, compName, display, pcode, ai, gi]
    );
  }
}

/** 与 us_free compare-table 相同 block 结构，供飞书表格组件使用 */
function buildCompareBlockFromSections(sections, appRow) {
  const mainSec = sections[0];
  const rankEntries = mainSec.subject.queries.map((q) => {
    const k = queryDimensionKey(q);
    return {
      q,
      oldRank: mainSec.oldRanks[k],
      newRank: mainSec.newRanks[k],
    };
  });
  const block = {
    internalName: appRow.internal_name,
    displayName: appRow.display_name,
    rankEntries,
    competitorPanels: [],
    ids: { ...mainSec.subject.ids },
  };
  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    const m = new Map();
    for (const q of sec.subject.queries) {
      const k = queryDimensionKey(q);
      m.set(queryDimensionKey(q), {
        q,
        oldRank: sec.oldRanks[k],
        newRank: sec.newRanks[k],
      });
    }
    const compRankEntries = rankEntries.map((pe) => {
      const hit = m.get(queryDimensionKey(pe.q));
      return hit || { q: pe.q, oldRank: null, newRank: null };
    });
    block.competitorPanels.push({
      internalName: sec.subject.shortLabel,
      displayName: sec.subject.shortLabel,
      feishuLabel: sec.subject.shortLabel,
      rankEntries: compRankEntries,
      ids: { ...sec.subject.ids },
    });
  }
  return block;
}

/** 用于输出文件名 */
function safeFileSlug(s) {
  return String(s).trim().replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_") || "product";
}

/**
 * @param {object} appRow appid_us 中解析出的产品行（用于本品 product_code；竞品行 product_code 置空）
 */
async function fetchRankMapForDate(sqlDb, subject, appRow, dateStr, writeDb) {
  const internalName = subject.appName;
  const pcode =
    subject.subjectRole === "self" && appRow.product_code != null && String(appRow.product_code).trim() !== ""
      ? String(appRow.product_code).trim()
      : "";
  const displayName = String(subject.shortLabel || "").trim();

  const out = {};
  for (let i = 0; i < subject.queries.length; i++) {
    const q = subject.queries[i];
    if (i > 0) await sleep(BETWEEN_QUERIES_MS);
    const key = queryDimensionKey(q);
    const stmt = sqlDb.prepare(
      `SELECT rank FROM app_ranks WHERE internal_name = ? AND country = ? AND platform = ? AND device = ? AND chart_type = ? AND category = ? AND app_id = ? AND rank_date = ?`
    );
    stmt.bind([internalName, COUNTRY, q.os, q.device, q.chart_type_ids[0], q.category, q.app_ids[0], dateStr]);
    let rank = null;
    let fromDb = false;
    if (stmt.step()) {
      const row = stmt.get();
      rank = row[0];
      fromDb = true;
    }
    stmt.free();

    const label = `${q.device}/${q.category_name}`;
    if (fromDb) {
      process.stdout.write(` [DB] ${subject.shortLabel} ${dateStr} ${label} `);
      console.log(rank !== null ? `#${rank}` : "未上榜");
    } else {
      process.stdout.write(` [API] ${subject.shortLabel} ${dateStr} ${label} `);
      const data = await callCategoryHistoryApi(q, dateStr);
      rank = data ? getRankFromData(data, q, dateStr) : null;
      if (writeDb) {
        sqlDb.run(
          `INSERT OR REPLACE INTO app_ranks (internal_name, product_code, display_name, country, platform, device, chart_type, category, category_name, app_id, rank_date, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            internalName,
            pcode,
            displayName,
            COUNTRY,
            q.os,
            q.device,
            q.chart_type_ids[0],
            q.category,
            q.category_name,
            q.app_ids[0],
            dateStr,
            rank,
          ]
        );
      }
      console.log(rank !== null ? `#${rank}` : "未上榜");
    }
    out[key] = rank;
  }
  return out;
}

/** 发送飞书交互卡片（完整 JSON，与 us_free 对比表一致） */
function sendFeishuPayload(webhookUrl, payload) {
  walkFeishuInteractivePayload(payload);
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const body = JSON.stringify(payload);
    const options = {
      hostname: url.hostname,
      path: url.pathname + (url.search || ""),
      port: 443,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0 || json.StatusCode === 0) resolve("ok");
          else reject(new Error(`Feishu error: ${data.slice(0, 300)}`));
        } catch (e) {
          reject(new Error(`Feishu parse error: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error("Feishu timeout"));
    });
    req.write(body);
    req.end();
  });
}

/**
 * @returns {{ noFeishu: boolean, dryRun: boolean, dates: string[], internalName: string|null, productCode: string|null, appidUsPath: string }}
 */
function parseArgs(argv) {
  const o = {
    noFeishu: false,
    dryRun: false,
    dates: [],
    internalName: null,
    productCode: null,
    appidUsPath: DEFAULT_APPID_US,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-feishu") o.noFeishu = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--internal-name" || a === "-n") {
      const v = argv[i + 1];
      if (v && !String(v).startsWith("--")) {
        o.internalName = String(v).trim();
        i++;
      }
    } else if (a === "--product" || a === "--product-code") {
      const v = argv[i + 1];
      if (v && !String(v).startsWith("--")) {
        o.productCode = String(v).trim();
        i++;
      }
    } else if (a === "--appid-us") {
      const v = argv[i + 1];
      if (v && !String(v).startsWith("--")) {
        o.appidUsPath = path.isAbsolute(v) ? v : path.join(ROOT, v);
        i++;
      }
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) {
      o.dates.push(a);
    } else if (a.startsWith("--")) {
      console.warn(`未知参数: ${a}`);
    } else {
      // 位置参数：若尚未指定 internal/product，第一个非日期字符串视为 internal_name
      if (!o.internalName && !o.productCode) o.internalName = String(a).trim();
    }
  }
  return o;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const dbPath = getCompetitorsDbPath();

  let internalName = flags.internalName;
  let productCode = flags.productCode;
  if (!internalName && !productCode) {
    const d = String(process.env.APPID_US_COMPETITORS_INTERNAL_NAME || "Arrow2").trim();
    if (d) internalName = d;
  }

  if (!fs.existsSync(flags.appidUsPath)) {
    console.error(`未找到 appid_us 文件: ${flags.appidUsPath}`);
    process.exit(1);
  }
  const appidList = loadAppidUsList(flags.appidUsPath);
  const appRow = resolveAppRow(appidList, { internalName, productCode });
  const subjects = buildSubjects(appRow);
  const productKey = safeFileSlug(String(appRow.internal_name || "product"));
  const productTitle = String(appRow.display_name || appRow.internal_name || "").trim() || productKey;

  let DATE_OLD;
  let DATE_NEW;
  let tz;
  if (flags.dates.length >= 2) {
    DATE_OLD = flags.dates[0];
    DATE_NEW = flags.dates[1];
    tz = "(命令行指定)";
  } else if (flags.dates.length === 1) {
    DATE_NEW = flags.dates[0];
    DATE_OLD = addDays(DATE_NEW, -1);
    tz = "(命令行指定)";
  } else {
    const r = getDefaultDailyDateRange();
    DATE_OLD = r.dateOld;
    DATE_NEW = r.dateNew;
    tz = r.tz;
  }

  console.log(
    `「${productTitle}」(${appRow.internal_name}${appRow.product_code ? ` · ${appRow.product_code}` : ""}) + 竞品 · 日环比 ${DATE_OLD} → ${DATE_NEW}（日历时区 ${tz}；与 fetch_app_ranks 相同 9 维模板，按包实际缺省 iOS/Android）`
  );
  console.log(`数据源: ${flags.appidUsPath}`);
  console.log(`共 ${subjects.length} 个主体（本品 + ${subjects.length - 1} 个竞品）\n`);

  if (flags.dryRun) {
    for (const s of subjects) {
      console.log(`- ${s.shortLabel}（${s.appName}）：${s.queries.length} 条维度`);
    }
    process.exit(0);
  }

  if (!API_TOKEN) {
    console.error("请配置 SENSORTOWER_API_TOKEN");
    process.exit(1);
  }

  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  ensureUsFreeWeeklyDbSchema(db);
  ensureRankSubjectsSchema(db);
  syncRankSubjects(db, subjects, appRow);
  console.log(`rank_subjects 已同步 ${subjects.length} 条（root=${appRow.internal_name}）`);

  const sections = [];
  const allCompact = [];

  for (const subject of subjects) {
    console.log(`\n=== ${subject.shortLabel} ===`);
    const oldRanks = await fetchRankMapForDate(db, subject, appRow, DATE_OLD, true);
    const newRanks = await fetchRankMapForDate(db, subject, appRow, DATE_NEW, true);

    const lines = subject.queries.map((q) => {
      const key = queryDimensionKey(q);
      return formatRankCompactLine(q, oldRanks[key], newRanks[key]);
    });
    const block = lines.join("\n");
    allCompact.push(`【${subject.shortLabel}】\n${block}`);
    sections.push({ subject, oldRanks, newRanks, lines });
  }

  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();

  const summaryText = allCompact.join("\n\n");
  const outBase = `competitors_daily_${productKey}_${DATE_OLD}_${DATE_NEW}`;
  const outPath = path.join(ROOT, "data", `${outBase}.txt`);
  fs.writeFileSync(outPath, summaryText, "utf-8");
  console.log(`\n简报已写: ${outPath}`);
  console.log(`数据库: ${dbPath}`);

  const jsonDump = {
    internal_name: appRow.internal_name,
    product_code: appRow.product_code || null,
    display_name: appRow.display_name || null,
    date_old: DATE_OLD,
    date_new: DATE_NEW,
    calendar_tz: tz,
    subjects: sections.map((s) => ({
      label: s.subject.shortLabel,
      internal_name: s.subject.appName,
      app_name: s.subject.appName,
      lines: s.lines,
    })),
  };
  fs.writeFileSync(path.join(ROOT, "data", `${outBase}.json`), JSON.stringify(jsonDump, null, 2), "utf-8");

  if (!flags.noFeishu && process.env.FEISHU_WEBHOOK_URL) {
    try {
      const compareBlock = buildCompareBlockFromSections(sections, appRow);
      const payload = buildFeishuCompareTableInteractiveCard(compareBlock, DATE_OLD, DATE_NEW);
      await sendFeishuPayload(process.env.FEISHU_WEBHOOK_URL, payload);
      console.log("飞书已发送（对比表卡片）");
    } catch (e) {
      console.error("飞书发送失败:", e.message);
      process.exitCode = 1;
    }
  } else if (!flags.noFeishu) {
    console.log("未配置 FEISHU_WEBHOOK_URL，跳过飞书（可用 --no-feishu 消除本提示）");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
