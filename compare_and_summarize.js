const fs = require("fs");
const https = require("https");
const initSqlJs = require("sql.js");
const { getRankFromData } = require("./arrow_madness_rank_parse.js");
const { walkFeishuInteractivePayload } = require("./scripts/feishu_shrink_inline_images.js");

const ROOT = __dirname.includes("scripts") ? require("path").join(__dirname, "..") : __dirname;

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

loadEnv(require("path").join(ROOT, ".env"));

const API_TOKEN = process.env.SENSORTOWER_API_TOKEN;

/** 相对「今天」的上周日（若今天是周日则取再往前一周周日，便于周报） */
function getLastSunday(d = new Date()) {
  const day = d.getDay();
  const daysBack = day === 0 ? 7 : day;
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysBack);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dayNum = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayNum}`;
}

function addDays(ymd, delta) {
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// 上周日 = DATE_NEW，上上周日 = DATE_OLD（忽略 --feishu-preview）
let DATE_NEW;
let DATE_OLD;
const _arg2 = process.argv[2];
const _arg3 = process.argv[3];
if (_arg2 && _arg2 !== "--feishu-preview" && /^\d{4}-\d{2}-\d{2}$/.test(_arg2.trim())) {
  DATE_NEW = _arg2.trim();
  DATE_OLD =
    _arg3 && _arg3 !== "--feishu-preview" && /^\d{4}-\d{2}-\d{2}$/.test(_arg3.trim())
      ? _arg3.trim()
      : addDays(DATE_NEW, -7);
} else {
  DATE_NEW = getLastSunday();
  DATE_OLD = addDays(DATE_NEW, -7);
}

const QUERIES = [
  { os: "ios", app_ids: ["6756872090"], category: "6014", chart_type_ids: ["topfreeapplications"], device: "iphone", category_name: "Games" },
  { os: "ios", app_ids: ["6756872090"], category: "7003", chart_type_ids: ["topfreeapplications"], device: "iphone", category_name: "Games/Casual" },
  { os: "ios", app_ids: ["6756872090"], category: "7012", chart_type_ids: ["topfreeapplications"], device: "iphone", category_name: "Games/Puzzle" },
  { os: "ios", app_ids: ["6756872090"], category: "6014", chart_type_ids: ["topfreeipadapplications"], device: "ipad", category_name: "Games" },
  { os: "ios", app_ids: ["6756872090"], category: "7003", chart_type_ids: ["topfreeipadapplications"], device: "ipad", category_name: "Games/Casual" },
  { os: "ios", app_ids: ["6756872090"], category: "7012", chart_type_ids: ["topfreeipadapplications"], device: "ipad", category_name: "Games/Puzzle" },
  { os: "android", app_ids: ["com.arrow.madness.games.arrows.escape.puzzle.game"], category: "game", chart_type_ids: ["topselling_free"], device: "android", category_name: "Game" },
  { os: "android", app_ids: ["com.arrow.madness.games.arrows.escape.puzzle.game"], category: "game_casual", chart_type_ids: ["topselling_free"], device: "android", category_name: "Game/Casual" },
  { os: "android", app_ids: ["com.arrow.madness.games.arrows.escape.puzzle.game"], category: "game_puzzle", chart_type_ids: ["topselling_free"], device: "android", category_name: "Game/Puzzle" },
];

const APP_NAME = "Arrow Madness";
const COUNTRY = "US";
const DB_PATH = require("path").join(ROOT, "data", "arrow_madness.db");

const SENSORTOWER_API_HOST = "api.sensortower-china.com";

function callCategoryHistoryApi(q, date) {
  return new Promise((resolve) => {
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
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.setTimeout(30000, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

function sendFeishuMessage(webhookUrl, cardPayload) {
  walkFeishuInteractivePayload(cardPayload);
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const body = JSON.stringify(cardPayload);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
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
          else reject(new Error(`Feishu error: ${data.slice(0, 200)}`));
        } catch (e) {
          reject(new Error(`Feishu parse error: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Feishu timeout"));
    });
    req.write(body);
    req.end();
  });
}

const IOS_STORE_URL = "https://apps.apple.com/sg/app/arrow-madness-tap-arrows-away/id6756872090";
const ANDROID_STORE_URL = "https://play.google.com/store/apps/details?id=com.arrow.madness.games.arrows.escape.puzzle.game&gl=US";
const ST_URL = "https://app.sensortower.com/p/apple/apps/6756872090";

/** 飞书交互卡片：plain_text + fields；链接区单独用 markdown 的 [文字](url) 以实现可点击 */
function buildFeishuCardPlain(dateOld, dateNew, llmText) {
  const elements = [];

  function pushPlain(text) {
    const chunks = chunkText(text, 1800);
    for (const c of chunks) {
      elements.push({
        tag: "div",
        text: { tag: "plain_text", content: c },
      });
    }
  }

  // 顶部：游戏名 + 双列关键信息
  elements.push({
    tag: "div",
    text: {
      tag: "plain_text",
      content: "🎮 Arrow Madness: Tap Arrows Away",
    },
  });
  elements.push({
    tag: "div",
    text: {
      tag: "plain_text",
      content: "📍 美国 US · 免费榜 · 周日环比（上上周日 → 上周日）",
    },
  });
  elements.push({
    tag: "div",
    fields: [
      {
        is_short: true,
        text: {
          tag: "plain_text",
          content: `上上周日\n${dateOld}`,
        },
      },
      {
        is_short: true,
        text: {
          tag: "plain_text",
          content: `上周日\n${dateNew}`,
        },
      },
    ],
  });

  elements.push({ tag: "hr" });

  // 可点击链接：飞书卡片需用 markdown 的 [文字](url)
  elements.push({
    tag: "markdown",
    content: [
      "🔗 商店与数据（点击打开）",
      "",
      `[📱 App Store（iOS）](${IOS_STORE_URL})`,
      `[🤖 Google Play（Android）](${ANDROID_STORE_URL})`,
      `[📊 SensorTower 应用页](${ST_URL})`,
    ].join("\n"),
  });

  elements.push({ tag: "hr" });

  elements.push({
    tag: "div",
    text: { tag: "plain_text", content: "📋 排名变化（上上周日→上周日）" },
  });

  // 每行一条，或整段换行
  const lines = (llmText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    pushPlain("（无数据）");
  } else {
    pushPlain(lines.join("\n"));
  }

  elements.push({ tag: "hr" });
  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: `SensorTower Ranking Bot · ${new Date().toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          hour12: false,
        })}`,
      },
    ],
  });

  return {
    msg_type: "interactive",
    card: {
      config: {
        wide_screen_mode: true,
        enable_forward: true,
      },
      header: {
        template: "turquoise",
        title: {
          tag: "plain_text",
          content: `周日榜周报  ${dateOld}  →  ${dateNew}`,
        },
        subtitle: {
          tag: "plain_text",
          content: "Arrow Madness · US Free Charts",
        },
      },
      elements,
    },
  };
}

function chunkText(s, maxLen) {
  if (!s) return [""];
  const out = [];
  let i = 0;
  while (i < s.length) {
    out.push(s.slice(i, i + maxLen));
    i += maxLen;
  }
  return out;
}

/** 例：ios-游戏-解谜：250-241（+9），数字小为名次更靠前；+ 表示名次上升 */
function rankCompactLabel(q) {
  const plat = q.os === "ios" ? (q.device === "iphone" ? "ios" : "ipad") : "android";
  let sub = "总榜";
  if (q.category === "7003" || q.category === "game_casual") sub = "休闲";
  if (q.category === "7012" || q.category === "game_puzzle") sub = "解谜";
  return `${plat}-游戏-${sub}`;
}

function formatRankCompactLine(q, o, n) {
  const label = rankCompactLabel(q);
  if (o == null && n == null) return `${label}：未上榜-未上榜（持平）`;
  if (o == null && n != null) return `${label}：未上榜-${n}（新上榜）`;
  if (o != null && n == null) return `${label}：${o}-未上榜（跌出）`;
  if (o === n) return `${label}：${o}-${n}（0）`;
  const diff = o - n;
  const paren = diff > 0 ? `+${diff}` : `${diff}`;
  return `${label}：${o}-${n}（${paren}）`;
}

function buildRankCompactLines(oldRanks, newRanks) {
  return QUERIES.map((q) => {
    const key = `${q.os}|${q.device}|${q.category}`;
    return formatRankCompactLine(q, oldRanks[key], newRanks[key]);
  }).join("\n");
}

async function fetchAndSave(sqlDb, dateStr) {
  const results = {};
  for (const q of QUERIES) {
    const key = `${q.os}|${q.device}|${q.category}`;
    const stmt = sqlDb.prepare(
      `SELECT rank FROM app_ranks WHERE app_name = ? AND country = ? AND platform = ? AND device = ? AND chart_type = ? AND category = ? AND app_id = ? AND rank_date = ?`
    );
    stmt.bind([APP_NAME, COUNTRY, q.os, q.device, q.chart_type_ids[0], q.category, q.app_ids[0], dateStr]);
    let rank = null;
    let fromDb = false;
    if (stmt.step()) {
      const row = stmt.get();
      rank = row[0];
      fromDb = true;
    }
    stmt.free();

    if (fromDb) {
      process.stdout.write(` [DB] ${q.device}/${q.category_name}: `);
      console.log(rank !== null ? `#${rank}` : "未上榜");
    } else {
      process.stdout.write(` [API] ${q.device}/${q.category_name}: `);
      const data = await callCategoryHistoryApi(q, dateStr);
      rank = data ? getRankFromData(data, q, dateStr) : null;
      sqlDb.run(
        `INSERT OR REPLACE INTO app_ranks (app_name, country, platform, device, chart_type, category, category_name, app_id, rank_date, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [APP_NAME, COUNTRY, q.os, q.device, q.chart_type_ids[0], q.category, q.category_name, q.app_ids[0], dateStr, rank]
      );
      console.log(rank !== null ? `#${rank}` : "未上榜");
    }

    results[key] = rank;
  }
  return results;
}

async function main() {
  const FEISHU_WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL;

  if (!API_TOKEN) {
    console.error("缺少环境变量 SENSORTOWER_API_TOKEN");
    process.exit(1);
  }

  console.log(`周日周报对比：上上周日 ${DATE_OLD} → 上周日 ${DATE_NEW}\n`);

  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
    db.run(
      `CREATE TABLE IF NOT EXISTS app_ranks (id INTEGER PRIMARY KEY AUTOINCREMENT, app_name TEXT NOT NULL, country VARCHAR(2) NOT NULL, platform VARCHAR(16) NOT NULL, device VARCHAR(16) NOT NULL, chart_type VARCHAR(32) NOT NULL, category VARCHAR(32) NOT NULL, category_name VARCHAR(64) NOT NULL, app_id VARCHAR(128) NOT NULL, rank_date DATE NOT NULL, rank INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE (app_name, country, platform, device, chart_type, category, app_id, rank_date));`
    );
  }

  db.run(
    `CREATE TABLE IF NOT EXISTS summaries (id INTEGER PRIMARY KEY AUTOINCREMENT, app_name TEXT NOT NULL, country VARCHAR(2) NOT NULL, date_from DATE NOT NULL, date_to DATE NOT NULL, comparison_text TEXT NOT NULL, summary TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`
  );
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  console.log(`=== ${DATE_OLD}（上上周日）===`);
  const oldRanks = await fetchAndSave(db, DATE_OLD);

  console.log(`\n=== ${DATE_NEW}（上周日）===`);
  const newRanks = await fetchAndSave(db, DATE_NEW);

  let comparisonText = `| 平台 | 设备 | 类别 | ${DATE_OLD} | ${DATE_NEW} | 变化 |\n|--------|------|------|------------|------------|------|\n`;

  for (const q of QUERIES) {
    const key = `${q.os}|${q.device}|${q.category}`;
    const oldRank = oldRanks[key];
    const newRank = newRanks[key];
    let change = "-";

    if (oldRank === null && newRank === null) change = "持续未上榜";
    else if (oldRank === null && newRank !== null) change = `新上榜 (#${newRank})`;
    else if (oldRank !== null && newRank === null) change = `跌出榜单 (原#${oldRank})`;
    else {
      const diff = oldRank - newRank;
      if (diff > 0) change = `↑ ${diff} (${oldRank} → #${newRank})`;
      else if (diff < 0) change = `↓ ${Math.abs(diff)} (${oldRank} → #${newRank})`;
      else change = `持平 (${oldRank})`;
    }

    comparisonText += `| ${q.os} | ${q.device} | ${q.category_name} | ${oldRank !== null ? "#" + oldRank : "-"} | ${newRank !== null ? "#" + newRank : "-"} | ${change} |\n`;
  }

  const compactLines = buildRankCompactLines(oldRanks, newRanks);
  console.log("\n" + compactLines + "\n");

  const summary = compactLines;

  db.run(
    `INSERT INTO summaries (app_name, country, date_from, date_to, comparison_text, summary) VALUES (?, ?, ?, ?, ?, ?)`,
    [APP_NAME, COUNTRY, DATE_OLD, DATE_NEW, comparisonText + "\n\n" + compactLines, summary]
  );

  const summaryPath = require("path").join(ROOT, "data", `arrow_madness_summary_${DATE_OLD}_${DATE_NEW}.txt`);
  fs.writeFileSync(summaryPath, summary, "utf-8");
  console.log(`排名简报已保存: ${summaryPath}`);

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  db.close();

  if (FEISHU_WEBHOOK_URL) {
    try {
      const card = buildFeishuCardPlain(DATE_OLD, DATE_NEW, summary);
      await sendFeishuMessage(FEISHU_WEBHOOK_URL, card);
      console.log("\n飞书推送成功");
    } catch (e) {
      console.error("\n飞书推送失败:", e.message);
    }
  }

  console.log(`\n数据库已更新: ${DB_PATH}`);
}

/** 仅推送飞书卡片（不拉数、不调 LLM），用于预览样式 */
async function feishuPreviewOnly() {
  const path = require("path");
  const FEISHU_WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL;
  if (!FEISHU_WEBHOOK_URL) {
    console.error("请配置 FEISHU_WEBHOOK_URL");
    process.exit(1);
  }

  const argDateNew = process.argv[3];
  const argDateOld = process.argv[4];
  let dateNew;
  let dateOld;
  if (argDateNew && /^\d{4}-\d{2}-\d{2}$/.test(argDateNew.trim())) {
    dateNew = argDateNew.trim();
    dateOld = argDateOld && /^\d{4}-\d{2}-\d{2}$/.test(argDateOld.trim())
      ? argDateOld.trim()
      : addDays(dateNew, -7);
  } else {
    dateNew = getLastSunday();
    dateOld = addDays(dateNew, -7);
  }

  const summaryGlob = path.join(ROOT, "data", `arrow_madness_summary_${dateOld}_${dateNew}.txt`);
  let bodyText =
    "ios-游戏-解谜：250-241（+9）\n【预览】若存在同日期简报文件将自动替换。";
  if (fs.existsSync(summaryGlob)) {
    bodyText = fs.readFileSync(summaryGlob, "utf-8");
    console.log(`已载入简报: ${summaryGlob}`);
  } else {
    console.log(`未找到 ${summaryGlob}，使用示例占位`);
  }

  const card = buildFeishuCardPlain(dateOld, dateNew, bodyText);
  await sendFeishuMessage(FEISHU_WEBHOOK_URL, card);
  console.log(`\n飞书预览已发送（${dateOld} → ${dateNew}）`);
}

if (process.argv[2] === "--feishu-preview") {
  feishuPreviewOnly().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  main();
}
