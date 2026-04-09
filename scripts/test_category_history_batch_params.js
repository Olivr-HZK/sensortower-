#!/usr/bin/env node
/**
 * 探测 SensorTower China category_history 哪些参数可批量，便于周报合并请求。
 * 用法：node scripts/test_category_history_batch_params.js
 * 环境：SENSORTOWER_API_TOKEN
 */

const https = require("https");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const HOST = "api.sensortower-china.com";

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

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "GET",
        headers: { Authorization: `Bearer ${process.env.SENSORTOWER_API_TOKEN}`, Connection: "close" },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          resolve({ status: res.statusCode || 0, body: data.slice(0, 8000) });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

function countAppKeys(jsonStr) {
  try {
    const o = JSON.parse(jsonStr);
    const d = o && o.data && typeof o.data === "object" ? o.data : o;
    if (!d || typeof d !== "object") return 0;
    return Object.keys(d).filter((k) => k !== "lines").length;
  } catch {
    return -1;
  }
}

async function main() {
  loadEnv(path.join(ROOT, ".env"));
  if (!process.env.SENSORTOWER_API_TOKEN) {
    console.error("缺少 SENSORTOWER_API_TOKEN");
    process.exit(1);
  }

  const date = "2026-03-30";
  const base = `https://${HOST}/v1/ios/category/category_history`;

  const cases = [
    {
      name: "单 app_id + 单 category + 单 chart",
      qs: {
        app_ids: "1492978794",
        category: "7012",
        chart_type_ids: "topfreeapplications",
        countries: "US",
        start_date: date,
        end_date: date,
      },
    },
    {
      name: "多 app_id（2 个均有该榜数据）同 category/chart",
      qs: {
        app_ids: "1492978794,1564391515",
        category: "7004",
        chart_type_ids: "topfreeapplications",
        countries: "US",
        start_date: date,
        end_date: date,
      },
    },
    {
      name: "多 app_id 同榜但部分无该品类数据时（响应里可能少于请求数）",
      qs: {
        app_ids: "1492978794,1510189987",
        category: "7012",
        chart_type_ids: "topfreeapplications",
        countries: "US",
        start_date: date,
        end_date: date,
      },
    },
    {
      name: "多 chart_type_ids（逗号）同 app",
      qs: {
        app_ids: "1492978794",
        category: "7012",
        chart_type_ids: "topfreeapplications,topfreeipadapplications",
        countries: "US",
        start_date: date,
        end_date: date,
      },
    },
    {
      name: "多 category（逗号）同 app",
      qs: {
        app_ids: "1492978794",
        category: "7012,7003",
        chart_type_ids: "topfreeapplications",
        countries: "US",
        start_date: date,
        end_date: date,
      },
    },
  ];

  for (const c of cases) {
    const u = `${base}?${new URLSearchParams(c.qs).toString()}`;
    try {
      const { status, body } = await get(u);
      const n = countAppKeys(body);
      console.log(`\n[${c.name}]`);
      console.log(`  HTTP ${status} · 顶层 app 键数量≈${n}`);
      if (status >= 400) console.log(`  body: ${body.slice(0, 400)}`);
    } catch (e) {
      console.log(`\n[${c.name}] ERROR ${e.message}`);
    }
  }

  console.log(`
结论（以实际 HTTP 为准）：
- 多 app_ids：iOS/Android 均可；同一 category+chart 下，响应只含「有该品类历史」的 app（缺键则按未上榜处理）。
- category 不支持逗号多值（常见 422 Invalid category）。
- chart_type_ids 逗号多值可能 200，但与周报逻辑无关（仍按单 chart 分组请求）。
- 周报脚本：仅合并「同 os+device+category+chart_type」下的 app_ids，每批最多 30 个。
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
