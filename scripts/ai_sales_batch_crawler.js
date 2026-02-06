#!/usr/bin/env node
/**
 * AI 竞品销量批量爬虫：从 ai_product.json 读取所有 AI 产品竞品，
 * 每批 10 个 app_id 请求 /v1/android/sales_report_estimates，
 * 获取上周一至上周日按周聚合的下载量与 revenue，写入 CSV。
 *
 * 运行：node ai_sales_batch_crawler.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://api.sensortower-china.com/v1';
const BATCH_SIZE = 10;
const DELAY_MS = 400;

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('请创建 .env 并配置 SENSORTOWER_API_TOKEN');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*SENSORTOWER_API_TOKEN\s*=\s*(.+)\s*$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  console.error('.env 中未找到 SENSORTOWER_API_TOKEN');
  process.exit(1);
}

/**
 * 从 ai_product.json 解析出所有产品：{ category, productName, appId }[]
 */
function loadProducts() {
  const p = path.join(__dirname, 'ai_product.json');
  if (!fs.existsSync(p)) {
    console.error('未找到 ai_product.json');
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  const list = [];
  for (const [category, group] of Object.entries(json)) {
    if (group && typeof group === 'object') {
      for (const [productName, appId] of Object.entries(group)) {
        list.push({ category, productName, appId: String(appId) });
      }
    }
  }
  if (list.length === 0) {
    console.error('ai_product.json 中未找到任何产品');
    process.exit(1);
  }
  return list;
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLastWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const currentMonday = new Date(today);
  currentMonday.setDate(currentMonday.getDate() - (day + 6) % 7);
  const lastMonday = new Date(currentMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastSunday.getDate() + 6);
  return { start: formatDate(lastMonday), end: formatDate(lastSunday) };
}

function buildQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('JSON 解析失败: ' + e.message));
          }
        });
      })
      .on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeCsvCell(s) {
  const str = String(s ?? '');
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function writeCsv(filePath, rows, headers) {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(','));
  }
  fs.writeFileSync(filePath, '\uFEFF' + lines.join('\n'), 'utf8');
}

function parseResponse(data) {
  let list = null;
  if (Array.isArray(data)) {
    list = data;
  } else if (data && data.sales_report_estimates_key) {
    const inner = data.sales_report_estimates_key;
    list = Array.isArray(inner) ? inner : (inner && inner.unified ? inner.unified : null);
  } else if (data && data.unified) {
    list = data.unified;
  } else if (data && data.lines) {
    list = data.lines;
  }
  if (!list || !Array.isArray(list)) return [];
  return list.map((item) => ({
    app_id: item.app_id || item.aid || '',
    country: item.country || item.c || item.cc || '',
    date: item.date || item.d || '',
    android_units: item.android_units ?? item.u ?? '',
    android_revenue: item.android_revenue ?? item.r ?? '',
  }));
}

/**
 * 将产品列表按每批 BATCH_SIZE 个分组
 */
function chunkProducts(products, size) {
  const chunks = [];
  for (let i = 0; i < products.length; i += size) {
    chunks.push(products.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  const authToken = loadEnv();
  const products = loadProducts();
  const { start, end } = getLastWeekRange();

  const appIdToProduct = new Map();
  for (const p of products) {
    appIdToProduct.set(p.appId, { category: p.category, productName: p.productName });
  }

  const batches = chunkProducts(products, BATCH_SIZE);
  console.log('竞品总数:', products.length);
  console.log('批次数（每批', BATCH_SIZE, '个）:', batches.length);
  console.log('查询区间（上周一 ~ 上周日）:', start, '->', end);

  const headers = [
    'product_name',
    'category',
    'app_id',
    'country',
    'date',
    'android_units',
    'android_revenue',
  ];
  const allRows = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const appIdsStr = batch.map((p) => p.appId).join(',');
    const names = batch.map((p) => p.productName).join(', ');
    console.log(`[${i + 1}/${batches.length}] 请求 ${batch.length} 个 app: ${names}`);

    const params = {
      app_ids: appIdsStr,
      date_granularity: 'weekly',
      start_date: start,
      end_date: end,
      data_model: 'DM_2025_Q2',
      auth_token: authToken,
    };
    const url = `${BASE_URL}/android/sales_report_estimates?${buildQuery(params)}`;

    try {
      const data = await fetchJson(url);
      const rows = parseResponse(data);
      for (const r of rows) {
        const appId = r.app_id || '';
        const info = appIdToProduct.get(appId);
        allRows.push({
          product_name: info ? info.productName : '',
          category: info ? info.category : '',
          app_id: appId,
          country: r.country,
          date: r.date,
          android_units: r.android_units,
          android_revenue: r.android_revenue,
        });
      }
      console.log('  -> 本批返回', rows.length, '条');
    } catch (err) {
      console.error('  -> 请求失败:', err.message);
    }

    if (i < batches.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const outPath = path.join(__dirname, 'ai_sales_batch_crawler.csv');
  writeCsv(outPath, allRows, headers);
  console.log('\n已写入:', outPath, '总行数:', allRows.length);

  // 根据 app_id 生成报告中的产品 URL（Google Play），并写回竞品动态报告
  const reportPath = path.join(__dirname, '竞品动态报告_AI销售.md');
  if (fs.existsSync(reportPath)) {
    const productNameToAppId = new Map(products.map((p) => [p.productName, p.appId]));
    const GOOGLE_PLAY_BASE = 'https://play.google.com/store/apps/details?id=';
    let report = fs.readFileSync(reportPath, 'utf8');
    let currentProductName = null;
    const reportLines = report.split('\n');
    for (let i = 0; i < reportLines.length; i++) {
      const line = reportLines[i];
      const headerMatch = line.match(/^### \d+\. (.+)$/);
      if (headerMatch) {
        currentProductName = headerMatch[1].trim();
      }
      if (currentProductName && line.includes('**视频**：')) {
        const appId = productNameToAppId.get(currentProductName) || '';
        const url = appId ? GOOGLE_PLAY_BASE + appId : '';
        reportLines[i] = line.replace(/- \*\*视频\*\*：.+/, `- **视频**：${url}`);
      }
    }
    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
    console.log('已更新报告中的产品 URL:', reportPath);
  }
}

main().catch((err) => {
  console.error('执行失败:', err.message);
  process.exit(1);
});
