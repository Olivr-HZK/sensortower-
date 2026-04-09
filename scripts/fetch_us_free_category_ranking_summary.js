#!/usr/bin/env node
/**
 * 调用 GET /v1/{os}/category/category_ranking_summary?app_id=&country=US
 * 为 data/appid_us.json 中每个产品写入美国免费榜下的品类/分榜情况。
 *
 * 用法：node scripts/fetch_us_free_category_ranking_summary.js
 * 环境：SENSORTOWER_API_TOKEN
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const APPID_US_JSON = path.join(ROOT, "data", "appid_us.json");

const BASE_HOST = "api.sensortower-china.com";

/** iOS 接口当前返回均为免费分榜；仍按白名单过滤 */
const IOS_FREE_CHART = new Set(["topfreeapplications", "topfreeipadapplications"]);
/** Android：免费榜为 topselling_free（与仓库内其它脚本一致） */
const ANDROID_FREE_CHART = new Set(["topselling_free"]);

const IOS_CATEGORY_NAMES = {
  6014: "Games",
  7003: "Games/Casual",
  7012: "Games/Puzzle",
  7004: "Games/Board",
  6016: "Entertainment",
  6024: "Shopping",
  6000: "Business",
};

const ANDROID_CATEGORY_NAMES = {
  game: "Game",
  game_casual: "Game/Casual",
  game_puzzle: "Game/Puzzle",
  game_board: "Game/Board",
  game_arcade: "Game/Arcade",
  game_action: "Game/Action",
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpsGetJson(hostname, pathname) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname,
      path: pathname,
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.SENSORTOWER_API_TOKEN}`,
        Connection: "close",
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(90000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

function iosCategoryName(id) {
  const n = typeof id === "number" ? id : parseInt(String(id), 10);
  return IOS_CATEGORY_NAMES[n] || `category_${id}`;
}

function androidCategoryName(id) {
  const s = String(id);
  return ANDROID_CATEGORY_NAMES[s] || s;
}

function enrichIosRow(r) {
  const chartType = r.chart_type_id;
  const device = chartType === "topfreeipadapplications" ? "ipad" : "iphone";
  const cid = r.category_id;
  return {
    chart_type_id: chartType,
    category_id: cid,
    category_name: iosCategoryName(cid),
    rank: r.rank,
    chart_device: device,
  };
}

function enrichAndroidRow(r) {
  const cid = r.category_id;
  return {
    chart_type_id: r.chart_type_id,
    category_id: cid,
    category_name: androidCategoryName(cid),
    rank: r.rank,
  };
}

async function fetchIosSummary(appId) {
  const q = new URLSearchParams({ app_id: String(appId), country: "US" });
  const raw = await httpsGetJson(BASE_HOST, `/v1/ios/category/category_ranking_summary?${q}`);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => IOS_FREE_CHART.has(r.chart_type_id))
    .map(enrichIosRow);
}

async function fetchAndroidSummary(appId) {
  const q = new URLSearchParams({ app_id: String(appId), country: "US" });
  const raw = await httpsGetJson(BASE_HOST, `/v1/android/category/category_ranking_summary?${q}`);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => ANDROID_FREE_CHART.has(r.chart_type_id))
    .map(enrichAndroidRow);
}

async function main() {
  loadEnv(path.join(ROOT, ".env"));
  if (!process.env.SENSORTOWER_API_TOKEN) {
    console.error("请设置 SENSORTOWER_API_TOKEN");
    process.exit(1);
  }

  const list = JSON.parse(fs.readFileSync(APPID_US_JSON, "utf-8"));
  const iosCache = new Map();
  const androidCache = new Map();

  const uniqueIos = [...new Set(list.map((r) => r.apple_app_id).filter(Boolean).map(String))];
  const uniqueAnd = [...new Set(list.map((r) => r.google_app_id).filter(Boolean).map(String))];

  console.log(`唯一 iOS app_id: ${uniqueIos.length}，唯一 Android app_id: ${uniqueAnd.length}`);

  const delayMs = 450;

  for (let i = 0; i < uniqueIos.length; i++) {
    const id = uniqueIos[i];
    if (i > 0) await sleep(delayMs);
    process.stdout.write(`[iOS] ${id} ... `);
    try {
      const charts = await fetchIosSummary(id);
      iosCache.set(id, charts);
      console.log(`${charts.length} 条免费分榜`);
    } catch (e) {
      iosCache.set(id, { _error: e.message });
      console.log(`失败: ${e.message}`);
    }
  }

  for (let i = 0; i < uniqueAnd.length; i++) {
    const id = uniqueAnd[i];
    if (i > 0) await sleep(delayMs);
    process.stdout.write(`[Android] ${id.slice(0, 40)}... `);
    try {
      const charts = await fetchAndroidSummary(id);
      androidCache.set(id, charts);
      console.log(`${charts.length} 条免费分榜`);
    } catch (e) {
      androidCache.set(id, { _error: e.message });
      console.log(`失败: ${e.message}`);
    }
  }

  const fetchedAt = new Date().toISOString();

  for (const row of list) {
    const iosKey = row.apple_app_id != null ? String(row.apple_app_id) : null;
    const andKey = row.google_app_id != null ? String(row.google_app_id) : null;

    let iosVal = null;
    if (iosKey) {
      const v = iosCache.get(iosKey);
      if (v && v._error) iosVal = { _error: v._error, fetched_at: fetchedAt };
      else iosVal = { charts: v || [], fetched_at: fetchedAt };
    }

    let andVal = null;
    if (andKey) {
      const v = androidCache.get(andKey);
      if (v && v._error) andVal = { _error: v._error, fetched_at: fetchedAt };
      else andVal = { charts: v || [], fetched_at: fetchedAt };
    }

    row.us_free_category_ranking_summary = {
      country: "US",
      ios: iosVal,
      android: andVal,
    };
  }

  fs.writeFileSync(APPID_US_JSON, JSON.stringify(list, null, 4) + "\n", "utf-8");
  console.log(`\n已写入: ${APPID_US_JSON}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
