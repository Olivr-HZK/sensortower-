const fs = require("fs");
const https = require("https");
const initSqlJs = require("sql.js");
const { getRankFromData } = require("./arrow_madness_rank_parse.js");

// 从 .env 文件加载环境变量
function loadEnv(path) {
  const lines = fs.readFileSync(path, "utf-8").split("\n");
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

loadEnv("/Users/oliver/guru/sensortower/.env");

const API_TOKEN = process.env.SENSORTOWER_API_TOKEN;

// 命令行参数：node fetch_app_ranks.js 2026-03-22
const DATE = process.argv[2] || "2026-03-22";

const QUERIES = [
  // iPhone
  { os: "ios", app_ids: ["6756872090"],                             category: "6014", chart_type_ids: ["topfreeapplications"],    device: "iphone", category_name: "Games" },
  { os: "ios", app_ids: ["6756872090"],                             category: "7003", chart_type_ids: ["topfreeapplications"],    device: "iphone", category_name: "Games/Casual" },
  { os: "ios", app_ids: ["6756872090"],                             category: "7012", chart_type_ids: ["topfreeapplications"],    device: "iphone", category_name: "Games/Puzzle" },
  // iPad
  { os: "ios", app_ids: ["6756872090"],                             category: "6014", chart_type_ids: ["topfreeipadapplications"], device: "ipad",   category_name: "Games" },
  { os: "ios", app_ids: ["6756872090"],                             category: "7003", chart_type_ids: ["topfreeipadapplications"], device: "ipad",   category_name: "Games/Casual" },
  { os: "ios", app_ids: ["6756872090"],                             category: "7012", chart_type_ids: ["topfreeipadapplications"], device: "ipad",   category_name: "Games/Puzzle" },
  // Android
  { os: "android", app_ids: ["com.arrow.madness.games.arrows.escape.puzzle.game"], category: "game",       chart_type_ids: ["topselling_free"], device: "android", category_name: "Game" },
  { os: "android", app_ids: ["com.arrow.madness.games.arrows.escape.puzzle.game"], category: "game_casual", chart_type_ids: ["topselling_free"], device: "android", category_name: "Game/Casual" },
  { os: "android", app_ids: ["com.arrow.madness.games.arrows.escape.puzzle.game"], category: "game_puzzle", chart_type_ids: ["topselling_free"], device: "android", category_name: "Game/Puzzle" },
];

const APP_NAME = "Arrow Madness";
const COUNTRY = "US";
const DB_PATH = "/Users/oliver/guru/sensortower/data/arrow_madness.db";

/** 与国内网络环境一致，使用 China 接入点（与仓库内 fetch_top100 等脚本一致） */
const SENSORTOWER_API_HOST = "api.sensortower-china.com";

/** 单次连接易遇 socket hang up；禁用 keep-alive，每次新连接 */
const httpsAgent = new https.Agent({ keepAlive: false, maxSockets: 1 });

const REQUEST_TIMEOUT_MS = 90000;
const MAX_RETRIES = 6;
const BETWEEN_QUERIES_MS = 600;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function callCategoryHistoryApiOnce(q) {
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
      start_date: DATE,
      end_date: DATE,
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

async function callCategoryHistoryApi(q) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const data = await callCategoryHistoryApiOnce(q);
    if (data !== null) return data;
    if (attempt < MAX_RETRIES) {
      const backoff = Math.min(2500 * 2 ** (attempt - 1), 45000);
      console.error(`       → 第 ${attempt}/${MAX_RETRIES} 次失败，${Math.round(backoff / 1000)}s 后重试...`);
      await sleep(backoff);
    }
  }
  return null;
}

async function main() {
  if (!API_TOKEN) {
    console.error("请先设置环境变量 SENSORTOWER_API_TOKEN");
    process.exit(1);
  }

  console.log(`查询日期: ${DATE}\n`);

  const SQL = await initSqlJs();
  let db;

  if (fs.existsSync(DB_PATH)) {
    const fileBuf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuf);
  } else {
    db = new SQL.Database();
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
  }

  const results = [];

  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    if (i > 0) await sleep(BETWEEN_QUERIES_MS);
    const label = `${q.device}/${q.category_name}`;
    process.stdout.write(`查询: ${label} ... `);

    const data = await callCategoryHistoryApi(q);
    const rank = data ? getRankFromData(data, q, DATE) : null;

    const record = {
      app_name: APP_NAME,
      country: COUNTRY,
      rank_date: DATE,
      platform: q.os,
      device: q.device,
      chart_type: q.chart_type_ids[0],
      category: q.category,
      category_name: q.category_name,
      app_ids: q.app_ids,
      rank: rank,
    };

    db.run(
      `
      INSERT OR REPLACE INTO app_ranks
        (app_name, country, platform, device, chart_type, category, category_name, app_id, rank_date, rank)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        record.app_name,
        record.country,
        record.platform,
        record.device,
        record.chart_type,
        record.category,
        record.category_name,
        record.app_ids[0],
        record.rank_date,
        record.rank,
      ]
    );

    results.push(record);
    console.log(rank !== null ? `#${rank}` : "未上榜");
  }

  // 持久化数据库
  const buf = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, buf);
  db.close();

  // 保存 JSON
  const jsonPath = `/Users/oliver/guru/sensortower/data/arrow_madness_ranks_${DATE}.json`;
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf-8");

  console.log(`\n数据库: ${DB_PATH}`);
  console.log(`JSON: ${jsonPath}`);
}

main();
