#!/usr/bin/env node
/**
 * fetch_app_ranks_workflow.js
 *
 * 拉取 data/appid_us.json 中所有产品在 US + Casual 品类 + 免费榜的历史排名
 * 输出 CSV：game_name, product_code, os, app_id, rank, date, chart_type
 *
 * 用法：
 *   node scripts/fetch_app_ranks_workflow.js 2026-03-22
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ---------- 配置 ----------
const APPID_US_JSON = path.join(__dirname, '..', 'data', 'appid_us.json');
const OUTPUT_CSV   = path.join(__dirname, '..', 'output', 'app_ranks_us_casual.csv');

// iOS: category=7003(Casual), chart=topfreeapplications
// Android: category=game_casual, chart=topselling_free
const IOS_CATEGORY    = '7003';
const IOS_CHART_TYPE = 'topfreeapplications';
const ANDROID_CATEGORY    = 'game_casual';
const ANDROID_CHART_TYPE  = 'topselling_free';

const BASE_URL = 'https://api.sensortower-china.com/v1';
const AUTH_TOKEN = process.env.SENSORTOWER_API_TOKEN;
const BATCH_SIZE = 20; // 每批最多传多少个 app_id，避免 URL 过长

if (!AUTH_TOKEN) {
  console.error('❌  未设置 SENSORTOWER_API_TOKEN 环境变量');
  process.exit(1);
}

// ---------- 工具函数 ----------
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON 解析失败: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 解析 graphData: [[timestamp, rank, null], ...]
// 返回 { date: 'YYYY-MM-DD', rank: number }
function parseGraphData(graphData) {
  const results = [];
  for (const [timestamp, rank] of graphData) {
    if (rank === null) continue;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    results.push({ date, rank });
  }
  return results;
}

// ---------- 核心逻辑 ----------

/**
 * 批量拉取一批 app_id 在指定平台/品类/国家/日期范围内的排名
 */
async function fetchBatchRanks(platform, appIds, category, chartType, country, startDate, endDate) {
  const params = new URLSearchParams({
    app_ids: appIds.join(','),
    category,
    chart_type_ids: chartType,
    countries: country,
    start_date: startDate,
    end_date: endDate,
  });
  const url = `${BASE_URL}/${platform}/category/category_history?${params.toString()}`;
  console.log(`  → API: ${platform} ${category} ${chartType} ${appIds.length} 个 app`);
  const data = await httpsGet(url);
  return data;
}

/**
 * 从 appid_us.json 加载产品列表，分别返回 ios 和 android 两个 id 列表
 */
function loadAppIds() {
  const raw = JSON.parse(fs.readFileSync(APPID_US_JSON, 'utf-8'));
  const iosApps = [];
  const androidApps = [];

  for (const app of raw) {
    if (app.apple_app_id) {
      iosApps.push({
        apple_app_id: app.apple_app_id,
        display_name: app.display_name,
        product_code: app.product_code || '',
      });
    }
    if (app.google_app_id) {
      androidApps.push({
        google_app_id: app.google_app_id,
        display_name: app.display_name,
        product_code: app.product_code || '',
      });
    }
  }
  return { iosApps, androidApps };
}

/**
 * 把 SensorTower 返回的 category_history 数据摊平为 CSV 行
 */
function flattenResults(rawData, platform, chartType, date) {
  const rows = [];
  for (const [appId, countriesData] of Object.entries(rawData)) {
    const usData = countriesData['US'];
    if (!usData) continue;

    for (const [catId, chartTypesData] of Object.entries(usData)) {
      const chartData = chartTypesData[chartType];
      if (!chartData) continue;

      const { name, graphData } = chartData;
      const rankEntries = parseGraphData(graphData || []);

      for (const { date: d, rank } of rankEntries) {
        rows.push({ app_id: appId, name, chart_type: chartType, date: d, rank, os: platform });
      }
    }
  }
  return rows;
}

// ---------- 主流程 ----------
async function main() {
  const targetDate = process.argv[2] || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  console.log(`\n📊  App 排名查询工作流 | 日期: ${targetDate}\n`);

  const { iosApps, androidApps } = loadAppIds();
  console.log(`共 ${iosApps.length} 个 iOS App，${androidApps.length} 个 Android App`);

  const allRows = [];
  const seen = new Set(); // {os}_{app_id}_{date} 去重

  const addRow = (row) => {
    const key = `${row.os}_${row.app_id}_${row.date}`;
    if (!seen.has(key)) {
      seen.add(key);
      allRows.push(row);
    }
  };

  // ---- iOS ----
  console.log('\n--- iOS (US / Casual / topfreeapplications) ---');
  for (let i = 0; i < iosApps.length; i += BATCH_SIZE) {
    const batch = iosApps.slice(i, i + BATCH_SIZE);
    try {
      const data = await fetchBatchRanks(
        'ios',
        batch.map(a => a.apple_app_id),
        IOS_CATEGORY,
        IOS_CHART_TYPE,
        'US',
        targetDate,
        targetDate
      );
      const rows = flattenResults(data, 'ios', IOS_CHART_TYPE, targetDate);
      // 匹配 display_name / product_code
      for (const row of rows) {
        const meta = batch.find(a => a.apple_app_id === row.app_id);
        if (meta) {
          row.display_name = meta.display_name;
          row.product_code = meta.product_code;
        }
        addRow(row);
      }
      console.log(`    成功 ${rows.length} 条`);
    } catch (e) {
      console.error(`    ❌ 批次 ${i / BATCH_SIZE + 1} 失败: ${e.message}`);
    }
    await sleep(500);
  }

  // ---- Android ----
  console.log('\n--- Android (US / Casual / topselling_free) ---');
  for (let i = 0; i < androidApps.length; i += BATCH_SIZE) {
    const batch = androidApps.slice(i, i + BATCH_SIZE);
    try {
      const data = await fetchBatchRanks(
        'android',
        batch.map(a => a.google_app_id),
        ANDROID_CATEGORY,
        ANDROID_CHART_TYPE,
        'US',
        targetDate,
        targetDate
      );
      const rows = flattenResults(data, 'android', ANDROID_CHART_TYPE, targetDate);
      for (const row of rows) {
        const meta = batch.find(a => a.google_app_id === row.app_id);
        if (meta) {
          row.display_name = meta.display_name;
          row.product_code = meta.product_code;
        }
        addRow(row);
      }
      console.log(`    成功 ${rows.length} 条`);
    } catch (e) {
      console.error(`    ❌ 批次 ${i / BATCH_SIZE + 1} 失败: ${e.message}`);
    }
    await sleep(500);
  }

  // ---- 写 CSV ----
  fs.mkdirSync(path.dirname(OUTPUT_CSV), { recursive: true });
  const headers = ['date', 'os', 'product_code', 'display_name', 'app_id', 'chart_type', 'rank'];
  const csvLines = [headers.join(',')];
  for (const r of allRows) {
    csvLines.push([
      r.date, r.os, `"${(r.product_code || '').replace(/"/g, '""')}"`,
      `"${(r.display_name || r.name || '').replace(/"/g, '""')}"`,
      r.app_id, r.chart_type, r.rank
    ].join(','));
  }
  fs.writeFileSync(OUTPUT_CSV, csvLines.join('\n'), 'utf-8');

  console.log(`\n✅  完成！共 ${allRows.length} 条排名记录`);
  console.log(`📄  输出: ${OUTPUT_CSV}`);
}

main().catch(e => { console.error(e); process.exit(1); });
